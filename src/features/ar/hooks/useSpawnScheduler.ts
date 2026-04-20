/**
 * 스폰 스케줄러 훅 — Phase 3-R2.
 *
 * 책임
 *  - `enabled === true` + `position !== null` 일 때만 활성.
 *  - 시간 트리거: 마지막 스폰으로부터 `spawnIntervalSec` 경과 시 `postArSpawn` 호출.
 *  - 이동 트리거: 마지막 스폰 이후 누적 이동 거리가 `movementBonusDistanceM` 이상이면 호출.
 *  - 두 트리거 중 하나라도 발동하면 스폰 · 양쪽 리셋 (중복 방지).
 *  - 활성 currentSpawn 이 아직 `expires_at` 전이면 재호출 생략 (서버 reused:true 를 클라에서 선제 억제).
 *  - 이벤트 간 이동 거리 > 100m 는 GPS 튐 의심으로 누적 제외 + `lastRejectedDelta` 로 보고.
 *
 * 비책임 (R3/Phase 4 범위)
 *  - 쿨다운 실제 적용 (필드는 옵션에 포함되나 본 훅은 읽지 않음 — DevPanel 이 settings 직접 참조).
 *  - 서버 geofence 검증 / 속도 필터 / rarity 분포 설정 반영.
 *  - 포획 API 호출.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isSpawnServerRejection,
  postArSpawn,
  type SpawnResponseOk,
  type SpawnResponseServerRejection,
} from '../lib/api'
import { haversineMeters } from '../lib/geo'
import type { GpsPosition } from './useGpsPosition'

/** 단일 이벤트 간 누적 이동 거리 이상치 상한(m) 기본값. 옵션 미주입 시 폴백. */
const DEFAULT_MOVEMENT_OUTLIER_CAP_M = 100

export interface SpawnSchedulerOptions {
  /** geofence inside + GPS 획득 + phone 존재 등 상위 조건이 모두 참일 때 true. */
  enabled: boolean
  phone: string
  position: GpsPosition | null
  /** 시간 트리거 주기(초). settings.spawn_interval_sec 그대로 주입. */
  spawnIntervalSec: number
  /** 이동 트리거 임계(m). settings.movement_bonus_distance_m. */
  movementBonusDistanceM: number
  /** 발급 토큰 TTL(초). settings.capture_token_ttl_sec. expires_at 판정 보조용. */
  captureTokenTtlSec: number
  /**
   * 이동 이상치 상한(m). settings.movement_outlier_cap_m.
   * 미주입 시 {@link DEFAULT_MOVEMENT_OUTLIER_CAP_M} 폴백. Phase 3-R3 신설.
   */
  movementOutlierCapM?: number
}

/**
 * 서버가 `reason` 필드로 거절한 최신 응답 요약. Q1=γ 결정.
 * outside_geofence / cooldown 발생 시 DevPanel 표시용.
 */
export interface LastServerRejection {
  reason: SpawnResponseServerRejection['reason']
  detail: string
  timestamp: number
}

export interface SpawnSchedulerState {
  /** 마지막 성공 스폰 시각(ms epoch). null = 아직 없음. */
  lastSpawnAt: number | null
  /** 다음 시간 트리거까지 남은 ms. null = 비활성. */
  nextSpawnEta: number | null
  /** 마지막 스폰 이후 누적 이동 거리(m). 이동 트리거 리셋 시 0. */
  accumulatedDistanceM: number
  /** 현재 활성 spawn (null = 없음 or 만료). */
  currentSpawn: SpawnResponseOk['spawn'] | null
  /** 이상치로 제외된 마지막 델타. DevPanel 관찰용. */
  lastRejectedDelta: { distanceM: number; timestamp: number } | null
  /**
   * 서버가 reason 필드로 거절한 최신 응답 (outside_geofence / cooldown).
   * Q1=γ: 토스트·오버레이 전환 없이 DevPanel 에만 표시.
   */
  lastServerRejection: LastServerRejection | null
  /** 마지막 에러 메시지. */
  error: string | null
  /**
   * 포획 성공 시 호출 — currentSpawn 을 즉시 null 로 리셋 + 시간 트리거 기준 시각을
   * 지금으로 재설정. 다음 스폰은 포획 시점에서 `spawnIntervalSec` 후 재발동.
   * 누적 이동 거리는 유지 (이동 트리거 독립성 보장).
   *
   * Phase 2 의 로컬 captured state 와 조합하여 R2 포획 흐름을 완성. Phase 4 에서
   * 서버 `/api/ar/capture` 도입 시 해당 RPC 응답 후 호출 예정.
   */
  markCaptured: () => void
}

export function useSpawnScheduler(opts: SpawnSchedulerOptions): SpawnSchedulerState {
  const {
    enabled,
    phone,
    position,
    spawnIntervalSec,
    movementBonusDistanceM,
    movementOutlierCapM,
  } = opts
  const outlierCap = movementOutlierCapM ?? DEFAULT_MOVEMENT_OUTLIER_CAP_M

  const [lastSpawnAt, setLastSpawnAt] = useState<number | null>(null)
  const [nextSpawnEta, setNextSpawnEta] = useState<number | null>(null)
  const [accumulatedDistanceM, setAccumulatedDistanceM] = useState(0)
  const [currentSpawn, setCurrentSpawn] = useState<SpawnResponseOk['spawn'] | null>(null)
  const [lastRejectedDelta, setLastRejectedDelta] = useState<
    { distanceM: number; timestamp: number } | null
  >(null)
  const [lastServerRejection, setLastServerRejection] =
    useState<LastServerRejection | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 최신값 ref — 비동기 콜백·타이머 안에서 closure stale 방지
  const lastSpawnAtRef = useRef<number | null>(null)
  const accumulatedRef = useRef(0)
  const currentSpawnRef = useRef<SpawnResponseOk['spawn'] | null>(null)
  const inFlightRef = useRef(false)
  const lastPositionRef = useRef<GpsPosition | null>(null)
  const enabledRef = useRef(enabled)
  const phoneRef = useRef(phone)
  const intervalSecRef = useRef(spawnIntervalSec)
  const outlierCapRef = useRef(outlierCap)

  lastSpawnAtRef.current = lastSpawnAt
  accumulatedRef.current = accumulatedDistanceM
  currentSpawnRef.current = currentSpawn
  enabledRef.current = enabled
  phoneRef.current = phone
  intervalSecRef.current = spawnIntervalSec
  outlierCapRef.current = outlierCap

  const resetScheduler = useCallback(() => {
    lastSpawnAtRef.current = null
    accumulatedRef.current = 0
    currentSpawnRef.current = null
    lastPositionRef.current = null
    inFlightRef.current = false
    setLastSpawnAt(null)
    setNextSpawnEta(null)
    setAccumulatedDistanceM(0)
    setCurrentSpawn(null)
    setError(null)
    setLastServerRejection(null)
  }, [])

  const markCaptured = useCallback(() => {
    const now = Date.now()
    currentSpawnRef.current = null
    lastSpawnAtRef.current = now
    setCurrentSpawn(null)
    setLastSpawnAt(now)
    // accumulatedRef / setAccumulatedDistanceM 는 건드리지 않음 — 이동 트리거 독립성 유지.
  }, [])

  const triggerSpawn = useCallback(async () => {
    if (inFlightRef.current) return
    if (!enabledRef.current) return
    const pos = lastPositionRef.current
    const ph = phoneRef.current
    if (!pos || !ph) return

    // 활성 currentSpawn 이 아직 유효하면 재호출 생략
    const cur = currentSpawnRef.current
    if (cur && Date.parse(cur.expires_at) > Date.now()) return

    inFlightRef.current = true
    const resp = await postArSpawn({ phone: ph, lat: pos.lat, lng: pos.lng })
    inFlightRef.current = false
    if (!enabledRef.current) return // 요청 중 비활성화 → 결과 무시

    if (!resp.ok) {
      // Q1=γ: 서버 reason 거절(outside_geofence / cooldown)은 토스트·에러 없이
      // DevPanel 표시용 lastServerRejection 에만 기록. 다음 틱에서 자연 재시도.
      if (isSpawnServerRejection(resp)) {
        const detail =
          resp.reason === 'outside_geofence'
            ? `distance ${resp.distance_m ?? '?'}m`
            : `retry after ${resp.retry_after_sec ?? '?'}s`
        setLastServerRejection({
          reason: resp.reason,
          detail,
          timestamp: Date.now(),
        })
        return
      }
      setError(`${resp.result}${resp.message ? `: ${resp.message}` : ''}`)
      return
    }

    const now = Date.now()
    currentSpawnRef.current = resp.spawn
    lastSpawnAtRef.current = now
    accumulatedRef.current = 0
    setCurrentSpawn(resp.spawn)
    setLastSpawnAt(now)
    setAccumulatedDistanceM(0)
    setError(null)
  }, [])

  // 활성 토글 — enabled false 가 되면 전체 리셋
  useEffect(() => {
    if (!enabled) {
      resetScheduler()
    }
  }, [enabled, resetScheduler])

  // position 변화 → 이동 트리거 판정
  useEffect(() => {
    if (!enabled || !position) {
      lastPositionRef.current = null
      return
    }
    const prev = lastPositionRef.current
    lastPositionRef.current = position
    if (!prev) return // 최초 샘플은 기준점 설정만

    const delta = haversineMeters(prev.lat, prev.lng, position.lat, position.lng)
    if (delta > outlierCapRef.current) {
      setLastRejectedDelta({ distanceM: delta, timestamp: Date.now() })
      return
    }
    if (delta <= 0) return

    const nextAcc = accumulatedRef.current + delta
    accumulatedRef.current = nextAcc
    setAccumulatedDistanceM(nextAcc)

    if (nextAcc >= movementBonusDistanceM) {
      // 이동 트리거 → 스폰 (누적은 성공 시 triggerSpawn 이 0 으로 리셋)
      triggerSpawn()
    }
  }, [enabled, position, movementBonusDistanceM, triggerSpawn])

  // 시간 트리거 + nextSpawnEta 갱신 (1Hz)
  useEffect(() => {
    if (!enabled) {
      setNextSpawnEta(null)
      return
    }
    // 최초 스폰 기준 마련 (아직 스폰 전이면 지금을 기준점으로 삼아 interval 후 첫 스폰)
    if (lastSpawnAtRef.current === null) {
      const now = Date.now()
      lastSpawnAtRef.current = now
      setLastSpawnAt(now)
    }
    const tick = () => {
      if (!enabledRef.current) return
      const last = lastSpawnAtRef.current ?? Date.now()
      const intervalMs = intervalSecRef.current * 1000
      const elapsed = Date.now() - last
      const remaining = intervalMs - elapsed
      setNextSpawnEta(Math.max(0, remaining))
      if (remaining <= 0) {
        triggerSpawn() // 성공 시 내부에서 lastSpawnAt 갱신 → 다음 tick 이 새 interval 기준
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
    // spawnIntervalSec 변경 시 effect 재가동 (세션 중 변경은 없지만 안전상)
  }, [enabled, spawnIntervalSec, triggerSpawn])

  // currentSpawn 만료 시 정리 (시간 tick 안에서 처리해도 되지만 독립 effect 로 분리)
  useEffect(() => {
    if (!currentSpawn) return
    const ms = Math.max(0, Date.parse(currentSpawn.expires_at) - Date.now())
    const id = window.setTimeout(() => {
      if (currentSpawnRef.current === currentSpawn) {
        currentSpawnRef.current = null
        setCurrentSpawn(null)
      }
    }, ms)
    return () => window.clearTimeout(id)
  }, [currentSpawn])

  return {
    lastSpawnAt,
    nextSpawnEta,
    accumulatedDistanceM,
    currentSpawn,
    lastRejectedDelta,
    lastServerRejection,
    error,
    markCaptured,
  }
}
