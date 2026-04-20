/**
 * AR 서버 API 클라이언트 래퍼.
 *
 * 관행 준수:
 *  - 공용 HTTP 래퍼 없음 — fetch 직접 호출 (GNfesta 프로젝트 관행, phase-0-analysis §4).
 *  - phone 은 body 전달 (URL path 금지).
 *  - 응답은 ok:true | ok:false 디스크리미네이티드 유니온. 상위는 `.ok` 로 분기.
 *  - HTTP 4xx/5xx 네트워크 에러 시에도 최대한 동일 shape 으로 반환 (상위 코드 단순화).
 *
 * Phase 3-R2 재설계:
 *  - `getArZones` 삭제 (ar_zones 테이블 자체 폐기).
 *  - `getFestivalSettings` 신규 — `/api/ar/festival` 프록시.
 *  - `postArSpawn` body 에서 `zone_id` 제거 (R1 에서 서버 이미 무시 중, R2 에서 시그니처 정리).
 */

import { normalizePhone } from '../../../lib/phone'

export type ArRarity = 'common' | 'rare' | 'legendary'

export interface SpawnResponseOk {
  ok: true
  spawn: {
    token: string
    creature_id: string
    creature_name: string
    creature_rarity: ArRarity
    model_url: string
    thumbnail_url: string | null
    expires_at: string
    /** true 면 기존 유효 토큰 재반환 (신규 발급 아님). 서버가 phone 기준으로 재사용 판정. */
    reused?: boolean
  }
}

export type SpawnFailureResult =
  | 'invalid_phone'
  | 'invalid_request'
  | 'no_creatures'
  | 'server_error'
  | 'server_misconfigured'
  | 'method_not_allowed'
  | 'network_error'

/** 기존 실패 shape — HTTP 4xx/5xx 에 공통으로 사용되던 `{ ok:false, result }`. */
export interface SpawnResponseFail {
  ok: false
  result: SpawnFailureResult
  message?: string
}

/**
 * Phase 3-R3 신규 실패 shape — geofence / cooldown 거절.
 * `reason` 디스크리미네이터로 기존 `result` shape 과 구분.
 * Q1=γ 결정에 따라 클라는 이 응답을 스케줄러 에러로 처리하지 않고 DevPanel `lastServerRejection`
 * 에만 기록한다.
 */
export interface SpawnResponseServerRejection {
  ok: false
  reason: 'outside_geofence' | 'cooldown'
  distance_m?: number
  retry_after_sec?: number
}

export type SpawnResponse =
  | SpawnResponseOk
  | SpawnResponseFail
  | SpawnResponseServerRejection

/** 타입 가드: 서버 거절(reason) shape 인지 판정. */
export function isSpawnServerRejection(
  resp: SpawnResponse,
): resp is SpawnResponseServerRejection {
  return !resp.ok && 'reason' in resp
}

export async function postArSpawn(params: {
  phone: string
  lat: number
  lng: number
}): Promise<SpawnResponse> {
  try {
    const response = await fetch('/api/ar/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalizePhone(params.phone),
        client_lat: params.lat,
        client_lng: params.lng,
      }),
    })
    const json = (await response.json().catch(() => null)) as SpawnResponse | null
    if (!json) {
      return { ok: false, result: 'server_error', message: `HTTP ${response.status}` }
    }
    return json
  } catch (e) {
    return {
      ok: false,
      result: 'network_error',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

export interface FestivalSettingsDto {
  id: string
  name: string
  center_lat: number
  center_lng: number
  geofence_radius_m: number
  spawn_interval_sec: number
  movement_bonus_distance_m: number
  rarity_weight_common: number
  rarity_weight_rare: number
  rarity_weight_legendary: number
  capture_token_ttl_sec: number
  capture_cooldown_sec: number
  mission_common_count: number
  mission_rare_count: number
  mission_legendary_count: number
  /** 이동 이상치 상한(m). Phase 3-R3 신설. 스케줄러 옵션 기본값 출처. */
  movement_outlier_cap_m: number
  /** velocity anti-cheat 상한(km/h). Phase 4 신설. capture_creature RPC 가 참조. */
  velocity_cap_kmh: number
  active: boolean
  updated_by: string | null
  updated_at: string
}

export interface GetFestivalSettingsResponse {
  settings: FestivalSettingsDto | null
  error?: string
}

export async function getFestivalSettings(): Promise<GetFestivalSettingsResponse> {
  try {
    const response = await fetch('/api/ar/festival')
    const json = (await response.json().catch(() => null)) as
      | { settings: FestivalSettingsDto | null; error?: string }
      | null
    if (!json) {
      return { settings: null, error: `HTTP ${response.status}` }
    }
    return { settings: json.settings ?? null, error: json.error }
  } catch (e) {
    return {
      settings: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Phase 4 — 포획 API (/api/ar/capture)
// ────────────────────────────────────────────────────────────────────

export interface CaptureResponseOk {
  ok: true
  capture_id: number
  grade: ArRarity
  /** 이번 capture 로 신규 발급된 경품만 포함 (기존 발급분 제외). */
  new_rewards: Array<{ grade: ArRarity; code: string }>
}

/** RPC 거절 shape. `reason` 디스크리미네이터. Q1=A (R3 reason-shape 확장). */
export type CaptureRejectionReason =
  | 'outside_geofence'
  | 'velocity_anomaly'
  | 'invalid_token'
  | 'duplicate'
  | 'expired'

export interface CaptureResponseRejection {
  ok: false
  reason: CaptureRejectionReason
  distance_m?: number
  speed_kmh?: number
  capture_id?: number
}

export type CaptureFailureResult =
  | 'invalid_phone'
  | 'invalid_request'
  | 'server_error'
  | 'server_misconfigured'
  | 'method_not_allowed'
  | 'network_error'

export interface CaptureResponseFail {
  ok: false
  result: CaptureFailureResult
  message?: string
}

export type CaptureResponse =
  | CaptureResponseOk
  | CaptureResponseRejection
  | CaptureResponseFail

/** 타입 가드 — capture RPC 가 reason 필드로 거절한 shape 인지 판정. */
export function isCaptureRejection(
  resp: CaptureResponse,
): resp is CaptureResponseRejection {
  return !resp.ok && 'reason' in resp
}

export async function postArCapture(params: {
  token: string
  phone: string
  lat: number
  lng: number
  capturedAt: string
}): Promise<CaptureResponse> {
  try {
    const response = await fetch('/api/ar/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: params.token,
        phone: normalizePhone(params.phone),
        lat: params.lat,
        lng: params.lng,
        captured_at: params.capturedAt,
      }),
    })
    const json = (await response.json().catch(() => null)) as CaptureResponse | null
    if (!json) {
      return { ok: false, result: 'server_error', message: `HTTP ${response.status}` }
    }
    return json
  } catch (e) {
    return {
      ok: false,
      result: 'network_error',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Phase 4 — 도감 API (/api/ar/collection)
// ────────────────────────────────────────────────────────────────────

export interface CollectionCapture {
  id: number
  creature_id: string
  creature_name: string
  rarity: ArRarity
  thumbnail_url: string | null
  captured_at: string
}

export interface CollectionReward {
  grade: ArRarity
  code: string
  issued_at: string
  status: 'active' | 'used' | 'expired'
}

export interface CollectionDto {
  phone: string
  captures: CollectionCapture[]
  mission_counts: { common: number; rare: number; legendary: number }
  progress: { common: number; rare: number; legendary: number }
  rewards: CollectionReward[]
}

export type CollectionFailureResult =
  | 'invalid_phone'
  | 'server_error'
  | 'server_misconfigured'
  | 'method_not_allowed'
  | 'network_error'

export type CollectionResponse =
  | { ok: true; collection: CollectionDto }
  | { ok: false; result: CollectionFailureResult; message?: string }

export async function getArCollection(params: {
  phone: string
}): Promise<CollectionResponse> {
  try {
    const phone = normalizePhone(params.phone)
    const response = await fetch(
      `/api/ar/collection?phone=${encodeURIComponent(phone)}`,
    )
    const json = (await response.json().catch(() => null)) as CollectionResponse | null
    if (!json) {
      return { ok: false, result: 'server_error', message: `HTTP ${response.status}` }
    }
    return json
  } catch (e) {
    return {
      ok: false,
      result: 'network_error',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
