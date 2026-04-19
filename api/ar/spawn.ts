import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * AR 스폰 API.
 *
 * 호출:
 *   POST /api/ar/spawn
 *   { phone, zone_id, client_lat, client_lng }
 *
 * 성공 응답 (200):
 *   { ok:true, spawn: { token, creature_id, creature_name, creature_rarity,
 *                        model_url, thumbnail_url, expires_at, reused } }
 *
 * 실패 응답:
 *   { ok:false, result, message? }
 *   result ∈ invalid_phone | invalid_request | zone_not_active | no_creatures_in_zone
 *          | server_error | server_misconfigured | method_not_allowed
 *
 * 설계 메모
 *  · creature 선택은 서버 전담 (클라 조작 방지). rarity 분포는 common 70 / rare 25 / legendary 5 하드코딩 —
 *    어드민에서 조정은 Phase 6 범위.
 *  · 동일 phone × zone 에 **unconsumed + unexpired** token 이 이미 있으면 그대로 재반환.
 *    Phase 3 의 30초 폴링 백업이 이 경로로 수렴 → 클라 state 유실 복구에도 안전.
 *  · `issue_spawn_token` RPC (Phase 1) 는 시그니처 변경 없이 그대로 호출.
 *  · `ar_capture_attempts` insert 는 이 시점엔 하지 않음 (포획 시도 시점 전용).
 *  · Vercel 제약: api/_lib/ 임포트 금지 → phone 정규화 등 인라인.
 */

const RARITY_WEIGHTS = {
  common: 0.7,
  rare: 0.25,
  legendary: 0.05,
} as const

type Rarity = keyof typeof RARITY_WEIGHTS

// src/lib/phone.ts 의 normalizePhone + isValidPhone 와 동등. api/_lib 금지로 인라인.
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11)
}

function isValidNormalizedPhone(normalized: string): boolean {
  return /^010\d{8}$/.test(normalized)
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function sampleRarity(): Rarity {
  const r = Math.random()
  if (r < RARITY_WEIGHTS.common) return 'common'
  if (r < RARITY_WEIGHTS.common + RARITY_WEIGHTS.rare) return 'rare'
  return 'legendary'
}

interface CreatureRow {
  id: string
  name: string
  rarity: Rarity
  model_url: string
  thumbnail_url: string | null
  spawn_rate: number
}

function pickByWeight(candidates: CreatureRow[]): CreatureRow {
  const total = candidates.reduce((s, c) => s + (c.spawn_rate ?? 0), 0)
  if (total <= 0) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  let pick = Math.random() * total
  for (const c of candidates) {
    pick -= c.spawn_rate ?? 0
    if (pick <= 0) return c
  }
  return candidates[candidates.length - 1]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, result: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as {
    phone?: string
    zone_id?: string
    client_lat?: number
    client_lng?: number
  }

  if (!body.phone || typeof body.phone !== 'string') {
    return res.status(400).json({ ok: false, result: 'invalid_phone' })
  }
  const normalized = normalizePhone(body.phone)
  if (!isValidNormalizedPhone(normalized)) {
    return res.status(400).json({ ok: false, result: 'invalid_phone' })
  }
  if (!body.zone_id || typeof body.zone_id !== 'string') {
    return res
      .status(400)
      .json({ ok: false, result: 'invalid_request', message: 'zone_id required' })
  }
  if (!isValidCoord(body.client_lat, body.client_lng)) {
    return res
      .status(400)
      .json({ ok: false, result: 'invalid_request', message: 'client_lat/lng required' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      result: 'server_misconfigured',
      message: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1) Zone active 확인
  const { data: zone, error: zoneError } = await supabase
    .from('ar_zones')
    .select('id, active')
    .eq('id', body.zone_id)
    .maybeSingle()
  if (zoneError) {
    return res
      .status(500)
      .json({ ok: false, result: 'server_error', message: zoneError.message })
  }
  if (!zone || !zone.active) {
    return res.status(200).json({ ok: false, result: 'zone_not_active' })
  }

  // 2) 기존 유효 token 재사용 — 폴링 백업·클라 state 유실 복구 용도
  const { data: existing, error: existErr } = await supabase
    .from('ar_spawn_tokens')
    .select('token, creature_id, expires_at')
    .eq('phone', normalized)
    .eq('zone_id', body.zone_id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('issued_at', { ascending: false })
    .limit(1)
  if (existErr) {
    return res
      .status(500)
      .json({ ok: false, result: 'server_error', message: existErr.message })
  }
  if (existing && existing.length > 0) {
    const row = existing[0]
    const { data: c } = await supabase
      .from('ar_creatures')
      .select('id, name, rarity, model_url, thumbnail_url')
      .eq('id', row.creature_id)
      .maybeSingle()
    if (c) {
      return res.status(200).json({
        ok: true,
        spawn: {
          token: row.token,
          creature_id: c.id,
          creature_name: c.name,
          creature_rarity: c.rarity,
          model_url: c.model_url,
          thumbnail_url: c.thumbnail_url,
          expires_at: row.expires_at,
          reused: true,
        },
      })
    }
    // creature 가 soft-delete/사라진 레이스 — 신규 경로로 낙하
  }

  // 3) 신규 creature 선택 — active 전체 조회 후 rarity 샘플링 → spawn_rate 가중
  const { data: allCreatures, error: cErr } = await supabase
    .from('ar_creatures')
    .select('id, name, rarity, model_url, thumbnail_url, spawn_rate')
    .eq('active', true)
  if (cErr) {
    return res
      .status(500)
      .json({ ok: false, result: 'server_error', message: cErr.message })
  }
  if (!allCreatures || allCreatures.length === 0) {
    return res.status(200).json({ ok: false, result: 'no_creatures_in_zone' })
  }

  // rarity 우선순위: 샘플링 → common → rare → legendary 폴백 (active 한 rarity 어디라도 존재하면 성공)
  const tryOrder: Rarity[] = [sampleRarity(), 'common', 'rare', 'legendary']
  let chosen: CreatureRow | null = null
  for (const rar of tryOrder) {
    const candidates = (allCreatures as CreatureRow[]).filter(c => c.rarity === rar)
    if (candidates.length > 0) {
      chosen = pickByWeight(candidates)
      break
    }
  }
  if (!chosen) {
    return res.status(200).json({ ok: false, result: 'no_creatures_in_zone' })
  }

  // 4) issue_spawn_token RPC (Phase 1, SECURITY DEFINER, TTL 60초)
  const { data: tokenData, error: rpcErr } = await supabase.rpc('issue_spawn_token', {
    p_phone: normalized,
    p_creature_id: chosen.id,
    p_zone_id: body.zone_id,
  })
  const token = typeof tokenData === 'string' ? tokenData : null
  if (rpcErr || !token) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: rpcErr?.message ?? 'issue_spawn_token returned empty',
    })
  }

  // 5) expires_at 재조회 (RPC 가 token 만 반환)
  const { data: tokenRow } = await supabase
    .from('ar_spawn_tokens')
    .select('expires_at')
    .eq('token', token)
    .maybeSingle()

  return res.status(200).json({
    ok: true,
    spawn: {
      token,
      creature_id: chosen.id,
      creature_name: chosen.name,
      creature_rarity: chosen.rarity,
      model_url: chosen.model_url,
      thumbnail_url: chosen.thumbnail_url,
      expires_at: tokenRow?.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
      reused: false,
    },
  })
}
