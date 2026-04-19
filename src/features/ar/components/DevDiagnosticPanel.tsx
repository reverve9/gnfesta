/**
 * DEV 전용 AR 진단 패널.
 *
 * 역할:
 *  - /ar/play 하단에 반투명 오버레이로 표시
 *  - `import.meta.env.DEV` 가드 뒤에서 dynamic import 되어 프로덕션 번들 제외
 *  - 탭 영역(스폰 버튼 dock) 과 겹치지 않도록 좌측 정렬·접이식
 *
 * 프로덕션 번들 제거 원칙:
 *  - PlayPage 에서는 `import.meta.env.DEV && ...` 로 감싼 lazy(() => import(...))
 *    또는 조건부 dynamic import 로 이 컴포넌트를 로드한다.
 *  - 이 파일 자체도 `import.meta.env.DEV` 런타임 가드를 함께 두어 2중 안전.
 *
 * Phase 3-R2 재설계 (필드 변경):
 *  - `currentZoneId` · `lastPollingAt` 제거 (다중 zone 모델 폐기).
 *  - geofence: inside/outside · distanceToCenter (m) · geofence_radius_m (설정값).
 *  - scheduler: nextSpawnEta (ms) · accumulatedDistanceM (m) · lastSpawnAt ·
 *                lastRejectedDelta · capture_cooldown_sec (설정값, R3 참조용).
 */

import { useEffect, useState } from 'react'
import type { FallbackLevel } from '../lib/detectFallbackLevel'
import type { PermissionState } from '../hooks/useArPermissions'
import type { FestivalSettingsDto } from '../lib/api'
import styles from './DevDiagnosticPanel.module.css'

type MemoryWithHeap = Performance & {
  memory?: { usedJSHeapSize?: number }
}

export interface DevDiagnosticPanelProps {
  level: FallbackLevel
  fps: number
  cameraPermission: PermissionState
  gyroPermission: PermissionState
  spawnCount: number
  lastCapturedAt: number | null
  cameraResolution: { width: number; height: number } | null
  /** 에러 로그. 화면 하단에 최근 1건만 노출. */
  lastError?: string | null
  // --- Phase 3 공통 ---
  gpsPermission?: PermissionState
  gpsPosition?: { lat: number; lng: number; accuracy: number } | null
  activeToken?: string | null
  /** spawn token 만료 시각 (ms epoch). 남은 초 카운트다운 표시용. */
  activeTokenExpiresAt?: number | null
  // --- Phase 3-R2 신규 (geofence + scheduler) ---
  settings?: FestivalSettingsDto | null
  inside?: boolean
  distanceToCenter?: number | null
  nextSpawnEta?: number | null
  accumulatedDistanceM?: number
  lastSpawnAt?: number | null
  lastRejectedDelta?: { distanceM: number; timestamp: number } | null
}

function formatMemoryMB(): string {
  if (typeof performance === 'undefined') return '—'
  const mem = (performance as MemoryWithHeap).memory
  if (!mem || typeof mem.usedJSHeapSize !== 'number') return 'N/A'
  return `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return '—'
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatMeters(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—'
  if (m < 1) return `${m.toFixed(2)}m`
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(2)}km`
}

function formatEtaSec(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${s}s`
}

export default function DevDiagnosticPanel(props: DevDiagnosticPanelProps) {
  const [open, setOpen] = useState(true)
  const [memoryText, setMemoryText] = useState<string>('—')
  const [tokenCountdown, setTokenCountdown] = useState<string>('—')

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const update = () => setMemoryText(formatMemoryMB())
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const tick = () => {
      const exp = props.activeTokenExpiresAt
      if (!exp) {
        setTokenCountdown('—')
        return
      }
      const remaining = Math.max(0, Math.round((exp - Date.now()) / 1000))
      setTokenCountdown(`${remaining}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [props.activeTokenExpiresAt])

  if (!import.meta.env.DEV) return null

  if (!open) {
    return (
      <button
        type="button"
        className={styles.toggleOpen}
        onClick={() => setOpen(true)}
        aria-label="DEV 진단 패널 열기"
      >
        DEV ▴
      </button>
    )
  }

  const s = props.settings
  const insideLabel =
    props.inside === undefined ? '—' : props.inside ? 'inside' : 'outside'
  const radiusLabel = s ? `${s.geofence_radius_m}m` : '—'
  const cooldownLabel = s ? `${s.capture_cooldown_sec}s` : '—'

  return (
    <div className={styles.panel} role="region" aria-label="DEV 진단 패널">
      <button
        type="button"
        className={styles.toggleClose}
        onClick={() => setOpen(false)}
        aria-label="DEV 진단 패널 접기"
      >
        접기 ▾
      </button>
      <dl className={styles.grid}>
        <dt className={styles.key}>Level</dt>
        <dd className={styles.val}>
          <span className={`${styles.levelBadge} ${styles[`level${props.level}`]}`}>
            L{props.level}
          </span>
        </dd>

        <dt className={styles.key}>FPS</dt>
        <dd className={styles.val}>{props.fps}</dd>

        <dt className={styles.key}>Memory</dt>
        <dd className={styles.val}>{memoryText}</dd>

        <dt className={styles.key}>Camera</dt>
        <dd className={styles.val}>{props.cameraPermission}</dd>

        <dt className={styles.key}>Gyro</dt>
        <dd className={styles.val}>{props.gyroPermission}</dd>

        <dt className={styles.key}>Spawned</dt>
        <dd className={styles.val}>{props.spawnCount}</dd>

        <dt className={styles.key}>Captured@</dt>
        <dd className={styles.val}>{formatTime(props.lastCapturedAt)}</dd>

        <dt className={styles.key}>Cam res</dt>
        <dd className={styles.val}>
          {props.cameraResolution
            ? `${props.cameraResolution.width}×${props.cameraResolution.height}`
            : '—'}
        </dd>

        <dt className={styles.key}>GPS</dt>
        <dd className={styles.val}>
          {props.gpsPermission ?? '—'}
          {props.gpsPosition
            ? ` · ${props.gpsPosition.lat.toFixed(5)}, ${props.gpsPosition.lng.toFixed(5)} ±${Math.round(props.gpsPosition.accuracy)}m`
            : ''}
        </dd>

        <dt className={styles.key}>Geofence</dt>
        <dd className={styles.val}>
          {insideLabel} · radius {radiusLabel} · dist {formatMeters(props.distanceToCenter)}
        </dd>

        <dt className={styles.key}>Next spawn</dt>
        <dd className={styles.val}>{formatEtaSec(props.nextSpawnEta)}</dd>

        <dt className={styles.key}>Moved</dt>
        <dd className={styles.val}>
          {formatMeters(props.accumulatedDistanceM ?? 0)}
          {s ? ` / ${s.movement_bonus_distance_m}m` : ''}
        </dd>

        <dt className={styles.key}>Last spawn</dt>
        <dd className={styles.val}>{formatTime(props.lastSpawnAt)}</dd>

        <dt className={styles.key}>Token</dt>
        <dd className={styles.val}>
          {props.activeToken
            ? `${props.activeToken.slice(0, 8)}… (${tokenCountdown})`
            : '—'}
        </dd>

        <dt className={styles.key}>Cooldown</dt>
        <dd className={styles.val}>{cooldownLabel} (R3)</dd>

        {props.lastRejectedDelta && (
          <>
            <dt className={styles.key}>GPS spike</dt>
            <dd className={styles.val}>
              {formatMeters(props.lastRejectedDelta.distanceM)} @ {formatTime(props.lastRejectedDelta.timestamp)}
            </dd>
          </>
        )}

        {props.lastError && (
          <>
            <dt className={styles.key}>Error</dt>
            <dd className={styles.valError}>{props.lastError}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
