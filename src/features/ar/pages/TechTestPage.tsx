import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import styles from './TechTestPage.module.css'

type PermStatus = 'prompt' | 'granted' | 'denied' | 'unsupported' | 'not-required'

interface Permissions {
  gps: PermStatus
  camera: PermStatus
  orientation: PermStatus
}

interface Diagnostics {
  userAgent: string
  webgl: 'WebGL 2' | 'WebGL 1' | 'none'
  gpu: string | null
  orientationSupported: boolean
  cameraResolution: { width: number; height: number } | null
  fps: number
  safeArea: { top: string; right: string; bottom: string; left: string }
  errors: string[]
}

type FallbackLevel = 1 | 2 | 3 | 4

interface SceneHandle {
  dispose: () => void
  setParallax: (enabled: boolean) => void
}

const INITIAL_PERMS: Permissions = {
  gps: 'prompt',
  camera: 'prompt',
  orientation: 'prompt',
}

const INITIAL_DIAG: Diagnostics = {
  userAgent: '',
  webgl: 'none',
  gpu: null,
  orientationSupported: false,
  cameraResolution: null,
  fps: 0,
  safeArea: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
  errors: [],
}

async function requestGeolocation(): Promise<PermStatus> {
  if (!('geolocation' in navigator)) return 'unsupported'
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('denied'), 12000)
    navigator.geolocation.getCurrentPosition(
      () => {
        clearTimeout(timer)
        resolve('granted')
      },
      (err) => {
        clearTimeout(timer)
        resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'unsupported')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

async function requestCamera(): Promise<{ status: PermStatus; stream: MediaStream | null; error?: string }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: 'unsupported', stream: null, error: 'mediaDevices.getUserMedia 미지원' }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    return { status: 'granted', stream }
  } catch (err) {
    const name = err instanceof Error ? err.name : 'UnknownError'
    const msg = err instanceof Error ? err.message : String(err)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return { status: 'denied', stream: null, error: `${name}: ${msg}` }
    }
    return { status: 'unsupported', stream: null, error: `${name}: ${msg}` }
  }
}

async function requestOrientation(): Promise<PermStatus> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return 'unsupported'
  }
  const DOE = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const result = await DOE.requestPermission()
      return result === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'denied'
    }
  }
  return 'not-required'
}

function detectWebGL(): { webgl: Diagnostics['webgl']; gpu: string | null } {
  try {
    const c = document.createElement('canvas')
    const gl2 = c.getContext('webgl2')
    if (gl2) {
      const ext = gl2.getExtension('WEBGL_debug_renderer_info')
      const gpu = ext ? (gl2.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : null
      return { webgl: 'WebGL 2', gpu: gpu || null }
    }
    const gl1 = c.getContext('webgl') || c.getContext('experimental-webgl')
    if (gl1) {
      const wgl1 = gl1 as WebGLRenderingContext
      const ext = wgl1.getExtension('WEBGL_debug_renderer_info')
      const gpu = ext ? (wgl1.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : null
      return { webgl: 'WebGL 1', gpu: gpu || null }
    }
  } catch {
    // ignore
  }
  return { webgl: 'none', gpu: null }
}

function readSafeArea(): Diagnostics['safeArea'] {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const result = {
    top: cs.paddingTop || '0px',
    right: cs.paddingRight || '0px',
    bottom: cs.paddingBottom || '0px',
    left: cs.paddingLeft || '0px',
  }
  document.body.removeChild(probe)
  return result
}

function computeLevel(p: Permissions, webgl: Diagnostics['webgl']): FallbackLevel {
  if (p.camera !== 'granted') return 4
  if (webgl === 'none') return 3
  if (p.orientation === 'denied' || p.orientation === 'unsupported') return 2
  return 1
}

function PermBadge({ status }: { status: PermStatus }) {
  const cls =
    status === 'granted'
      ? styles.permGranted
      : status === 'denied'
        ? styles.permDenied
        : status === 'unsupported'
          ? styles.permUnsupported
          : status === 'not-required'
            ? styles.permNotRequired
            : styles.permPrompt
  const label =
    status === 'granted'
      ? 'granted'
      : status === 'denied'
        ? 'denied'
        : status === 'unsupported'
          ? 'unsupported'
          : status === 'not-required'
            ? 'not-required'
            : 'prompt'
  return <span className={`${styles.permBadge} ${cls}`}>{label}</span>
}

function LevelBadge({ level }: { level: FallbackLevel }) {
  const cls =
    level === 1
      ? styles.level1
      : level === 2
        ? styles.level2
        : level === 3
          ? styles.level3
          : styles.level4
  return <span className={`${styles.levelBadge} ${cls}`}>Level {level}</span>
}

export default function TechTestPage() {
  const navigate = useNavigate()
  const [started, setStarted] = useState(false)
  const [permissions, setPermissions] = useState<Permissions>(INITIAL_PERMS)
  const [diag, setDiag] = useState<Diagnostics>(INITIAL_DIAG)
  const [panelOpen, setPanelOpen] = useState(true)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<SceneHandle | null>(null)

  const cleanup = useCallback(() => {
    sceneRef.current?.dispose()
    sceneRef.current = null
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  const handleBack = useCallback(() => {
    cleanup()
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/', { replace: true })
    }
  }, [cleanup, navigate])

  const pushError = useCallback((msg: string) => {
    setDiag((d) => ({ ...d, errors: [...d.errors, msg] }))
  }, [])

  const handleStart = useCallback(async (skipOrientation: boolean = false) => {
    setStarted(true)

    const orientationPromise: Promise<PermStatus> = skipOrientation
      ? Promise.resolve('denied')
      : requestOrientation()

    const gpsStatus = await requestGeolocation()
    setPermissions((p) => ({ ...p, gps: gpsStatus }))

    const { status: cameraStatus, stream: mediaStream, error: cameraErr } = await requestCamera()
    setPermissions((p) => ({ ...p, camera: cameraStatus }))
    if (cameraErr) pushError(`camera: ${cameraErr}`)

    if (mediaStream) {
      setStream(mediaStream)
      const track = mediaStream.getVideoTracks()[0]
      const settings = track?.getSettings()
      if (settings?.width && settings?.height) {
        setDiag((d) => ({
          ...d,
          cameraResolution: { width: settings.width!, height: settings.height! },
        }))
      }
    }

    const orientationStatus = await orientationPromise
    setPermissions((p) => ({ ...p, orientation: orientationStatus }))

    const { webgl, gpu } = detectWebGL()
    setDiag((d) => ({
      ...d,
      userAgent: navigator.userAgent,
      webgl,
      gpu,
      orientationSupported: orientationStatus !== 'unsupported',
      safeArea: readSafeArea(),
    }))
  }, [pushError])

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
      cleanup()
    }
  }, [cleanup])

  // 카메라 스트림 → <video> 엘리먼트 연결
  // 렌더 후 실행되므로 videoRef.current 가 null 이 되는 레이스 컨디션 방지
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    if (video.srcObject === stream) return
    video.srcObject = stream
    video.play().catch((err) => {
      pushError(`video.play: ${err instanceof Error ? err.message : String(err)}`)
    })
  }, [stream, pushError])

  // Three.js 씬 초기화
  // - 조건: started + 카메라 허용 + WebGL 지원 + 자이로 결과 확정 + canvas ref 연결
  // - 렌더 후 실행되어 canvasRef 가 보장됨 (useEffect 시점)
  useEffect(() => {
    if (!started) return
    if (permissions.camera !== 'granted') return
    if (permissions.orientation === 'prompt') return // 자이로 결과 대기
    if (diag.webgl === 'none') return
    const canvas = canvasRef.current
    if (!canvas) return
    if (sceneRef.current) return // idempotent

    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('../three/TestScene')
        if (cancelled || !canvasRef.current) return
        sceneRef.current = mod.createScene({
          canvas: canvasRef.current,
          enableParallax:
            permissions.orientation === 'granted' || permissions.orientation === 'not-required',
          onFps: (fps) => setDiag((d) => ({ ...d, fps })),
        })
      } catch (err) {
        pushError(`three: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [started, permissions.camera, permissions.orientation, diag.webgl, pushError])

  const level: FallbackLevel = started ? computeLevel(permissions, diag.webgl) : 1

  if (!started) {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    return (
      <div className={styles.root}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={handleBack}
          aria-label="이전 페이지로"
        >
          <ArrowLeft size={22} />
        </button>
        <div className={styles.intro}>
          <h1 className={styles.introTitle}>AR 기술 검증 테스트</h1>
          <p className={styles.introDesc}>
            이 페이지는 AR 모듈 개발 전 단말·브라우저 호환성을 확인하기 위한 Phase 0 프로토타입입니다.
            아래 버튼을 탭하면 순서대로 위치·카메라·자이로 권한을 요청합니다.
          </p>
          <ul className={styles.permList}>
            <li>1. 위치 권한 (GPS)</li>
            <li>2. 카메라 권한 (후면 카메라 우선)</li>
            <li>3. 자이로 권한 {isIos ? '(iOS는 이 탭 안에서만 요청 가능)' : ''}</li>
          </ul>
          <button type="button" className={styles.startBtn} onClick={() => handleStart(false)}>
            테스트 시작
          </button>
          <button
            type="button"
            className={styles.startBtnSecondary}
            onClick={() => handleStart(true)}
          >
            자이로 없이 시작 (Level 2 검증)
          </button>
          <p className={styles.hint}>권한 거부 시 폴백 레벨이 자동 진입합니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={handleBack}
        aria-label="이전 페이지로"
      >
        <ArrowLeft size={22} />
      </button>
      <div className={styles.stage}>
        {level < 4 && (
          <>
            <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
            <canvas ref={canvasRef} className={styles.canvas} />
          </>
        )}

        {level === 4 && (
          <div className={styles.fallback4}>
            <h2 className={styles.fallback4Title}>AR을 사용할 수 없습니다</h2>
            <p className={styles.fallback4Desc}>
              카메라 권한이 없거나 단말이 AR을 지원하지 않습니다.
              실제 서비스에서는 스탬프랠리 등 대체 참여 경로로 안내됩니다.
            </p>
          </div>
        )}

        {level > 1 && level < 4 && (
          <div className={styles.fallbackBanner}>폴백 진입 — Level {level}</div>
        )}

        <div className={styles.diagnostics} style={{ display: panelOpen ? 'block' : 'none' }}>
          <button
            type="button"
            className={styles.diagToggle}
            onClick={() => setPanelOpen(false)}
          >
            진단 패널 접기 ▾
          </button>
          <dl className={styles.diagGrid}>
            <dt className={styles.diagKey}>Level</dt>
            <dd className={styles.diagVal}>
              <LevelBadge level={level} />
            </dd>

            <dt className={styles.diagKey}>GPS</dt>
            <dd className={styles.diagVal}>
              <PermBadge status={permissions.gps} />
            </dd>

            <dt className={styles.diagKey}>Camera</dt>
            <dd className={styles.diagVal}>
              <PermBadge status={permissions.camera} />
            </dd>

            <dt className={styles.diagKey}>Orientation</dt>
            <dd className={styles.diagVal}>
              <PermBadge status={permissions.orientation} />
            </dd>

            <dt className={styles.diagKey}>WebGL</dt>
            <dd className={styles.diagVal}>{diag.webgl}</dd>

            {diag.gpu && (
              <>
                <dt className={styles.diagKey}>GPU</dt>
                <dd className={styles.diagVal}>{diag.gpu}</dd>
              </>
            )}

            <dt className={styles.diagKey}>Camera res</dt>
            <dd className={styles.diagVal}>
              {diag.cameraResolution
                ? `${diag.cameraResolution.width}×${diag.cameraResolution.height}`
                : '—'}
            </dd>

            <dt className={styles.diagKey}>FPS</dt>
            <dd className={styles.diagVal}>{diag.fps}</dd>

            <dt className={styles.diagKey}>Safe Area</dt>
            <dd className={styles.diagVal}>
              T {diag.safeArea.top} / B {diag.safeArea.bottom}
            </dd>

            <dt className={styles.diagKey}>UA</dt>
            <dd className={styles.diagVal}>{diag.userAgent}</dd>

            {diag.errors.length > 0 && (
              <>
                <dt className={styles.diagKey}>Errors</dt>
                <dd className={styles.diagVal}>{diag.errors.join(' | ')}</dd>
              </>
            )}
          </dl>
        </div>

        {!panelOpen && (
          <button
            type="button"
            className={styles.diagToggle}
            style={{ top: 'auto', bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
            onClick={() => setPanelOpen(true)}
          >
            진단 패널 ▴
          </button>
        )}
      </div>
    </div>
  )
}
