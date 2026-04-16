import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

async function cancelCouponsForOrders(supabase: SupabaseClient, orderIds: string[]) {
  if (orderIds.length === 0) return
  const { error } = await supabase
    .from('coupons')
    .update({ status: 'cancelled' })
    .in('issued_from_order_id', orderIds)
    .eq('status', 'active')
  if (error) console.warn('[cancelCouponsForOrders]', error)
}

async function restoreAppliedCouponIfPossible(supabase: SupabaseClient, couponId: string) {
  const { error } = await supabase
    .from('coupons')
    .update({ status: 'active', used_at: null, used_payment_id: null })
    .eq('id', couponId)
    .eq('status', 'used')
    .gt('expires_at', new Date().toISOString())
  if (error) console.warn('[restoreAppliedCouponIfPossible]', error)
}

/**
 * 부스 단위 주문 거절 + 부분 환불.
 *
 * 환경변수 — api/payments/cancel.ts 와 동일.
 *
 * 호출:
 *   POST /api/orders/cancel
 *   { orderId: string, reason: string }
 *
 * 흐름:
 *   1) order + parent payment 조회
 *   2) 적격성 검증
 *      - order.status in ('paid','confirmed')
 *      - order.ready_at IS NULL  ← 조리완료된 주문은 거절 불가
 *      - payment.status='paid' AND payment.payment_key NOT NULL
 *   3) 환불액 = min(order.subtotal, payment.total_amount - payment.refunded_amount)
 *      쿠폰 할인은 운영자 부담이라 영업점은 subtotal 그대로 환불 (비율 분배 아님).
 *      단 큰 쿠폰으로 결제 잔액이 subtotal 보다 작을 수 있어 cap 적용.
 *   4) Toss /v1/payments/{paymentKey}/cancel 부분 환불 (cancelAmount)
 *   5) DB 업데이트
 *      - orders 해당 row: status='cancelled', cancelled_at, cancel_reason, cancelled_by='booth'
 *      - payments: refunded_amount += refund_amount
 *      - 누적 refunded_amount >= total_amount → payments.status='cancelled', cancelled_at
 *   6) 200 응답
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { orderId, reason } = (req.body ?? {}) as {
    orderId?: string
    reason?: string
  }

  if (!orderId || !reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'orderId, reason are required' })
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!secretKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error:
        'Server is missing TOSS_SECRET_KEY / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1) order 조회
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select()
    .eq('id', orderId)
    .maybeSingle()
  if (oErr) return res.status(500).json({ error: `order 조회 실패: ${oErr.message}` })
  if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다' })

  // 2) 적격성
  //    cook  — 조리 완료(ready_at)된 주문은 거절 불가
  //    instant — 자동 completed 이므로 status/ready_at 무관하게 취소 허용
  const isInstant = order.order_type === 'instant'
  if (!isInstant && order.ready_at !== null) {
    return res.status(409).json({
      error: '이미 조리 완료된 주문은 거절할 수 없습니다',
      code: 'ORDER_ALREADY_READY',
    })
  }
  const cancellable = isInstant
    ? ['paid', 'confirmed', 'completed']
    : ['paid', 'confirmed']
  if (!cancellable.includes(order.status)) {
    return res.status(409).json({
      error: `거절 불가 상태 (${order.status})`,
      code: 'ORDER_NOT_CANCELLABLE',
    })
  }

  // payment 조회
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select()
    .eq('id', order.payment_id)
    .maybeSingle()
  if (pErr) return res.status(500).json({ error: `payment 조회 실패: ${pErr.message}` })
  if (!payment) return res.status(404).json({ error: '결제 정보를 찾을 수 없습니다' })

  if (payment.status !== 'paid') {
    return res.status(400).json({
      error: `결제가 ${payment.status} 상태라 환불할 수 없습니다`,
    })
  }
  if (!payment.payment_key) {
    return res.status(400).json({ error: 'payment_key 가 없습니다' })
  }

  // 3) 환불액 — order.subtotal 을 cap 적용
  const remaining = payment.total_amount - (payment.refunded_amount ?? 0)
  if (remaining <= 0) {
    return res.status(400).json({ error: '이미 전액 환불된 결제입니다' })
  }
  const refundAmount = Math.min(order.subtotal, remaining)

  // 4) Toss 부분 환불
  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
  let tossJson: unknown
  try {
    const tossResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(payment.payment_key)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancelReason: reason.trim(),
          cancelAmount: refundAmount,
        }),
      },
    )
    tossJson = await tossResponse.json()
    if (!tossResponse.ok) {
      return res.status(tossResponse.status).json(tossJson)
    }
  } catch (err) {
    return res.status(502).json({
      error: 'Toss cancel API 호출 실패',
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 5) DB 업데이트
  const now = new Date().toISOString()

  // (a) orders 해당 row → cancelled
  const { error: updOErr } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: reason.trim(),
      cancelled_by: 'booth',
    })
    .eq('id', orderId)
  if (updOErr) {
    return res.status(500).json({
      error: `Toss 환불은 성공했으나 order 업데이트 실패: ${updOErr.message}`,
      tossResult: tossJson,
    })
  }

  // (b) payments → refunded_amount += refundAmount
  //     누적 refunded_amount 가 total_amount 에 도달하면 status='cancelled'
  const newRefundedTotal = (payment.refunded_amount ?? 0) + refundAmount
  const reachedFull = newRefundedTotal >= payment.total_amount

  const updatePayload: Record<string, unknown> = {
    refunded_amount: newRefundedTotal,
  }
  if (reachedFull) {
    updatePayload.status = 'cancelled'
    updatePayload.cancelled_at = now
  }

  const { error: updPErr } = await supabase
    .from('payments')
    .update(updatePayload)
    .eq('id', payment.id)
  if (updPErr) {
    return res.status(500).json({
      error: `order 는 cancelled 됐지만 payments 업데이트 실패: ${updPErr.message}`,
      tossResult: tossJson,
    })
  }

  // 6) 쿠폰 후처리 (best-effort — 실패해도 취소 자체는 성공 처리)
  //    (a) 이 order 로 발급됐던 payment 쿠폰 회수
  //    (b) 이 결제가 전액 환불 도달 + 쿠폰 사용 결제면 쿠폰 복원 (만료 전만)
  await cancelCouponsForOrders(supabase, [orderId])
  if (reachedFull && payment.coupon_id) {
    await restoreAppliedCouponIfPossible(supabase, payment.coupon_id)
  }

  return res.status(200).json({
    ok: true,
    orderId,
    paymentId: payment.id,
    refundAmount,
    paymentFullyCancelled: reachedFull,
    tossResult: tossJson,
  })
}
