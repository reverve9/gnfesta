import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 서버 전용 쿠폰 후처리 헬퍼 — 결제 취소 경로에서 사용.
 *
 * 파일명 `_` prefix 때문에 Vercel Serverless 엔드포인트로 라우팅되지 않음 (내부 모듈).
 * best-effort 방식 — 실패해도 throw 하지 않고 console.warn 만 남겨서
 * Toss 환불이 이미 성공한 상황에서 쿠폰 후처리 실패로 전체가 500 이 되지 않도록 한다.
 */

/**
 * 해당 orderIds 로부터 발급됐던 payment 쿠폰들을 회수 (active → cancelled).
 *  - 이미 사용된(used) 쿠폰은 건드리지 않음 — 혜택이 이미 적용된 결제.
 *  - (phone, booth_id) unique 는 `status<>'cancelled'` 에만 적용되므로,
 *    회수 후 같은 매장에서 재결제 시 새 쿠폰이 발급될 수 있음.
 */
export async function cancelCouponsForOrders(
  supabase: SupabaseClient,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return
  const { error } = await supabase
    .from('coupons')
    .update({ status: 'cancelled' })
    .in('issued_from_order_id', orderIds)
    .eq('status', 'active')
  if (error) {
    console.warn('[cancelCouponsForOrders] failed', error)
  }
}

/**
 * 결제에 사용된 쿠폰을 만료 전이면 복원 (used → active).
 *  - status='used' AND expires_at > now() 일 때만.
 *  - 만료된 쿠폰은 복원해도 못 쓰므로 포기.
 */
export async function restoreAppliedCouponIfPossible(
  supabase: SupabaseClient,
  couponId: string,
): Promise<void> {
  const { error } = await supabase
    .from('coupons')
    .update({
      status: 'active',
      used_at: null,
      used_payment_id: null,
    })
    .eq('id', couponId)
    .eq('status', 'used')
    .gt('expires_at', new Date().toISOString())
  if (error) {
    console.warn('[restoreAppliedCouponIfPossible] failed', error)
  }
}
