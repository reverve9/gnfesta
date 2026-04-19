/**
 * 거리 계산 유틸 — PostGIS 없이 JS Haversine.
 *
 * 0014_ar_rpc_capture.sql 의 `haversine_km` SQL 함수와 동일 공식.
 * Phase 3-R2 에서 `detectZoneEntry.ts` 삭제 후 `useFestivalGeofence` · `useSpawnScheduler`
 * 가 공용으로 사용.
 */

const EARTH_RADIUS_KM = 6371

/** 두 좌표 간 거리(km). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** 두 좌표 간 거리(m). `haversineKm * 1000`. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000
}
