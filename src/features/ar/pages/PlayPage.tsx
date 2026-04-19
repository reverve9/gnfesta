/**
 * /ar/play — Phase 3 (R1 + R2 완료 상태).
 *
 * Phase 3-R2 재설계 반영:
 *   - 다중 zone → 축제장 단일 geofence.
 *   - zone enter/leave 이벤트 기반 스폰 → 시간·이동 기반 `useSpawnScheduler`.
 *   - `useZoneDetection` · `detectZoneEntry` · `getArZones` 사용 중단.
 *   - geofence 밖: ArScene mount 유지 + 스폰·렌더만 중단 (리소스 토글 대신 Phase 2
 *     자이로 이슈 재현 리스크 최소화 — R2 Q2 결정).
 *
 * 플로우:
 *   Mount → detectInitialFallbackLevel (Phase 2 유지)
 *     ├─ L4 → /ar/fallback redirect
 *     └─ phone 없음 → 시작 disabled
 *   "시작" 버튼 (iOS gesture chain: gyro → camera → gps)
 *     → started=true
 *   권한 획득 후:
 *     → useGpsPosition.start() — watchPosition 지속 추적
 *     → useFestivalGeofence(gps.position) — 설정 fetch + inside/distance 판정
 *     → useSpawnScheduler (enabled = started && gps granted && inside && settings 로드)
 *   scheduler.currentSpawn 변경 시:
 *     → 신규 token 이면 loader.load → ArScene.spawnCreature, activeSpawn state 갱신
 *     → null 이면 기존 activeSpawn 숨김
 *   geofence 밖:
 *     → 스케줄러 자동 비활성 · currentSpawn null → activeSpawn 숨김
 *     → 오버레이로 "축제장까지 XXm" 안내 표시
 *   캔버스 탭:
 *     → pickCreatureAt → 로컬 captured=true (Phase 2 로직 유지, 실 포획 API 는 Phase 4)
 *
 * Phase 2 회귀 보호:
 *   - ArScene / CreatureLoader / GyroController / CameraStream 수정 없음.
 *   - ArScene.setCreatureVisible 만 호출 (Phase 3 허용 단일 추가).
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
import { useFestivalGeofence } from '../hooks/useFestivalGeofence'
import { useSpawnScheduler } from '../hooks/useSpawnScheduler'
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
import { formatPhone, isValidPhone, loadLastPhone, saveLastPhone } from '../../../lib/phone'
import { readDebugFlag } from '../lib/debugFlag'
import styles from './PlayPage.module.css'

// DEV 빌드 또는 ?debug=1 / localStorage 플래그가 있을 때만 lazy chunk 를 실제 로드.
// Production 번들은 정상 분리(분리된 chunk 는 플래그가 true 일 때만 요청됨).
const DevDiagnosticPanel = lazy(() => import('../components/DevDiagnosticPanel'))

// MiniMap 은 Leaflet 번들을 포함하므로 lazy 로 PlayPage 메인 청크 분리.
const MiniMap = lazy(() => import('../components/MiniMap'))

interface ActiveSpawn {
  /** 서버 발급 token. Phase 4 포획 API 에서 사용. */
  token: string
  /** ArScene 내부 Map key. 동일 token → 동일 instanceId 유지. */
  instanceId: string
  creatureId: string
  creatureName: string
  rarity: ArRarity
  modelUrl: string
  /** ms epoch. 만료 시 자동 정리. */
  expiresAt: number
  captured: boolean
  /** geofence outside 시 false, 재진입 + 동일 token 시 true 로 복원. */
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

function formatMeters(m: number | null): string {
  if (m === null) return '—'
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(2)}km`
}

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
  const [activeSpawn, setActiveSpawn] = useState<ActiveSpawn | null>(null)
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
  const activeSpawnRef = useRef<ActiveSpawn | null>(null)
  activeSpawnRef.current = activeSpawn

  const gps = useGpsPosition({ enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 })
  const geofence = useFestivalGeofence(gps.position)

  const schedulerEnabled =
    started &&
    permissions.gps === 'granted' &&
    geofence.inside &&
    geofence.settings !== null
  const scheduler = useSpawnScheduler({
    enabled: schedulerEnabled,
    phone,
    position: gps.position,
    spawnIntervalSec: geofence.settings?.spawn_interval_sec ?? 45,
    movementBonusDistanceM: geofence.settings?.movement_bonus_distance_m ?? 50,
    captureTokenTtlSec: geofence.settings?.capture_token_ttl_sec ?? 60,
  })

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

  // 권한·WebGL·FPS 변화에 따른 level 재평가 (Phase 2 로직 유지).
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
    }
  }, [])

  // "시작" 버튼 — iOS gesture chain: gyro → camera → gps
  const handleStart = useCallback(async () => {
    if (booting || started) return
    if (!isValidPhone(phone)) {
      setLastError('전화번호를 올바른 형식으로 입력해주세요 (010-XXXX-XXXX)')
      return
    }
    saveLastPhone(phone)
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
      // GPS 거부돼도 진입은 허용 (카메라·자이로는 정상). spawn 만 비활성.
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

  // GPS 활성화 (started + 권한 획득 후)
  useEffect(() => {
    if (!started) return
    if (permissions.gps === 'granted') {
      gps.start()
    }
    // gps.start 는 레퍼런스 변화에 재호출하지 않도록 deps 에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, permissions.gps])

  // 스케줄러 에러 → lastError 로 노출
  useEffect(() => {
    if (scheduler.error) setLastError(`spawn: ${scheduler.error}`)
  }, [scheduler.error])

  // scheduler.currentSpawn 변화 → 모델 로드/숨김/전환
  useEffect(() => {
    const s = scheduler.currentSpawn
    const scene = sceneRef.current
    const loader = creatureLoaderRef.current
    if (!scene || !loader) return

    if (!s) {
      const existing = activeSpawnRef.current
      if (existing && existing.visible) {
        scene.setCreatureVisible(existing.instanceId, false)
        setActiveSpawn({ ...existing, visible: false })
      }
      return
    }

    const existing = activeSpawnRef.current
    // 동일 token → 가시성만 복원
    if (existing && existing.token === s.token) {
      scene.setCreatureVisible(existing.instanceId, true)
      if (!existing.visible) {
        setActiveSpawn({ ...existing, visible: true })
      }
      return
    }

    // 다른 token → 기존 숨김 + 신규 로드
    if (existing) {
      scene.setCreatureVisible(existing.instanceId, false)
    }

    let cancelled = false
    ;(async () => {
      try {
        const { root, animations } = await loader.load(
          resolveCreatureModelUrl({ model_url: s.model_url }),
        )
        if (cancelled) return
        root.scale.setScalar(scaleForModelUrl(s.model_url))
        const instanceId = `inst-${s.token.slice(0, 8)}-${Date.now()}`
        root.userData.creatureInstanceId = instanceId
        sceneRef.current?.spawnCreature(instanceId, root, animations, randomSpawnOffset())
        setActiveSpawn({
          token: s.token,
          instanceId,
          creatureId: s.creature_id,
          creatureName: s.creature_name,
          rarity: s.creature_rarity,
          modelUrl: s.model_url,
          expiresAt: Date.parse(s.expires_at),
          captured: false,
          visible: true,
        })
      } catch (e) {
        if (!cancelled) setLastError(`load: ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scheduler.currentSpawn])

  // 캔버스 탭 — pickCreatureAt → 로컬 captured 토글 (실제 포획 API 는 Phase 4)
  // R2 보완: 소멸 + 스케줄러 리셋 연결 (크리처 시각 제거 + 다음 스폰 45s 후 재개).
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
      sceneRef.current?.setCreatureVisible(current.instanceId, false)
      setActiveSpawn({ ...current, captured: true, visible: false })
      setLastCapturedAt(Date.now())
      showToast(`포획! ${current.creatureName}`)
      scheduler.markCaptured()
    },
    [showToast, scheduler],
  )

  const hudChipText = useMemo(() => {
    if (!activeSpawn || !activeSpawn.visible) return '스폰 대기중'
    if (activeSpawn.captured) return `포획 완료 · ${activeSpawn.creatureName}`
    return `스폰중 · ${activeSpawn.creatureName}`
  }, [activeSpawn])

  const geofenceStatusText = useMemo(() => {
    if (permissions.gps !== 'granted') return 'GPS 권한 필요'
    if (!gps.position) return '위치 확인 중…'
    if (!geofence.settings) return '설정 로딩…'
    if (geofence.inside) return '축제장 안'
    return `축제장까지 ${formatMeters(geofence.distanceToCenter)}`
  }, [permissions.gps, gps.position, geofence])

  const miniMapGeofence = useMemo(
    () =>
      geofence.settings
        ? {
            center: {
              lat: geofence.settings.center_lat,
              lng: geofence.settings.center_lng,
            },
            radiusM: geofence.settings.geofence_radius_m,
          }
        : null,
    [geofence.settings],
  )

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
            축제장 안에 있을 때 AR 캐릭터가 시간·이동에 따라 자동 소환됩니다.
          </p>
          <ul className={styles.permList}>
            <li>1. 자이로 권한 (iOS)</li>
            <li>2. 카메라 권한 (후면 카메라 우선)</li>
            <li>3. 위치 권한 (축제장 geofence 판정용)</li>
          </ul>
          {!isValidPhone(phone) && (
            <div className={styles.phoneField}>
              <label className={styles.phoneLabel} htmlFor="ar-phone-input">
                전화번호
              </label>
              <input
                id="ar-phone-input"
                className={styles.phoneInput}
                type="tel"
                inputMode="numeric"
                placeholder="010-0000-0000"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                maxLength={13}
                autoComplete="tel"
              />
              <p className={styles.phoneHint}>
                입력하신 번호는 포획 기록·경품 발급에 사용됩니다.
              </p>
            </div>
          )}
          <button
            type="button"
            className={styles.startBtn}
            onClick={handleStart}
            disabled={booting || !isValidPhone(phone)}
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
          <div className={styles.hudChip}>{geofenceStatusText}</div>
        </div>

        {/* 우측 하단 미니맵 — geofence 설정 로드 후 렌더 */}
        {permissions.gps === 'granted' && miniMapGeofence && (
          <div className={styles.miniMapBox}>
            <Suspense fallback={<div className={styles.miniMapLoading}>지도 로딩…</div>}>
              <MiniMap
                userPosition={
                  gps.position
                    ? { lat: gps.position.lat, lng: gps.position.lng }
                    : null
                }
                geofence={miniMapGeofence}
                inside={geofence.inside}
                currentAccuracy={gps.position?.accuracy ?? 0}
              />
            </Suspense>
          </div>
        )}

        {permissions.gps !== 'granted' && (
          <div className={styles.gpsNotice}>
            위치 권한이 필요합니다. 브라우저·시스템 설정에서 허용 후 다시 접속해주세요.
          </div>
        )}

        {geofence.settingsError && (
          <div className={styles.gpsNotice} style={{ color: '#F59E0B' }}>
            설정 로드 실패: {geofence.settingsError}
          </div>
        )}

        {/* geofence 밖: 축제장 안내 오버레이 */}
        {permissions.gps === 'granted' &&
          gps.position &&
          geofence.settings &&
          !geofence.inside && (
            <div className={styles.outsideOverlay}>
              <div className={styles.outsideCard}>
                <h2 className={styles.outsideTitle}>축제장에서 만나요</h2>
                <p className={styles.outsideDesc}>
                  {geofence.settings.name}
                  <br />
                  현장에 도착하면 AR 게임이 시작됩니다.
                </p>
                <p className={styles.outsideDist}>
                  현 위치까지 거리: {formatMeters(geofence.distanceToCenter)}
                </p>
              </div>
            </div>
          )}

        {toast && <div className={styles.toast}>{toast}</div>}

        {readDebugFlag() && (
          <Suspense fallback={null}>
            <DevDiagnosticPanel
              level={level}
              fps={fps}
              cameraPermission={permissions.camera}
              gyroPermission={permissions.gyro}
              spawnCount={activeSpawn && activeSpawn.visible ? 1 : 0}
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
              activeToken={activeSpawn?.token ?? null}
              activeTokenExpiresAt={activeSpawn?.expiresAt ?? null}
              settings={geofence.settings}
              inside={geofence.inside}
              distanceToCenter={geofence.distanceToCenter}
              nextSpawnEta={scheduler.nextSpawnEta}
              accumulatedDistanceM={scheduler.accumulatedDistanceM}
              lastSpawnAt={scheduler.lastSpawnAt}
              lastRejectedDelta={scheduler.lastRejectedDelta}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
