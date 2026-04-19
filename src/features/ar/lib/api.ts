/**
 * AR 서버 API 클라이언트 래퍼.
 *
 * 관행 준수:
 *  - 공용 HTTP 래퍼 없음 — fetch 직접 호출 (GNfesta 프로젝트 관행, phase-0-analysis §4).
 *  - phone 은 body 전달 (URL path 금지).
 *  - 응답은 ok:true | ok:false 디스크리미네이티드 유니온. 상위는 `.ok` 로 분기.
 *  - HTTP 4xx/5xx 네트워크 에러 시에도 최대한 동일 shape 으로 반환 (상위 코드 단순화).
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
    /** true 면 기존 유효 토큰 재반환 (신규 발급 아님). Phase 3 폴링 백업 경로. */
    reused?: boolean
  }
}

export type SpawnFailureResult =
  | 'invalid_phone'
  | 'invalid_request'
  | 'zone_not_active'
  | 'no_creatures_in_zone'
  | 'server_error'
  | 'server_misconfigured'
  | 'method_not_allowed'
  | 'network_error'

export interface SpawnResponseFail {
  ok: false
  result: SpawnFailureResult
  message?: string
}

export type SpawnResponse = SpawnResponseOk | SpawnResponseFail

export async function postArSpawn(params: {
  phone: string
  zoneId: string
  lat: number
  lng: number
}): Promise<SpawnResponse> {
  try {
    const response = await fetch('/api/ar/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalizePhone(params.phone),
        zone_id: params.zoneId,
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

export interface ArZoneDto {
  id: string
  name: string
  center_lat: number
  center_lng: number
  radius_m: number
  spawn_weight: number
}

export interface GetArZonesResponse {
  zones: ArZoneDto[]
  error?: string
}

export async function getArZones(): Promise<GetArZonesResponse> {
  try {
    const response = await fetch('/api/ar/zones')
    const json = (await response.json().catch(() => null)) as GetArZonesResponse | null
    if (!json) {
      return { zones: [], error: `HTTP ${response.status}` }
    }
    return { zones: json.zones ?? [], error: json.error }
  } catch (e) {
    return {
      zones: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
