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
 * Phase 2 범위의 표시 항목 (체크포인트 ⓒ 완료 기준):
 *  - Fallback Level
 *  - FPS
 *  - 메모리 (Chromium 전용 `performance.memory.usedJSHeapSize`)
 *  - 카메라 권한 / 자이로 권한
 *  - 스폰 수 (현재 씬에 살아있는 인스턴스)
 *  - 마지막 포획 시각
 *  - 카메라 해상도 (getSettings 결과)
 */

import { useEffect, useState } from 'react'
import type { FallbackLevel } from '../lib/detectFallbackLevel'
import type { PermissionState } from '../hooks/useArPermissions'
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
}

function formatMemoryMB(): string {
  if (typeof performance === 'undefined') return '—'
  const mem = (performance as MemoryWithHeap).memory
  if (!mem || typeof mem.usedJSHeapSize !== 'number') return 'N/A'
  return `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`
}

function formatCapturedAt(ts: number | null): string {
  if (ts === null) return '—'
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function DevDiagnosticPanel(props: DevDiagnosticPanelProps) {
  const [open, setOpen] = useState(true)
  const [memoryText, setMemoryText] = useState<string>('—')

  // 메모리는 1초 단위 재측정. rAF 루프 안에 넣지 않아 본 씬 성능 영향 최소.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const update = () => setMemoryText(formatMemoryMB())
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  // 프로덕션에서 이 컴포넌트가 어떤 이유로든 렌더되면 즉시 null 반환.
  // dynamic import 가드가 실패해도 UI 유출 방지.
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
        <dd className={styles.val}>{formatCapturedAt(props.lastCapturedAt)}</dd>

        <dt className={styles.key}>Cam res</dt>
        <dd className={styles.val}>
          {props.cameraResolution
            ? `${props.cameraResolution.width}×${props.cameraResolution.height}`
            : '—'}
        </dd>

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
