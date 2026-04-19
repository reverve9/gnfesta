/**
 * GPS 지속 추적 훅 — `navigator.geolocation.watchPosition` 래퍼.
 *
 * 책임:
 *  - start/stop 명시 호출로 생명주기 관리. Mount 시 자동 시작 금지 (iOS 사용자 터치 제약 & 불필요한 권한 프롬프트 방지).
 *  - unmount 시 clearWatch 자동 호출.
 *  - Page Visibility hidden 시 일시정지, visible 시 자동 재개 (배터리·열 관리).
 *
 * 사용 전제:
 *  - 권한은 `useArPermissions.requestGps()` 로 먼저 획득 (터치 onClick 안에서).
 *  - 이 훅의 start() 는 이미 권한이 granted 인 상태에서 호출한다고 가정.
 *    미권한 상태에서 start() → 브라우저가 프롬프트 표시 (터치 gesture 밖이면 iOS 거부 가능).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface GpsPosition {
  lat: number
  lng: number
  accuracy: number // meters
  timestamp: number
}

export interface UseGpsPositionOptions {
  enableHighAccuracy?: boolean
  maximumAge?: number
  timeout?: number
}

export interface UseGpsPositionApi {
  position: GpsPosition | null
  error: GeolocationPositionError | null
  isTracking: boolean
  start: () => void
  stop: () => void
}

const DEFAULT_OPTIONS: Required<UseGpsPositionOptions> = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 10000,
}

export function useGpsPosition(options?: UseGpsPositionOptions): UseGpsPositionApi {
  const [position, setPosition] = useState<GpsPosition | null>(null)
  const [error, setError] = useState<GeolocationPositionError | null>(null)
  const [isTracking, setIsTracking] = useState(false)

  const watchIdRef = useRef<number | null>(null)
  // Visibility resume 시 자동 재개 여부 결정용 — 명시적 stop() 호출과 Visibility stop 구분.
  const autoResumeRef = useRef(false)
  const optsRef = useRef<Required<UseGpsPositionOptions>>({ ...DEFAULT_OPTIONS, ...options })
  optsRef.current = { ...DEFAULT_OPTIONS, ...options }

  const stopInternal = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
  }, [])

  const startInternal = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    if (watchIdRef.current !== null) return // 중복 시작 방지
    const { enableHighAccuracy, maximumAge, timeout } = optsRef.current
    const id = navigator.geolocation.watchPosition(
      pos => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
        setError(null)
      },
      err => {
        setError(err)
        // timeout/unavailable 은 추적 계속 (다음 틱에 회복 가능). denied 는 중단.
        if (err.code === err.PERMISSION_DENIED) {
          stopInternal()
        }
      },
      { enableHighAccuracy, maximumAge, timeout },
    )
    watchIdRef.current = id
    setIsTracking(true)
  }, [stopInternal])

  const start = useCallback(() => {
    autoResumeRef.current = true
    startInternal()
  }, [startInternal])

  const stop = useCallback(() => {
    autoResumeRef.current = false
    stopInternal()
  }, [stopInternal])

  // Page Visibility 대응 — hidden 시 정지, visible 복귀 시 autoResume 면 재개.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (watchIdRef.current !== null) stopInternal()
      } else if (document.visibilityState === 'visible') {
        if (autoResumeRef.current && watchIdRef.current === null) startInternal()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [startInternal, stopInternal])

  // Unmount 정리 — 명시적 stop() 호출 여부 무관 clearWatch.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [])

  return { position, error, isTracking, start, stop }
}
