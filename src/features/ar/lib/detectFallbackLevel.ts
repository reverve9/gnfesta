/**
 * AR 폴백 계단 감지.
 *
 * Level 정의 (AR_MODULE_PROJECT_BRIEF v0.3 §4):
 *   Level 1 — 카메라 O + 자이로 O → ArScene + GyroController 활성
 *   Level 2 — 카메라 O + 자이로 X → ArScene (정적 중앙 배치)
 *   Level 3 — 카메라 O + WebGL 저사양 → FallbackRenderer (2D 스프라이트)
 *   Level 4 — 카메라 X / iOS 16.4 미만 → /ar/fallback 리다이렉트
 *
 * 감지 원칙:
 *  - **UA 파싱 금지** (Phase 0 발견사항: iOS UA Frozen). feature detection only.
 *  - Level 4 초기 감지는 `getUserMedia` 존재 여부만으로 판정. 권한 단계 이전.
 *  - Level 3 저사양 감지는 Phase 2 에서 **감지 지점과 스위치 구조만** 확립.
 *    FPS 기반 동적 강등은 호출부가 `averageFps` 를 넘겨줄 때만 발동.
 *  - Phase 7 에서 정교화 (GPU 블랙리스트·메모리 프리셋 등).
 */

export type FallbackLevel = 1 | 2 | 3 | 4

export type CameraPermissionInput =
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'pending'
  | 'idle'

export type GyroPermissionInput =
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'not-required'
  | 'pending'
  | 'idle'

export interface FallbackInputs {
  cameraPermission: CameraPermissionInput
  gyroPermission: GyroPermissionInput
  /** WebGL context 생성 성공 여부. false 면 Level 3 강등. */
  webglSupported: boolean
  /** 2초 이상 관측된 평균 FPS. 20 이하면 Level 3 강등. 미관측이면 undefined. */
  averageFps?: number
}

/**
 * 라우트 진입 직후 호출. 가장 강한 조건(Level 4) 만 판정.
 * getUserMedia 미지원 = iOS 16.4 미만, 구형 브라우저 등.
 */
export function detectInitialFallbackLevel(): FallbackLevel {
  if (typeof navigator === 'undefined') return 4
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return 4
  return 1
}

/**
 * 런타임 단계 감지. 카메라 권한 결과·자이로 권한 결과·WebGL·FPS 종합.
 * 호출 시점에 맞춰 Level 1 → 2 → 3 → 4 로 순차 강등.
 */
export function detectFallbackLevel(inputs: FallbackInputs): FallbackLevel {
  // Level 4 — 카메라 미지원/거부 시 대체 경로.
  if (
    inputs.cameraPermission === 'denied' ||
    inputs.cameraPermission === 'unsupported'
  ) {
    return 4
  }
  // 카메라 권한이 아직 확정 전이면 상위 상태로 가정 (UI 진행용).
  // 실제 강등은 granted 확정 후 재평가됨.

  // Level 3 — WebGL 실패 또는 저 FPS.
  if (!inputs.webglSupported) return 3
  if (typeof inputs.averageFps === 'number' && inputs.averageFps <= 20) return 3

  // Level 2 — 카메라 OK, 자이로 거부/미지원.
  if (
    inputs.gyroPermission === 'denied' ||
    inputs.gyroPermission === 'unsupported'
  ) {
    return 2
  }

  // Level 1 — 모두 OK (또는 자이로 권한이 not-required: Android 등).
  return 1
}

/**
 * 라우트 진입 시 WebGL 지원 감지. canvas context 생성 시도.
 * throw 없이 boolean 반환.
 */
export function detectWebGLSupport(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return !!ctx
  } catch {
    return false
  }
}

/**
 * 현재 Level 에 대해 어떤 렌더러를 사용해야 하는지 헬퍼.
 *  - 1, 2 : ArScene (자이로 활성 여부만 다름)
 *  - 3    : FallbackRenderer
 *  - 4    : 렌더러 없음 → `/ar/fallback` 라우트 이동
 */
export type RendererKind = 'ar-scene' | 'fallback-2d' | 'redirect-fallback-route'

export function rendererForLevel(level: FallbackLevel): RendererKind {
  if (level === 4) return 'redirect-fallback-route'
  if (level === 3) return 'fallback-2d'
  return 'ar-scene'
}
