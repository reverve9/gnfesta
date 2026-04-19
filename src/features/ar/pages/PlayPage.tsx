/**
 * /ar/play — Phase 3 실구현 (Phase 2 더미 스폰 철거 · 서버 스폰 + GPS + 미니맵 통합).
 *
 * 플로우:
 *   Mount → detectInitialFallbackLevel (Phase 2 유지)
 *     ├─ L4 → /ar/fallback redirect
 *     └─ phone 없음 → 인트로에서 "스탬프 랠리에서 전화번호 입력" 안내 (시작 disabled)
 *   "시작" 버튼 onClick (iOS gesture chain: gyro → camera → gps 순)
 *     ├─ camera denied → /ar/fallback
 *     ├─ gps denied → started=true 하되 미니맵·spawn 비활성 (UX: 설정 안내)
 *     └─ 모두 OK → started=true
 *   권한 획득 후:
 *     → GET /api/ar/zones — active 구역 목록 1회 로드
 *     → useGpsPosition.start() — watchPosition 지속 추적
 *     → useZoneDetection 가 enter/leave 이벤트 발화
 *     → MiniMap 렌더 (vanilla Leaflet, lazy import)
 *   zone enter:
 *     → postArSpawn → CreatureLoader.load → ArScene.spawnCreature → activeSpawn state
 *   zone leave:
 *     → ArScene.setCreatureVisible(id, false) + activeSpawn state 유지 (zone 재진입 시 재활용)
 *   30초 폴링 백업:
 *     → currentZoneId 존재 + activeSpawn 없거나 만료면 postArSpawn 재시도
 *     → 서버가 기존 토큰 재사용(reused:true) 로 응답하면 동일 creature 렌더
 *   캔버스 탭:
 *     → pickCreatureAt → 로컬 captured=true (Phase 2 로직 유지)
 *     → 실제 /api/ar/capture 호출은 Phase 4
 *
 * Phase 2 회귀 보호:
 *   - ArScene / CreatureLoader / GyroController / CameraStream 수정 안 함.
 *   - ArScene.setCreatureVisible 만 신규 호출 (Phase 3 에서 허용된 단일 추가).
 *   - 자이로 이슈·기술 부채 #1 무관.
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
import * as THREE from 'three'
import { ArScene } from '../three/ArScene'
import { CreatureLoader } from '../three/CreatureLoader'
import { FallbackRenderer } from '../three/FallbackRenderer'
import { useArPermissions } from '../hooks/useArPermissions'
import { useArSceneLifecycle } from '../hooks/useArSceneLifecycle'
import { useGpsPosition } from '../hooks/useGpsPosition'
import { useZoneDetection } from '../hooks/useZoneDetection'
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
import { resolveCreatureModelUrl } from '../lib/assets'
import type { ArRarity } from '../lib/assets'
import { getArZones, postArSpawn, type ArZoneDto } from '../lib/api'
import { loadLastPhone } from '../../../lib/phone'
import styles from './PlayPage.module.css'

// DEV 패널은 프로덕션 번들에서 제외되도록 lazy + import.meta.env.DEV 가드.
const DevDiagnosticPanel = import.meta.env.DEV
  ? lazy(() => import('../components/DevDiagnosticPanel'))
  : null

// MiniMap 은 Leaflet 번들을 포함하므로 lazy 로 PlayPage 메인 청크 분리.
const MiniMap = lazy(() => import('../components/MiniMap'))

interface ActiveSpawn {
  /** 서버 발급 token. Phase 4 포획 API 에서 사용. */
  token: string
  /** ArScene 내부 Map key. 동일 token → 동일 instanceId 유지 (재방문 시 재사용). */
  instanceId: string
  creatureId: string
  creatureName: string
  rarity: ArRarity
  modelUrl: string
  /** ms epoch. 만료 시 자동 정리. */
  expiresAt: number
  zoneId: string
  captured: boolean
  /** zone leave 시 false, 재enter + 동일 token 시 true 로 복원. */
  visible: boolean
}

function toCameraInput(s: PermissionState): CameraPermissionInput {
  if (s === 'not-required') return 'idle'
  return s
}

function toGyroInput(s: PermissionState): GyroPermissionInput {
  return s
}

function randomSpawnOffset(): THREE.Vector3 {
  // 카메라 정면 (z=-2 기준) 주변에 랜덤 배치. Phase 2 와 동일 범위.
  const x = (Math.random() - 0.5) * 2.2
  const y = (Math.random() - 0.5) * 1.2
  const z = -2 + Math.random() * 0.8
  return new THREE.Vector3(x, y, z)
}

function scaleForModelUrl(url: string): number {
  // Phase 2 플레이스홀더 모델 크기 보정. 실 에셋 전까지 하드코딩 유지 (Phase 5 정리).
  if (url.includes('Fox')) return 0.01
  if (url.includes('CesiumMan')) return 0.8
  return 1
}

const POLLING_INTERVAL_MS = 30_000

export default function PlayPage() {
  const navigate = useNavigate()
  const permissionsApi = useArPermissions()
  const {
    permissions,
    requestCamera,
    requestGyro,
    requestGps,
    cameraStreamRef,
    gyroControllerRef,
  } = permissionsApi

  const [started, setStarted] = useState(false)
  const [booting, setBooting] = useState(false)
  const [level, setLevel] = useState<FallbackLevel>(1)
  const [webglSupported, setWebglSupported] = useState<boolean>(true)
  const [phone, setPhone] = useState<string>('')
  const [zones, setZones] = useState<ArZoneDto[]>([])
  const [zonesError, setZonesError] = useState<string | null>(null)
  const [activeSpawn, setActiveSpawn] = useState<ActiveSpawn | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fps, setFps] = useState<number>(0)
  const [cameraResolution, setCameraResolution] = useState<{
    width: number
    height: number
  } | null>(null)
  const [lastCapturedAt, setLastCapturedAt] = useState<number | null>(null)
  const [lastPollingAt, setLastPollingAt] = useState<number | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<ArScene | null>(null)
  const fallbackRendererRef = useRef<FallbackRenderer | null>(null)
  const creatureLoaderRef = useRef<CreatureLoader | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // activeSpawn 을 effect/콜백에서 최신값으로 참조하기 위한 ref (state 업데이트 후 재호출 없이).
  const activeSpawnRef = useRef<ActiveSpawn | null>(null)
  activeSpawnRef.current = activeSpawn

  const gps = useGpsPosition({ enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 })
  const zoneDetection = useZoneDetection(
    useMemo(
      () =>
        zones.map(z => ({
          id: z.id,
          center_lat: z.center_lat,
          center_lng: z.center_lng,
          radius_m: z.radius_m,
        })),
      [zones],
    ),
    gps.position,
  )
  const currentZoneId = zoneDetection.result.currentZoneId

  // Mount: 초기 Level 4 감지 + phone 자동 로드.
  useEffect(() => {
    const initial = detectInitialFallbackLevel()
    if (initial === 4) {
      navigate('/ar/fallback', { replace: true })
      return
    }
    setWebglSupported(detectWebGLSupport())
    const saved = loadLastPhone()
    if (saved) setPhone(saved)
  }, [navigate])

  // 권한·WebGL·FPS 변화에 따른 level 재평가 (Phase 2 와 동일 로직. GPS 는 level 에 영향 없음).
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
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
      if (tokenExpiryTimerRef.current) clearTimeout(tokenExpiryTimerRef.current)
    }
  }, [])

  // "시작" 버튼 — iOS gesture chain: gyro → camera → gps
  const handleStart = useCallback(async () => {
    if (booting || started) return
    if (!phone) {
      setLastError('전화번호가 필요합니다')
      return
    }
    setBooting(true)
    setLastError(null)
    try {
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
      // GPS — 거부돼도 진입은 허용 (카메라·자이로 는 정상 동작). spawn 만 비활성.
      await requestGps()
      setStarted(true)
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e))
    } finally {
      setBooting(false)
    }
  }, [booting, started, phone, requestCamera, requestGyro, requestGps, navigate])

  // video 스트림 연결 (Phase 2 동일)
  useEffect(() => {
    if (!started) return
    const video = videoRef.current
    const cam = cameraStreamRef.current
    if (!video || !cam) return
    cam.attachTo(video).catch(err => {
      setLastError(`video.attach: ${err instanceof Error ? err.message : String(err)}`)
    })
  }, [started, cameraStreamRef])

  // 씬 부트 (Phase 2 동일. ArScene 구조 건드리지 않음)
  useEffect(() => {
    if (!started) return
    if (permissions.camera !== 'granted') return
    const canvas = canvasRef.current
    if (!canvas) return
    if (sceneRef.current || fallbackRendererRef.current) return

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

  // GPS 활성화 + zone 목록 로드 (started 이후 1회)
  useEffect(() => {
    if (!started) return
    if (permissions.gps === 'granted') {
      gps.start()
    }
    let cancelled = false
    ;(async () => {
      const res = await getArZones()
      if (cancelled) return
      if (res.error) {
        setZonesError(res.error)
        return
      }
      setZones(res.zones)
    })()
    return () => {
      cancelled = true
    }
    // gps.start 는 레퍼런스 변화에 재호출하지 않도록 deps 에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, permissions.gps])

  // 서버 스폰 처리 함수 — enter 이벤트 / 폴링 공용
  const triggerSpawn = useCallback(
    async (zoneId: string, reason: 'enter' | 'poll') => {
      const scene = sceneRef.current
      const loader = creatureLoaderRef.current
      if (!scene || !loader) return
      if (!phone) return
      const pos = gps.position
      if (!pos) return

      if (reason === 'poll') setLastPollingAt(Date.now())

      const resp = await postArSpawn({
        phone,
        zoneId,
        lat: pos.lat,
        lng: pos.lng,
      })
      if (!resp.ok) {
        setLastError(`spawn ${resp.result}${resp.message ? `: ${resp.message}` : ''}`)
        return
      }
      const s = resp.spawn
      const existing = activeSpawnRef.current

      // 기존 활성 스폰이 이미 같은 token 이면 visible 만 복구.
      if (existing && existing.token === s.token) {
        scene.setCreatureVisible(existing.instanceId, true)
        setActiveSpawn({ ...existing, visible: true, zoneId })
        return
      }

      // 다른 token 이면 기존 인스턴스는 숨기고 새 creature 로드.
      if (existing) {
        scene.setCreatureVisible(existing.instanceId, false)
      }

      try {
        const { root, animations } = await loader.load(
          resolveCreatureModelUrl({ model_url: s.model_url }),
        )
        const scale = scaleForModelUrl(s.model_url)
        root.scale.setScalar(scale)
        const instanceId = `inst-${s.token.slice(0, 8)}-${Date.now()}`
        root.userData.creatureInstanceId = instanceId
        scene.spawnCreature(instanceId, root, animations, randomSpawnOffset())
        const expiresAt = new Date(s.expires_at).getTime()
        setActiveSpawn({
          token: s.token,
          instanceId,
          creatureId: s.creature_id,
          creatureName: s.creature_name,
          rarity: s.creature_rarity,
          modelUrl: s.model_url,
          expiresAt,
          zoneId,
          captured: false,
          visible: true,
        })

        // 토큰 만료 시 자동 정리
        if (tokenExpiryTimerRef.current) clearTimeout(tokenExpiryTimerRef.current)
        const ms = Math.max(0, expiresAt - Date.now())
        tokenExpiryTimerRef.current = setTimeout(() => {
          const current = activeSpawnRef.current
          if (current && current.token === s.token) {
            sceneRef.current?.setCreatureVisible(current.instanceId, false)
            setActiveSpawn(null)
          }
        }, ms)
      } catch (e) {
        setLastError(`load: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [phone, gps.position],
  )

  // zone enter/leave 콜백 등록 (단일 슬롯). useEffect cleanup 으로 재등록.
  useEffect(() => {
    if (!started) return
    const unsubEnter = zoneDetection.onEnterZone(zoneId => {
      triggerSpawn(zoneId, 'enter')
    })
    const unsubLeave = zoneDetection.onLeaveZone(() => {
      const existing = activeSpawnRef.current
      if (!existing) return
      sceneRef.current?.setCreatureVisible(existing.instanceId, false)
      setActiveSpawn(prev => (prev ? { ...prev, visible: false } : prev))
    })
    return () => {
      unsubEnter()
      unsubLeave()
    }
  }, [started, zoneDetection, triggerSpawn])

  // 30초 폴링 백업 — zone 안에 있는데 activeSpawn.visible 이 false 이거나 null 이면 재호출
  useEffect(() => {
    if (!started) return
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    pollingTimerRef.current = setInterval(() => {
      const zoneId = zoneDetection.result.currentZoneId
      if (!zoneId) return
      const existing = activeSpawnRef.current
      if (existing && existing.visible && existing.zoneId === zoneId) return
      if (existing && existing.expiresAt > Date.now() && existing.zoneId === zoneId) return
      triggerSpawn(zoneId, 'poll')
    }, POLLING_INTERVAL_MS)
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
  }, [started, zoneDetection.result.currentZoneId, triggerSpawn])

  // 캔버스 탭 — pickCreatureAt → 로컬 captured 토글 (실제 포획 API 는 Phase 4)
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      const hitId = sceneRef.current?.pickCreatureAt({ x, y }) ?? null
      if (!hitId) return
      const current = activeSpawnRef.current
      if (!current || current.instanceId !== hitId) return
      if (current.captured) return
      setActiveSpawn({ ...current, captured: true })
      setLastCapturedAt(Date.now())
      showToast(`포획! ${current.creatureName}`)
    },
    [showToast],
  )

  const hudChipText = useMemo(() => {
    if (!activeSpawn) return '스폰 대기중'
    if (activeSpawn.captured) return `포획 완료 · ${activeSpawn.creatureName}`
    return `스폰중 · ${activeSpawn.creatureName}`
  }, [activeSpawn])

  const zoneStatusText = useMemo(() => {
    if (permissions.gps !== 'granted') return 'GPS 권한 필요'
    if (!gps.position) return '위치 확인 중…'
    if (!currentZoneId) return '구역 밖'
    const z = zones.find(zz => zz.id === currentZoneId)
    return z ? z.name : '구역 안'
  }, [permissions.gps, gps.position, currentZoneId, zones])

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
            시작 버튼을 누르면 자이로·카메라·위치 권한을 순서대로 요청합니다.
            <br />
            구역에 진입하면 AR 캐릭터가 자동 소환됩니다.
          </p>
          <ul className={styles.permList}>
            <li>1. 자이로 권한 (iOS)</li>
            <li>2. 카메라 권한 (후면 카메라 우선)</li>
            <li>3. 위치 권한 (구역 판정용)</li>
          </ul>
          {!phone && (
            <p className={styles.hint} style={{ color: '#C62828' }}>
              AR 탐험은 전화번호가 필요합니다. 먼저 스탬프 랠리 또는 설문 조사에서 전화번호를 입력해주세요.
            </p>
          )}
          <button
            type="button"
            className={styles.startBtn}
            onClick={handleStart}
            disabled={booting || !phone}
          >
            {booting ? '권한 요청 중…' : '시작'}
          </button>
          {lastError && (
            <p className={styles.hint} style={{ color: '#C62828' }}>
              {lastError}
            </p>
          )}
          <p className={styles.hint}>권한 거부 시 폴백 경로로 안내됩니다.</p>
        </div>
      </div>
    )
  }

  const miniMapZones = zones.map(z => ({
    id: z.id,
    name: z.name,
    center_lat: z.center_lat,
    center_lng: z.center_lng,
    radius_m: z.radius_m,
  }))

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
          <div className={styles.hudChip}>{zoneStatusText}</div>
        </div>

        {/* 우측 하단 미니맵 */}
        {permissions.gps === 'granted' && gps.position && (
          <div className={styles.miniMapBox}>
            <Suspense fallback={<div className={styles.miniMapLoading}>지도 로딩…</div>}>
              <MiniMap
                center={{ lat: gps.position.lat, lng: gps.position.lng }}
                zones={miniMapZones}
                currentZoneId={currentZoneId}
                currentAccuracy={gps.position.accuracy}
              />
            </Suspense>
          </div>
        )}

        {permissions.gps !== 'granted' && (
          <div className={styles.gpsNotice}>
            위치 권한이 필요합니다. 브라우저·시스템 설정에서 허용 후 다시 접속해주세요.
          </div>
        )}

        {zonesError && (
          <div className={styles.gpsNotice} style={{ color: '#F59E0B' }}>
            구역 로드 실패: {zonesError}
          </div>
        )}

        {toast && <div className={styles.toast}>{toast}</div>}

        {DevDiagnosticPanel && (
          <Suspense fallback={null}>
            <DevDiagnosticPanel
              level={level}
              fps={fps}
              cameraPermission={permissions.camera}
              gyroPermission={permissions.gyro}
              spawnCount={activeSpawn ? 1 : 0}
              lastCapturedAt={lastCapturedAt}
              cameraResolution={cameraResolution}
              lastError={lastError}
              gpsPermission={permissions.gps}
              gpsPosition={
                gps.position
                  ? {
                      lat: gps.position.lat,
                      lng: gps.position.lng,
                      accuracy: gps.position.accuracy,
                    }
                  : null
              }
              currentZoneId={currentZoneId}
              activeToken={activeSpawn?.token ?? null}
              activeTokenExpiresAt={activeSpawn?.expiresAt ?? null}
              lastPollingAt={lastPollingAt}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
