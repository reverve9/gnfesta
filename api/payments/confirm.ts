import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * 토스페이먼츠 결제 승인 API.
 *
 * 환경변수: TOSS_SECRET_KEY  (test_sk_... 또는 live_sk_...)
 *   - Vercel 대시보드의 Project Settings → Environment Variables 에 등록
 *   - 로컬 개발 시: `vercel dev` 실행 시 .env 의 TOSS_SECRET_KEY 가 자동 주입됨
 *
 * 호출:
 *   POST /api/payments/confirm
 *   { paymentKey: string, orderId: string, amount: number }
 *
 * 응답:
 *   200 → 토스 응답 그대로 (또는 { alreadyConfirmed: true } — 재진입)
 *   4xx/5xx → 에러 메시지
 *
 * 재진입 방어 (DB 선검증)
 *   · payment.status='paid'      → Toss 호출 스킵, 200 + alreadyConfirmed=true
 *   · payment.status='cancelled' → 400, 취소된 결제
 *   · payment.status='pending'   → 정상 Toss confirm 호출
 *   · amount 불일치              → 400, 위변조 차단
 *   클라(CheckoutSuccessPage)에서도 동일 분기 있지만 서버가 최종 방어선.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { paymentKey, orderId, amount } = (req.body ?? {}) as {
    paymentKey?: string
    orderId?: string
    amount?: number
  }

  if (!paymentKey || !orderId || typeof amount !== 'number') {
    return res.status(400).json({
      error: 'paymentKey, orderId, amount are required',
    })
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({
      error: 'TOSS_SECRET_KEY is not configured',
    })
  }

  // ─── DB 선검증 (재진입 방어) ────────────────────────────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Server missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .select('id, status, total_amount')
    .eq('toss_order_id', orderId)
    .maybeSingle()

  if (pErr) {
    return res.status(500).json({ error: `결제 조회 실패: ${pErr.message}` })
  }
  if (!payment) {
    return res.status(404).json({ error: '결제 정보를 찾을 수 없습니다' })
  }

  if (payment.total_amount !== amount) {
    return res.status(400).json({ error: '결제 금액이 일치하지 않습니다' })
  }

  if (payment.status === 'paid') {
    // Toss 는 이미 승인 완료 — 재호출하면 "이미 처리된 주문번호" 400 리턴함.
    // 클라에서 이 응답으로 기존 결제 상세 페이지로 이동할 수 있도록 플래그만 내려줌.
    return res.status(200).json({ alreadyConfirmed: true, paymentId: payment.id })
  }

  if (payment.status === 'cancelled') {
    return res.status(400).json({ error: '취소된 결제입니다' })
  }

  // ─── Toss confirm 호출 ───────────────────────────────────────
  // Basic Auth = base64(secretKey + ':')
  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64')

  try {
    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })

    const data = await tossResponse.json()

    if (!tossResponse.ok) {
      // 토스가 보낸 에러 (예: 카드 거절, 금액 불일치) 그대로 전달
      return res.status(tossResponse.status).json(data)
    }

    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to call Toss confirm API',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
