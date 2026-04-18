/**
 * /ar/play — Phase 2-E / 2-F 실구현.
 *
 * 플로우:
 *   Mount → detectInitialFallbackLevel
 *     ├─ L4 → /ar/fallback 즉시 redirect
 *     └─ L1~L3 가능 → 인트로 표시 ("시작" 버튼)
 *   [사용자 터치] 시작 버튼 → 자이로 권한 → 카메라 권한 (iOS gesture chain 유지 순서)
 *     ├─ 카메라 denied/unsupported → L4 redirect
 *     └─ granted → video 연결 + ArScene or FallbackRenderer 부트
 *   스폰 버튼 → rarity 필터 → CreatureLoader.load → ArScene.spawnCreature + state push
 *   canvas pointerdown → ArScene.pickCreatureAt → 해당 SpawnedCreature.captured=true 토글 + 토스트
 *
 * 제약 (Phase 2 범위):
 *  - **서버 통신 일체 없음**: /api/ar/*, capture_creature RPC, issue_spawn_token 미호출.
 *  - 전부 로컬 state 반영만. 서버 동기화는 Phase 3 이후.
 *  - 더미 스폰 = rarity 선택 기반 로컬 randomization (PLACEHOLDER_CREATURES).
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ArScene } from '../three/ArScene'
import { CreatureLoader } from '../three/CreatureLoader'
import { FallbackRenderer } from '../three/FallbackRenderer'
import { useArPermissions } from '../hooks/useArPermissions'
import { useArSceneLifecycle } from '../hooks/useArSceneLifecycle'
import {
  detectFallbackLevel,
  detectInitialFallbackLevel,
  detectWebGLSupport,
  rendererForLevel,
  type CameraPermissionInput,
  type FallbackLevel,
  type GyroPermissionInput,
} from '../lib/detectFallbackLevel'
import type { PermissionState } from '../hooks/useArPermissions'
import {
  PLACEHOLDER_CREATURES,
  pickPlaceholderByRarity,
  resolveCreatureModelUrl,
  type ArRarity,
  type PlaceholderCreature,
} from '../lib/assets'
import styles from './PlayPage.module.css'
import * as THREE from 'three'

// DEV 패널은 프로덕션 번들에서 제외되도록 lazy + import.meta.env.DEV 가드.
const DevDiagnosticPanel = import.meta.env.DEV
  ? lazy(() => import('../components/DevDiagnosticPanel'))
  : null

interface SpawnedCreature {
  instanceId: string
  creatureDefId: string
  name: string
  rarity: ArRarity
  spawnedAt: number
  captured: boolean
}

const RARITY_OPTIONS: { value: ArRarity; label: string; className: string }[] = [
  { value: 'common', label: '일반', className: 'segmentCommon' },
  { value: 'rare', label: '희귀', className: 'segmentRare' },
  { value: 'legendary', label: '전설', className: 'segmentLegendary' },
]

function randomSpawnPosition(): THREE.Vector3 {
  // 카메라 정면 (z=0 기준) 주변에 랜덤. 화면에 충분히 잡히도록 범위 제한.
  const x = (Math.random() - 0.5) * 2.2
  const y = (Math.random() - 0.5) * 1.2
  const z = -2 + Math.random() * 0.8
  return new THREE.Vector3(x, y, z)
}

function toCameraInput(s: PermissionState): CameraPermissionInput {
  // 카메라는 'not-required' 가 발생하지 않으나(항상 권한 필요), 타입 폭을 좁혀 매핑.
  if (s === 'not-required') return 'idle'
  return s
}

function toGyroInput(s: PermissionState): GyroPermissionInput {
  return s
}

function scaleForCreature(id: string): number {
  // 플레이스홀더 모델 크기 격차 보정. Fox 는 원본이 매우 커서 축소 필요.
  if (id === 'placeholder-fox') return 0.01
  if (id === 'placeholder-cesium-man') return 0.8
  return 1
}

export default function PlayPage() {
  const navigate = useNavigate()
  const permissionsApi = useArPermissions()
  const { permissions, requestCamera, requestGyro, cameraStreamRef, gyroControllerRef } =
    permissionsApi

  const [started, setStarted] = useState(false)
  const [booting, setBooting] = useState(false)
  const [level, setLevel] = useState<FallbackLevel>(1)
  const [webglSupported, setWebglSupported] = useState<boolean>(true)
  const [spawned, setSpawned] = useState<SpawnedCreature[]>([])
  const [selectedRarity, setSelectedRarity] = useState<ArRarity>('common')
  const [toast, setToast] = useState<string | null>(null)
  const [fps, setFps] = useState<number>(0)
  const [cameraResolution, setCameraResolution] = useState<{
    width: number
    height: number
  } | null>(null)
  const [lastCapturedAt, setLastCapturedAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<ArScene | null>(null)
  const fallbackRendererRef = useRef<FallbackRenderer | null>(null)
  const creatureLoaderRef = useRef<CreatureLoader | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 초기 Level 4 감지 (iOS 16.4 미만 / getUserMedia 미지원)
  useEffect(() => {
    const initial = detectInitialFallbackLevel()
    if (initial === 4) {
      navigate('/ar/fallback', { replace: true })
      return
    }
    setWebglSupported(detectWebGLSupport())
  }, [navigate])

  // 권한 상태 변화에 따른 level 재평가
  useEffect(() => {
    if (!started) return
    const next = detectFallbackLevel({
      cameraPermission: toCameraInput(permissions.camera),
      gyroPermission: toGyroInput(permissions.gyro),
      webglSupported,
      averageFps: fps > 0 ? fps : undefined,
    })
    setLevel(next)
    if (next === 4) {
      navigate('/ar/fallback', { replace: true })
    }
  }, [started, permissions.camera, permissions.gyro, webglSupported, fps, navigate])

  // 라이프사이클 훅 (Visibility → pause/resume, unmount → dispose)
  useArSceneLifecycle({
    sceneRef,
    cameraStreamRef,
    debug: import.meta.env.DEV,
  })

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 1500)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // "시작" 버튼 — 사용자 터치 gesture chain 안에서 권한 요청 → 스트림 → 씬 부트
  const handleStart = useCallback(async () => {
    if (booting || started) return
    setBooting(true)
    setLastError(null)
    try {
      // iOS 에서 자이로는 터치 직후 gesture chain 이 필요하므로 먼저 요청.
      await requestGyro()
      const { state: camState, result: camResult } = await requestCamera()
      if (camState !== 'granted' || !camResult || camResult.status !== 'granted') {
        setLastError(
          camResult && 'error' in camResult ? camResult.error : '카메라 권한 필요',
        )
        navigate('/ar/fallback', { replace: true })
        return
      }
      if (camResult.settings.width && camResult.settings.height) {
        setCameraResolution({
          width: camResult.settings.width,
          height: camResult.settings.height,
        })
      }
      setStarted(true)
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e))
    } finally {
      setBooting(false)
    }
  }, [booting, started, requestCamera, requestGyro, navigate])

  // video element 에 스트림 연결 (started 후 렌더된 video ref 로 effect 에서 처리)
  useEffect(() => {
    if (!started) return
    const video = videoRef.current
    const cam = cameraStreamRef.current
    if (!video || !cam) return
    cam.attachTo(video).catch(err => {
      setLastError(`video.attach: ${err instanceof Error ? err.message : String(err)}`)
    })
  }, [started, cameraStreamRef])

  // 씬 부트 — level 에 따라 ArScene 또는 FallbackRenderer 선택
  useEffect(() => {
    if (!started) return
    if (permissions.camera !== 'granted') return
    const canvas = canvasRef.current
    if (!canvas) return
    if (sceneRef.current || fallbackRendererRef.current) return // idempotent

    const kind = rendererForLevel(level)
    if (kind === 'redirect-fallback-route') return

    if (kind === 'ar-scene') {
      const gyroCtrl = gyroControllerRef.current
      const useGyro =
        permissions.gyro === 'granted' || permissions.gyro === 'not-required'
      const scene = new ArScene({
        canvas,
        gyro: useGyro && gyroCtrl ? gyroCtrl : undefined,
        onFps: setFps,
        onError: err => setLastError(`scene: ${err.message}`),
      })
      if (!scene.init()) {
        setWebglSupported(false)
        return
      }
      scene.start()
      sceneRef.current = scene
      creatureLoaderRef.current = new CreatureLoader({
        onError: (url, err) => setLastError(`load ${url}: ${err.message}`),
      })
    } else if (kind === 'fallback-2d') {
      const fb = new FallbackRenderer({
        canvas,
        onError: err => setLastError(`fallback2d: ${err.message}`),
      })
      if (!fb.init()) return
      fb.start()
      fallbackRendererRef.current = fb
    }
  }, [started, permissions.camera, permissions.gyro, level, gyroControllerRef])

  // 스폰 — 선택한 rarity 의 placeholder 하나 랜덤 pick → 로드 → 씬에 추가
  const handleSpawn = useCallback(async () => {
    const candidates = PLACEHOLDER_CREATURES.filter(c => c.rarity === selectedRarity)
    const base: PlaceholderCreature | undefined =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : pickPlaceholderByRarity(selectedRarity)
    if (!base) {
      setLastError(`rarity=${selectedRarity} 에 해당하는 플레이스홀더 없음`)
      return
    }
    const instanceId = `inst-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const pos = randomSpawnPosition()

    if (sceneRef.current) {
      const loader = creatureLoaderRef.current
      if (!loader) return
      const { root, animations } = await loader.load(resolveCreatureModelUrl(base))
      const s = scaleForCreature(base.id)
      root.scale.setScalar(s)
      root.userData.creatureInstanceId = instanceId
      sceneRef.current.spawnCreature(instanceId, root, animations, pos)
    } else if (fallbackRendererRef.current) {
      fallbackRendererRef.current.spawnSprite(instanceId, base.rarity)
    } else {
      return
    }

    setSpawned(prev => [
      ...prev,
      {
        instanceId,
        creatureDefId: base.id,
        name: base.name,
        rarity: base.rarity,
        spawnedAt: Date.now(),
        captured: false,
      },
    ])
  }, [selectedRarity])

  // 캔버스 터치 → raycast → 크리처 id 발견 → captured=true 토글 + 토스트
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      const hitId = sceneRef.current?.pickCreatureAt({ x, y }) ?? null
      if (!hitId) return
      let capturedFirstTime = false
      setSpawned(prev =>
        prev.map(sc => {
          if (sc.instanceId !== hitId) return sc
          if (!sc.captured) capturedFirstTime = true
          return { ...sc, captured: true }
        }),
      )
      if (capturedFirstTime) {
        setLastCapturedAt(Date.now())
        const target = spawned.find(s => s.instanceId === hitId)
        showToast(target ? `포획! ${target.name}` : '포획!')
      }
    },
    [spawned, showToast],
  )

  const spawnCount = sceneRef.current?.creatureCount ?? spawned.length

  const hudChipText = useMemo(() => {
    const total = spawned.length
    const captured = spawned.filter(s => s.captured).length
    return `포획 ${captured}/${total}`
  }, [spawned])

  // ---- 렌더 ----

  if (!started) {
    return (
      <div className={styles.root}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate(-1)}
          aria-label="이전 페이지로"
        >
          <ArrowLeft size={22} />
        </button>
        <div className={styles.intro}>
          <h1 className={styles.introTitle}>AR 탐험</h1>
          <p className={styles.introDesc}>
            시작 버튼을 누르면 카메라와 자이로 권한을 요청합니다.
            <br />
            iOS 는 이 버튼을 탭한 순간에만 자이로 권한이 뜹니다.
          </p>
          <ul className={styles.permList}>
            <li>1. 자이로 권한 (iOS)</li>
            <li>2. 카메라 권한 (후면 카메라 우선)</li>
          </ul>
          <button
            type="button"
            className={styles.startBtn}
            onClick={handleStart}
            disabled={booting}
          >
            {booting ? '권한 요청 중…' : '시작'}
          </button>
          {lastError && (
            <p className={styles.hint} style={{ color: '#C62828' }}>
              {lastError}
            </p>
          )}
          <p className={styles.hint}>
            권한 거부 시 자동으로 폴백 페이지로 이동합니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => navigate(-1)}
        aria-label="이전 페이지로"
      >
        <ArrowLeft size={22} />
      </button>
      <div className={styles.stage}>
        <video
          ref={videoRef}
          className={styles.video}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={handleCanvasPointerDown}
        />

        {level > 1 && (
          <div className={styles.fallbackBanner}>폴백 진입 — Level {level}</div>
        )}

        <div className={styles.hud}>
          <div className={styles.hudChip}>{hudChipText}</div>
        </div>

        <div className={styles.controlDock}>
          <div className={styles.segment} role="radiogroup" aria-label="rarity 선택">
            {RARITY_OPTIONS.map(opt => {
              const active = selectedRarity === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={[
                    styles.segmentBtn,
                    active ? styles.segmentBtnActive : '',
                    active ? styles[opt.className] : '',
                  ].join(' ')}
                  onClick={() => setSelectedRarity(opt.value)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className={styles.spawnBtn}
            onClick={handleSpawn}
            disabled={level >= 4}
          >
            {selectedRarity === 'legendary'
              ? '전설 소환'
              : selectedRarity === 'rare'
                ? '희귀 소환'
                : '일반 소환'}
          </button>
        </div>

        {toast && <div className={styles.toast}>{toast}</div>}

        {DevDiagnosticPanel && (
          <Suspense fallback={null}>
            <DevDiagnosticPanel
              level={level}
              fps={fps}
              cameraPermission={permissions.camera}
              gyroPermission={permissions.gyro}
              spawnCount={spawnCount}
              lastCapturedAt={lastCapturedAt}
              cameraResolution={cameraResolution}
              lastError={lastError}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
