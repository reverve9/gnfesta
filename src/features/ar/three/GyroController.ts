/**
 * DeviceOrientation 자이로 컨트롤러.
 *
 * TestScene 에서 분리·확장:
 *  - iOS 16+ `DeviceOrientationEvent.requestPermission()` 플로우 포함
 *  - 권한·값 스냅샷을 외부에서 polling 가능 (ArScene rAF 루프에서 `getOffset()` 호출)
 *  - setEnabled() 리스너 중복 등록 가드 (TestScene `setParallax` 패턴 재활용)
 *
 * 시차 효과 매핑 상수는 TestScene.ts 에서 그대로 이식 (실기 검증 완료 값):
 *   tx = clamp(gamma/45 * 2, -2, 2)
 *   ty = clamp(beta/45 * 1.5, -1.5, 1.5)
 *   damping = 0.1 (ArScene 렌더 루프에서 position lerp 시 적용)
 */

export type GyroPermissionState =
  | 'idle'
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'not-required'

export interface GyroOffset {
  /** 좌우 기울기 (-2 ~ 2, 화면 x 축) */
  tx: number
  /** 상하 기울기 (-1.5 ~ 1.5, 화면 y 축) */
  ty: number
}

export const GYRO_DAMPING = 0.1

// iOS 16+ 권한 요청 메서드. 타입 정의가 lib.dom 에 없어 로컬 타입으로 축소.
type DeviceOrientationEventStatic = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export class GyroController {
  private permission: GyroPermissionState = 'idle'
  private enabled = false
  private disposed = false
  private offset: GyroOffset = { tx: 0, ty: 0 }
  private readonly handler = (e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0
    const gamma = e.gamma ?? 0
    this.offset.tx = clamp((gamma / 45) * 2, -2, 2)
    this.offset.ty = clamp((beta / 45) * 1.5, -1.5, 1.5)
  }

  /**
   * iOS 16+ 권한 요청. **반드시 사용자 터치 이벤트 핸들러 내부에서 호출**.
   * 안드로이드·데스크톱 등 requestPermission 이 없으면 'not-required' 반환.
   */
  async requestPermission(): Promise<GyroPermissionState> {
    if (this.disposed) return this.permission
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      this.permission = 'unsupported'
      return this.permission
    }
    const Ctor = window.DeviceOrientationEvent as DeviceOrientationEventStatic
    if (typeof Ctor.requestPermission === 'function') {
      try {
        const result = await Ctor.requestPermission()
        this.permission = result === 'granted' ? 'granted' : 'denied'
      } catch {
        this.permission = 'denied'
      }
      return this.permission
    }
    this.permission = 'not-required'
    return this.permission
  }

  /** 자이로 리스너 등록/해제. idempotent — 같은 상태로 재호출 시 no-op. */
  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return
    if (enabled) {
      // 권한이 명시적으로 granted 또는 not-required 일 때만 실제 활성화
      if (this.permission !== 'granted' && this.permission !== 'not-required') return
      window.addEventListener('deviceorientation', this.handler)
      this.enabled = true
    } else {
      window.removeEventListener('deviceorientation', this.handler)
      this.enabled = false
      this.offset.tx = 0
      this.offset.ty = 0
    }
  }

  /** rAF 루프에서 매 프레임 호출해 현재 오프셋을 가져감. 리스너 비활성 시 (0,0). */
  getOffset(): GyroOffset {
    return this.offset
  }

  get permissionState(): GyroPermissionState {
    return this.permission
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('deviceorientation', this.handler)
    this.enabled = false
  }
}
