import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * AR 스폰 API.
 *
 * 호출:
 *   POST /api/ar/spawn
 *   { phone, client_lat, client_lng }
 *
 * 성공 응답 (200):
 *   { ok:true, spawn: { token, creature_id, creature_name, creature_rarity,
 *                        model_url, thumbnail_url, expires_at, reused } }
 *
 * 기존 실패 응답 (hodl 호환):
 *   { ok:false, result, message? }
 *   result ∈ invalid_phone | invalid_request | no_creatures
 *          | server_error | server_misconfigured | method_not_allowed
 *
 * Phase 3-R3 신규 실패 응답:
 *   403 { ok:false, reason:'outside_geofence', distance_m }
 *   429 { ok:false, reason:'cooldown', retry_after_sec }
 *
 * Phase 3-R3 재설계 (PHASE_3_R3_PROMPT v1.0)
 *  · Geofence 검증: haversine 계산 후 반경 초과 시 403 + outside_geofence.
 *  · Rarity 분포: ar_festival_settings.rarity_weight_{common,rare,legendary} DB 로드.
 *    R2 까지 하드코딩 70/25/5 완전 제거.
 *  · TTL: issue_spawn_token RPC 가 capture_token_ttl_sec 동적 로드 (0018 마이그레이션).
 *  · 쿨다운: RPC 내부 P0001 'cooldown_active:<N>' 시그널 → 핸들러 파싱 → 429.
 *  · 기존 reuse (phone 기준 유효 토큰 재반환) 경로 유지 — 재사용은 쿨다운 판정 대상 아님.
 *  · Vercel 제약: api/_lib/ 임포트 금지 → 유틸 인라인.
 */

type Rarity = 'common' | 'rare' | 'legendary'

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

// src/features/ar/lib/geo.ts 의 haversineMeters 와 동등. api/_lib 금지로 인라인.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a)) * 1000
}

interface CreatureRow {
  id: string
  name: string
  rarity: Rarity
  model_url: string
  thumbnail_url: string | null
  spawn_rate: number
}

function sampleRarityFromWeights(weights: Record<Rarity, number>): Rarity {
  const total = weights.common + weights.rare + weights.legendary
  // settings 는 합 100 이 강제되지만 방어적으로 계산.
  const r = Math.random() * (total > 0 ? total : 100)
  if (r < weights.common) return 'common'
  if (r < weights.common + weights.rare) return 'rare'
  return 'legendary'
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

/** RPC error.message 에서 'cooldown_active:<N>' 패턴을 파싱. 실패 시 null. */
function parseCooldownMessage(msg: string | undefined | null): number | null {
  if (!msg) return null
  const m = /cooldown_active:(\d+)/.exec(msg)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, result: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as {
    phone?: string
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

  // 1) festival settings 로드 — geofence + rarity 분포 필수.
  const { data: settingsData, error: settingsErr } = await supabase.rpc(
    'get_festival_settings',
  )
  if (settingsErr) {
    return res
      .status(500)
      .json({ ok: false, result: 'server_error', message: settingsErr.message })
  }
  const settings = settingsData as {
    center_lat: number
    center_lng: number
    geofence_radius_m: number
    rarity_weight_common: number
    rarity_weight_rare: number
    rarity_weight_legendary: number
  } | null
  if (!settings) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: 'no active ar_festival_settings',
    })
  }

  // 2) Geofence 검증 — 반경 초과 시 403 + outside_geofence.
  const clientLat = body.client_lat as number
  const clientLng = body.client_lng as number
  const distanceM = haversineMeters(
    settings.center_lat,
    settings.center_lng,
    clientLat,
    clientLng,
  )
  if (distanceM > settings.geofence_radius_m) {
    return res.status(403).json({
      ok: false,
      reason: 'outside_geofence',
      distance_m: Math.round(distanceM),
    })
  }

  // 3) 기존 유효 token 재사용 — phone 단독 기준. 재사용은 쿨다운 판정 대상 아님.
  const { data: existing, error: existErr } = await supabase
    .from('ar_spawn_tokens')
    .select('token, creature_id, expires_at')
    .eq('phone', normalized)
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
  }

  // 4) 신규 creature 선택 — DB rarity 분포로 샘플링 → spawn_rate 가중.
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
    return res.status(200).json({ ok: false, result: 'no_creatures' })
  }

  const weights: Record<Rarity, number> = {
    common: settings.rarity_weight_common,
    rare: settings.rarity_weight_rare,
    legendary: settings.rarity_weight_legendary,
  }
  // 샘플링 → 해당 rarity 비어있으면 common → rare → legendary 폴백.
  const tryOrder: Rarity[] = [sampleRarityFromWeights(weights), 'common', 'rare', 'legendary']
  let chosen: CreatureRow | null = null
  for (const rar of tryOrder) {
    const candidates = (allCreatures as CreatureRow[]).filter(c => c.rarity === rar)
    if (candidates.length > 0) {
      chosen = pickByWeight(candidates)
      break
    }
  }
  if (!chosen) {
    return res.status(200).json({ ok: false, result: 'no_creatures' })
  }

  // 5) issue_spawn_token RPC — TTL 동적 로드 + 쿨다운 내부 판정.
  const { data: tokenData, error: rpcErr } = await supabase.rpc('issue_spawn_token', {
    p_phone: normalized,
    p_creature_id: chosen.id,
  })
  if (rpcErr) {
    const retryAfter = parseCooldownMessage(rpcErr.message)
    if (retryAfter !== null) {
      return res
        .status(429)
        .json({ ok: false, reason: 'cooldown', retry_after_sec: retryAfter })
    }
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: rpcErr.message,
    })
  }
  const token = typeof tokenData === 'string' ? tokenData : null
  if (!token) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: 'issue_spawn_token returned empty',
    })
  }

  // 6) expires_at 재조회 (RPC 는 token 만 반환. TTL 동적이므로 클라 계산 불가).
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
      // tokenRow 실패(레이스) 시 최소 TTL 가정으로 낙하 — 정상 경로에서 도달 불가.
      expires_at: tokenRow?.expires_at ?? new Date(Date.now() + 60_000).toISOString(),
      reused: false,
    },
  })
}
