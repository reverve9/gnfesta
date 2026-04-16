import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * 프로그램 쿠폰 발급 API (스탬프랠리 — 고정 QR 스캔 경로).
 *
 * 호출:
 *   POST /api/coupons/issue-program
 *   { eventId: string, clientId: string }
 *
 * 응답:
 *   200 { ok: true, code, discount, minOrder, expiresAt, sourceLabel }
 *   409 { ok: false, error: '...', code: 'ALREADY_CLAIMED' }
 *   400/403 { ok: false, error }   — 비활성/시간창 밖/유효성
 *   404 { ok: false, error }       — 이벤트 없음
 *
 * 방어선 (고정 QR 전제 — 부정 수준 감당 가능)
 *  · event.coupon_enabled=true 만 허용
 *  · coupon_starts_at/ends_at 시간창 체크 (null 쪽은 스킵)
 *  · (client_id, event_id) unique 위반 → ALREADY_CLAIMED
 *  · 쿠폰 가치 2,000원이라 대규모 부정 유인 낮음 → 회전 토큰/HMAC 생략
 */

const DEFAULT_DISCOUNT = 2000
const DEFAULT_MIN_ORDER = 10000
/** 축제 종료 시점 — 쿠폰 자체 만료일. coupon_ends_at(발급 종료)과 별개. */
const DEFAULT_COUPON_EXPIRES_AT = '2026-05-17T23:59:59+09:00'

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
function randomCode(): string {
  let s = ''
  for (let i = 0; i < 6; i += 1) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return `MS-${s}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  const { eventId, clientId } = (req.body ?? {}) as {
    eventId?: string
    clientId?: string
  }

  if (!eventId || !clientId || clientId.length < 16) {
    return res.status(400).json({ ok: false, error: 'eventId, clientId 가 필요합니다' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      error: 'Server missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1) 이벤트 조회
  const { data: event, error: eErr } = await supabase
    .from('festival_events')
    .select(
      'id, name, festival_id, coupon_enabled, coupon_discount, coupon_min_order, coupon_starts_at, coupon_ends_at',
    )
    .eq('id', eventId)
    .maybeSingle()
  if (eErr) {
    return res.status(500).json({ ok: false, error: `이벤트 조회 실패: ${eErr.message}` })
  }
  if (!event) {
    return res.status(404).json({ ok: false, error: '이벤트를 찾을 수 없습니다' })
  }

  if (!event.coupon_enabled) {
    return res.status(403).json({
      ok: false,
      error: '쿠폰 발급이 아직 열리지 않았습니다',
      code: 'DISABLED',
    })
  }

  const now = Date.now()
  if (event.coupon_starts_at && new Date(event.coupon_starts_at).getTime() > now) {
    return res.status(403).json({
      ok: false,
      error: '아직 쿠폰 발급 시간이 아닙니다',
      code: 'BEFORE_WINDOW',
    })
  }
  if (event.coupon_ends_at && new Date(event.coupon_ends_at).getTime() < now) {
    return res.status(403).json({
      ok: false,
      error: '쿠폰 발급이 종료되었습니다',
      code: 'AFTER_WINDOW',
    })
  }

  // 2) 발급 — (client_id, event_id) unique 에 기대어 중복 차단.
  //    code 충돌은 매우 드물지만 5회까지 재시도.
  const discount = event.coupon_discount ?? DEFAULT_DISCOUNT
  const minOrder = event.coupon_min_order ?? DEFAULT_MIN_ORDER
  const sourceLabel = event.name

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode()
    const { data: inserted, error: iErr } = await supabase
      .from('coupons')
      .insert({
        code,
        discount_amount: discount,
        min_order_amount: minOrder,
        status: 'active',
        issued_source: 'program',
        client_id: clientId,
        event_id: event.id,
        source_label: sourceLabel,
        expires_at: DEFAULT_COUPON_EXPIRES_AT,
        festival_id: event.festival_id,
        note: `${sourceLabel} 참여 쿠폰`,
      })
      .select()
      .single()

    if (!iErr && inserted) {
      return res.status(200).json({
        ok: true,
        code: inserted.code,
        discount: inserted.discount_amount,
        minOrder: inserted.min_order_amount,
        expiresAt: inserted.expires_at,
        sourceLabel,
      })
    }

    if (iErr?.code !== '23505') {
      return res.status(500).json({
        ok: false,
        error: `발급 실패: ${iErr?.message ?? 'unknown'}`,
      })
    }

    // 23505 unique_violation — 어느 쪽 unique 인지 구분
    // (1) (client_id, event_id) → 이미 발급됨, 즉시 ALREADY_CLAIMED 반환
    // (2) coupons_code_key     → 코드 충돌, 재시도
    const details =
      typeof iErr.details === 'string' ? iErr.details : iErr.message ?? ''
    if (details.toLowerCase().includes('code')) {
      continue // 코드 충돌 — 다음 루프
    }
    return res.status(409).json({
      ok: false,
      error: '이미 참여하신 프로그램입니다',
      code: 'ALREADY_CLAIMED',
    })
  }

  return res.status(500).json({
    ok: false,
    error: '쿠폰 코드 생성 실패 — 잠시 후 다시 시도해주세요',
  })
}
