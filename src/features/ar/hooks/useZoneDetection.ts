/**
 * 구역 진입/퇴장 이벤트 훅 — `useGpsPosition` + `detectZoneEntry` 결합.
 *
 * 계약:
 *  - 위치 업데이트마다 `detectZoneEntry` 재평가.
 *  - 상태 전이(`entering` / `leaving`) 시점에만 콜백 1회 호출. 매 위치 업데이트가 아님.
 *  - zone A → zone B 전이 시 leave(A) 먼저 → enter(B) 나중 순서.
 *  - 콜백은 슬롯 1개 (Phase 3 구독자 = PlayPage 1곳). 후속 `onEnterZone(newCb)` 는 이전 콜백 교체.
 *
 * 사용 전제:
 *  - zones 는 상위에서 로드한 활성 구역 목록 (GET /api/ar/zones 결과).
 *  - position 은 useGpsPosition().position (null 가능).
 *  - 콜백 등록은 useEffect 내부에서 (cleanup 으로 해제 권장).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detectZoneEntry,
  type Zone,
  type ZoneDetectionResult,
} from '../lib/detectZoneEntry'
import type { GpsPosition } from './useGpsPosition'

type ZoneCallback = (zoneId: string) => void

export interface UseZoneDetectionApi {
  result: ZoneDetectionResult
  /** 진입 이벤트 콜백 설정. 반환된 함수로 구독 해제. Phase 3 단일 구독자 전제. */
  onEnterZone: (callback: ZoneCallback) => () => void
  /** 퇴장 이벤트 콜백 설정. 반환된 함수로 구독 해제. Phase 3 단일 구독자 전제. */
  onLeaveZone: (callback: ZoneCallback) => () => void
}

const EMPTY_RESULT: ZoneDetectionResult = {
  currentZoneId: null,
  state: 'outside',
  distances: {},
}

export function useZoneDetection(
  zones: Zone[],
  position: GpsPosition | null,
): UseZoneDetectionApi {
  const [result, setResult] = useState<ZoneDetectionResult>(EMPTY_RESULT)
  const previousZoneIdRef = useRef<string | null>(null)

  // 단일 슬롯 — Phase 3 에서 구독자는 PlayPage 1곳만.
  const enterCallbackRef = useRef<ZoneCallback | null>(null)
  const leaveCallbackRef = useRef<ZoneCallback | null>(null)

  const onEnterZone = useCallback((callback: ZoneCallback) => {
    enterCallbackRef.current = callback
    return () => {
      if (enterCallbackRef.current === callback) enterCallbackRef.current = null
    }
  }, [])

  const onLeaveZone = useCallback((callback: ZoneCallback) => {
    leaveCallbackRef.current = callback
    return () => {
      if (leaveCallbackRef.current === callback) leaveCallbackRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!position) {
      // 위치 미획득 상태에서 zones 만 로드된 경우: result 는 빈 상태 유지.
      return
    }

    const next = detectZoneEntry(
      { lat: position.lat, lng: position.lng, accuracy: position.accuracy },
      zones,
      { zoneId: previousZoneIdRef.current },
    )

    setResult(next)

    const prev = previousZoneIdRef.current
    const curr = next.currentZoneId

    // 상태 전이 이벤트 트리거 — prev !== curr 일 때만. leave → enter 순서.
    if (prev !== curr) {
      if (prev !== null) {
        leaveCallbackRef.current?.(prev)
      }
      if (curr !== null) {
        enterCallbackRef.current?.(curr)
      }
      previousZoneIdRef.current = curr
    }
  }, [position, zones])

  return { result, onEnterZone, onLeaveZone }
}
