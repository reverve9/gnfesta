/**
 * 축제장 단일 geofence 판정 훅 — Phase 3-R2.
 *
 * 책임
 *  - 마운트 시 `GET /api/ar/festival` 1회 fetch → settings state owner.
 *  - 외부에서 주입된 `position` (useGpsPosition 결과) 로 inside/distanceToCenter 계산.
 *  - R1 의 TRUST_K / 히스테리시스 없음 — geofence 반경(200m)이 GPS 오차(20~30m) 대비 충분히 커서 불필요.
 *  - settings 실시간 반영 안 함 (세션 1회 fetch, Phase 6 어드민 개선 범위).
 *
 * 비책임 (의도적)
 *  - GPS 구독 금지. useGpsPosition 는 PlayPage 가 단독 소유.
 *    (훅 간 watchPosition 중복 방지 · 권한 획득 타이밍은 gesture chain 에 의존.)
 */

import { useEffect, useMemo, useState } from 'react'
import { getFestivalSettings, type FestivalSettingsDto } from '../lib/api'
import { haversineMeters } from '../lib/geo'
import type { GpsPosition } from './useGpsPosition'

export interface FestivalGeofenceState {
  /** 서버 settings (최초 1회 fetch). null 이면 로딩 중/실패. */
  settings: FestivalSettingsDto | null
  /** settings fetch 실패 메시지. */
  settingsError: string | null
  /** true = geofence 안, false = 밖 또는 position 미취득. */
  inside: boolean
  /** 중심까지 거리(m). GPS/settings 미취득 시 null. */
  distanceToCenter: number | null
  /** 마지막 판정 타임스탬프(Date.now()). null = 아직 판정 안 됨. */
  lastUpdatedAt: number | null
}

export function useFestivalGeofence(
  position: GpsPosition | null,
): FestivalGeofenceState {
  const [settings, setSettings] = useState<FestivalSettingsDto | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await getFestivalSettings()
      if (cancelled) return
      if (res.error) {
        setSettingsError(res.error)
        return
      }
      if (!res.settings) {
        setSettingsError('활성 festival settings 없음')
        return
      }
      setSettings(res.settings)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const derived = useMemo<
    Pick<FestivalGeofenceState, 'inside' | 'distanceToCenter' | 'lastUpdatedAt'>
  >(() => {
    if (!settings || !position) {
      return { inside: false, distanceToCenter: null, lastUpdatedAt: null }
    }
    const distM = haversineMeters(
      settings.center_lat,
      settings.center_lng,
      position.lat,
      position.lng,
    )
    return {
      inside: distM <= settings.geofence_radius_m,
      distanceToCenter: distM,
      lastUpdatedAt: Date.now(),
    }
    // lastUpdatedAt 를 Date.now() 로 쓰되 position.timestamp 기준으로 변화 감지 — position
    // 레퍼런스가 바뀔 때만 재계산.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, position])

  return {
    settings,
    settingsError,
    ...derived,
  }
}
