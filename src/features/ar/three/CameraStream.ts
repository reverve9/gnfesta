/**
 * getUserMedia 카메라 스트림 래퍼.
 *
 * TestScene.ts 와 독립 — TechTestPage 에 인라인되어 있던 권한·스트림 처리 로직을
 * Phase 2 ArScene 파이프라인에서 재사용 가능하도록 모듈화.
 *
 * 라이프사이클:
 *   new → start() → attachTo(video) → pause()/resume() ↔ dispose()
 *
 * Visibility / 세션 관리는 외부(`useArSceneLifecycle`)가 pause/resume 호출로 주관.
 */

export type CameraStartResult =
  | { status: 'granted'; stream: MediaStream; settings: MediaTrackSettings }
  | { status: 'denied'; error: string }
  | { status: 'unsupported'; error: string }
  | { status: 'hardware-error'; error: string }

export interface CameraStreamOptions {
  /** 시작 시 요청할 해상도 힌트. Phase 0 발견에 따라 VGA 기본값 회피 (1280x720 ideal). */
  width?: number
  height?: number
  /** facingMode. 기본 후면(환경) 카메라. */
  facingMode?: 'environment' | 'user'
}

const DEFAULT_OPTIONS: Required<CameraStreamOptions> = {
  width: 1280,
  height: 720,
  facingMode: 'environment',
}

export class CameraStream {
  private stream: MediaStream | null = null
  private disposed = false
  private attachedVideo: HTMLVideoElement | null = null
  private readonly options: Required<CameraStreamOptions>

  constructor(options: CameraStreamOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 카메라 권한 요청 + 스트림 취득. 3종 실패(denied/unsupported/hardware-error) 를 구분 반환.
   * iOS Safari 에서는 사용자 터치 콜백 내에서 호출돼야 권한 팝업이 뜸.
   */
  async start(): Promise<CameraStartResult> {
    if (this.disposed) {
      return { status: 'hardware-error', error: 'CameraStream disposed' }
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return { status: 'unsupported', error: 'mediaDevices.getUserMedia 미지원' }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.options.facingMode },
          width: { ideal: this.options.width },
          height: { ideal: this.options.height },
        },
        audio: false,
      })
      if (this.disposed) {
        stream.getTracks().forEach(t => t.stop())
        return { status: 'hardware-error', error: 'disposed during start' }
      }
      this.stream = stream
      const settings = stream.getVideoTracks()[0]?.getSettings() ?? {}
      return { status: 'granted', stream, settings }
    } catch (e) {
      const name = e instanceof Error ? e.name : 'UnknownError'
      const msg = e instanceof Error ? e.message : String(e)
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { status: 'denied', error: `${name}: ${msg}` }
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return { status: 'hardware-error', error: `${name}: ${msg}` }
      }
      return { status: 'unsupported', error: `${name}: ${msg}` }
    }
  }

  /** 취득한 스트림을 `<video>` 엘리먼트에 연결하고 재생 시작. */
  async attachTo(video: HTMLVideoElement): Promise<void> {
    if (!this.stream) throw new Error('CameraStream.attachTo: not started')
    this.attachedVideo = video
    if (video.srcObject !== this.stream) {
      video.srcObject = this.stream
    }
    video.playsInline = true
    video.muted = true
    await video.play().catch(() => {
      // 자동재생 정책으로 실패해도 스트림 자체는 살아있음 → 상위에서 UI 안내
    })
  }

  /** Page Visibility hidden 시 호출. track.enabled=false 로 프레임 공급 중단 (권한 재요청 회피). */
  pause(): void {
    this.stream?.getTracks().forEach(t => (t.enabled = false))
  }

  /** Visibility visible 복귀 시 호출. */
  resume(): void {
    this.stream?.getTracks().forEach(t => (t.enabled = true))
  }

  /** 완전 정리. track.stop() 으로 카메라 인디케이터 끔. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.attachedVideo && this.attachedVideo.srcObject === this.stream) {
      this.attachedVideo.srcObject = null
    }
    this.attachedVideo = null
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
  }

  get isDisposed(): boolean {
    return this.disposed
  }
}
