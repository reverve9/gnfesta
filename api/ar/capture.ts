import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * AR 포획 API — Phase 4.
 *
 * 호출:
 *   POST /api/ar/capture
 *   { token, phone, lat, lng, captured_at }
 *
 * 성공 응답 (200):
 *   { ok:true, capture_id, grade, new_rewards?:[{grade,code}...] }
 *
 * 거절 (RPC reason shape):
 *   403 { ok:false, reason:'outside_geofence', distance_m }
 *   403 { ok:false, reason:'velocity_anomaly', speed_kmh }
 *   404 { ok:false, reason:'invalid_token' }
 *   409 { ok:false, reason:'duplicate', capture_id }
 *   410 { ok:false, reason:'expired' }
 *
 * 기타 실패 (result shape — 입력·서버 오류):
 *   400 { ok:false, result:'invalid_phone' | 'invalid_request', message? }
 *   405 { ok:false, result:'method_not_allowed' }
 *   500 { ok:false, result:'server_error' | 'server_misconfigured', message? }
 *
 * 설계 (PHASE_4_PROMPT.md §1-1 · §3 Q1=A · §3 Q2=B):
 *  · 서버 검증 순서·미션 집계·경품 발급은 capture_creature RPC 내부 원자 처리.
 *  · 본 핸들러는 입력 검증 + RPC 호출 + JSONB 응답 → HTTP status 매핑만 수행.
 *  · api/_lib 금지 (Vercel 제약) → phone 정규화 인라인 (spawn.ts 와 동일 규약).
 */

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

interface CaptureRpcResponse {
  ok: boolean
  reason?: string
  distance_m?: number
  speed_kmh?: number
  capture_id?: number
  grade?: 'common' | 'rare' | 'legendary'
  new_rewards?: Array<{ grade: string; code: string }>
}

function statusForReason(reason: string | undefined): number {
  switch (reason) {
    case 'invalid_token':
      return 404
    case 'expired':
      return 410
    case 'duplicate':
      return 409
    case 'outside_geofence':
    case 'velocity_anomaly':
      return 403
    default:
      return 500
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, result: 'method_not_allowed' })
  }

  const body = (req.body ?? {}) as {
    token?: string
    phone?: string
    lat?: number
    lng?: number
    captured_at?: string
  }

  if (!body.token || typeof body.token !== 'string') {
    return res
      .status(400)
      .json({ ok: false, result: 'invalid_request', message: 'token required' })
  }
  if (!body.phone || typeof body.phone !== 'string') {
    return res.status(400).json({ ok: false, result: 'invalid_phone' })
  }
  const normalized = normalizePhone(body.phone)
  if (!isValidNormalizedPhone(normalized)) {
    return res.status(400).json({ ok: false, result: 'invalid_phone' })
  }
  if (!isValidCoord(body.lat, body.lng)) {
    return res
      .status(400)
      .json({ ok: false, result: 'invalid_request', message: 'lat/lng required' })
  }

  // captured_at: 클라이언트 ISO. 누락·파싱 실패 시 now() (RPC DEFAULT) 사용.
  let capturedAt: string | undefined
  if (body.captured_at) {
    if (typeof body.captured_at !== 'string') {
      return res.status(400).json({
        ok: false,
        result: 'invalid_request',
        message: 'captured_at must be ISO string',
      })
    }
    const ts = Date.parse(body.captured_at)
    if (Number.isNaN(ts)) {
      return res.status(400).json({
        ok: false,
        result: 'invalid_request',
        message: 'captured_at not a valid date',
      })
    }
    capturedAt = new Date(ts).toISOString()
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

  const rpcParams: {
    p_token: string
    p_phone: string
    p_client_lat: number
    p_client_lng: number
    p_captured_at?: string
  } = {
    p_token: body.token,
    p_phone: normalized,
    p_client_lat: body.lat as number,
    p_client_lng: body.lng as number,
  }
  if (capturedAt) rpcParams.p_captured_at = capturedAt

  const { data, error } = await supabase.rpc('capture_creature', rpcParams)
  if (error) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: error.message,
    })
  }

  const rpc = (data ?? null) as CaptureRpcResponse | null
  if (!rpc) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: 'capture_creature returned empty',
    })
  }

  if (rpc.ok === true) {
    return res.status(200).json({
      ok: true,
      capture_id: rpc.capture_id,
      grade: rpc.grade,
      new_rewards: rpc.new_rewards ?? [],
    })
  }

  const reason = rpc.reason
  const status = statusForReason(reason)
  const payload: Record<string, unknown> = { ok: false, reason }
  if (typeof rpc.distance_m === 'number') payload.distance_m = rpc.distance_m
  if (typeof rpc.speed_kmh === 'number') payload.speed_kmh = rpc.speed_kmh
  if (typeof rpc.capture_id === 'number') payload.capture_id = rpc.capture_id
  return res.status(status).json(payload)
}
