/**
 * 구역 진입/퇴장 판정 — 순수 함수. 사이드 이펙트 없음.
 *
 * 설계 원칙:
 *  - Haversine 거리 계산 (PostGIS 없이 JS, 0014_ar_rpc_capture.sql 의 haversine_km 과 동일 공식).
 *  - 히스테리시스: 진입 경계(= radius) 와 퇴장 경계(= radius × 1.1) 를 분리해 경계 떨림 방지.
 *  - GPS 정확도 신뢰 판정: 각 zone 별로 `accuracy > radius × TRUST_K` 면 해당 zone 은 판정 후보에서 제외.
 *    → 작은 zone 은 작은 accuracy 에서만 유효. 큰 zone 은 큰 accuracy 도 허용.
 *    전체 zone 이 전부 제외되면 자연스레 outside.
 *  - 동시 여러 구역 겹치는 경우: 가장 가까운 구역 선택.
 *
 * 반환 state 의미:
 *  - `entering`  previousZoneId === null 이었으나 이번에 들어옴
 *  - `leaving`   previousZoneId !== null 이었으나 이번에 빠짐 (또는 다른 zone 으로 전이)
 *  - `inside`    이전과 동일 zone 유지
 *  - `outside`   이전에도 밖이었고 지금도 밖
 *
 * 이벤트 기반 소비 (useZoneDetection) 를 위해 전이 여부를 명시.
 */

const EARTH_RADIUS_KM = 6371
const EXIT_HYSTERESIS = 1.1 // 퇴장 경계는 radius × 1.1 (10% 버퍼)
const TRUST_K = 1.5 // accuracy 신뢰 계수: accuracy ≤ radius × K 인 zone 만 판정 후보

export interface Zone {
  id: string
  center_lat: number
  center_lng: number
  radius_m: number
}

export type ZoneState = 'outside' | 'inside' | 'entering' | 'leaving'

export interface ZoneDetectionResult {
  currentZoneId: string | null
  state: ZoneState
  distances: Record<string, number> // 각 구역까지 거리(m)
}

export interface ZoneDetectionInput {
  lat: number
  lng: number
  accuracy?: number // GPS 정확도(m). 지정 시 신뢰 판정 적용.
}

/**
 * 두 좌표간 거리(m). Haversine.
 * 동일 좌표면 0 반환.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)))
  return EARTH_RADIUS_KM * 1000 * c
}

/** zone 개별 신뢰 판정: accuracy 가 해당 zone 반경 × TRUST_K 이내이면 후보 가능. */
function zoneIsReliable(zone: Zone, accuracy: number | undefined): boolean {
  if (accuracy === undefined) return true
  return accuracy <= zone.radius_m * TRUST_K
}

export function detectZoneEntry(
  position: ZoneDetectionInput,
  zones: Zone[],
  previousState?: { zoneId: string | null },
): ZoneDetectionResult {
  const previousZoneId = previousState?.zoneId ?? null

  // 모든 구역까지 거리 계산.
  const distances: Record<string, number> = {}
  for (const z of zones) {
    distances[z.id] = haversineMeters(
      position.lat,
      position.lng,
      z.center_lat,
      z.center_lng,
    )
  }

  // 이전 zone 이 (a) 아직 유효 범위(× hysteresis) 안이고 (b) accuracy 로 신뢰 가능하면 유지.
  // 신뢰 불가해진 경우는 유지 중단 → 후보 재탐색 또는 leaving.
  const prevZone = previousZoneId ? zones.find(z => z.id === previousZoneId) : null
  if (prevZone) {
    const prevDist = distances[prevZone.id]
    if (
      prevDist !== undefined &&
      prevDist <= prevZone.radius_m * EXIT_HYSTERESIS &&
      zoneIsReliable(prevZone, position.accuracy)
    ) {
      return {
        currentZoneId: prevZone.id,
        state: 'inside',
        distances,
      }
    }
  }

  // 현재 반경 안 + accuracy 신뢰 가능한 후보 수집 → 가장 가까운 것 선택.
  let bestId: string | null = null
  let bestDist = Infinity
  for (const z of zones) {
    if (!zoneIsReliable(z, position.accuracy)) continue
    const d = distances[z.id]
    if (d === undefined) continue
    if (d <= z.radius_m && d < bestDist) {
      bestDist = d
      bestId = z.id
    }
  }

  if (bestId) {
    return {
      currentZoneId: bestId,
      state: previousZoneId === bestId ? 'inside' : 'entering',
      distances,
    }
  }

  // 어느 zone 에도 속하지 않거나, 모든 zone 이 accuracy 로 신뢰 불가.
  return {
    currentZoneId: null,
    state: previousZoneId ? 'leaving' : 'outside',
    distances,
  }
}
