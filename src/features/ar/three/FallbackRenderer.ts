/**
 * Level 3 폴백 렌더러 — 2D canvas 스프라이트 오버레이.
 *
 * Phase 2 범위: **스켈레톤만**. 실제 스프라이트 이미지 로딩·애니메이션은 Phase 7 에서 완성.
 *  - API 인터페이스만 확정 (spawn/despawn/clear/pause/resume/dispose)
 *  - init 시 2D context 획득 + 빈 draw 루프 구동
 *  - 저사양 단말 감지 후 ArScene 대신 이 렌더러로 스위칭하는 연결점
 *
 * 왜 Three.js 가 아닌가:
 *  - Level 3 조건 = "WebGL 저사양/성능 부족". Three.js 자체를 쓸 수 없는 경우.
 *  - Canvas 2D 는 WebGL 없이 동작, 메모리·CPU 부담 최소.
 */

export interface FallbackRendererOptions {
  canvas: HTMLCanvasElement
  onError?: (error: Error) => void
}

interface SpawnedSprite {
  id: string
  /** Phase 7 에서 확장: rarity·model_url 기반 placeholder 이미지 선택. */
  rarity: 'common' | 'rare' | 'legendary'
  x: number
  y: number
}

export class FallbackRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly onError?: (e: Error) => void

  private ctx: CanvasRenderingContext2D | null = null
  private sprites = new Map<string, SpawnedSprite>()

  private rafId: number | null = null
  private running = false
  private disposed = false
  private initialized = false

  private readonly handleResize = () => this.resize()

  constructor(options: FallbackRendererOptions) {
    this.canvas = options.canvas
    this.onError = options.onError
  }

  init(): boolean {
    if (this.disposed || this.initialized) return this.initialized
    try {
      const ctx = this.canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable')
      }
      this.ctx = ctx
      this.resize()
      window.addEventListener('resize', this.handleResize)
      window.addEventListener('orientationchange', this.handleResize)
      this.initialized = true
      return true
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      this.onError?.(err)
      return false
    }
  }

  start(): void {
    if (this.disposed || !this.initialized || this.running) return
    this.running = true
    this.tick()
  }

  pause(): void {
    if (!this.running) return
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resume(): void {
    if (this.disposed || !this.initialized || this.running) return
    this.start()
  }

  /**
   * 스프라이트 추가. Phase 2 스켈레톤 단계에서는 화면 중앙 근처에 배치하는 placeholder.
   * Phase 7 에서 rarity 별 이미지·애니메이션·tap 판정 완성.
   */
  spawnSprite(id: string, rarity: SpawnedSprite['rarity']): void {
    if (this.disposed) return
    if (this.sprites.has(id)) return
    const w = this.canvas.width
    const h = this.canvas.height
    this.sprites.set(id, {
      id,
      rarity,
      x: w / 2,
      y: h / 2,
    })
  }

  despawnSprite(id: string): void {
    this.sprites.delete(id)
  }

  clearSprites(): void {
    this.sprites.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pause()
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('orientationchange', this.handleResize)
    this.sprites.clear()
    this.ctx = null
    this.initialized = false
  }

  get isRunning(): boolean {
    return this.running
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  get spriteCount(): number {
    return this.sprites.size
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2)
    const cssW = this.canvas.clientWidth || window.innerWidth
    const cssH = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private tick = (): void => {
    if (!this.running || this.disposed || !this.ctx) return
    this.rafId = requestAnimationFrame(this.tick)
    const ctx = this.ctx
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    ctx.clearRect(0, 0, w, h)
    // Phase 2 스켈레톤: rarity 별 색상 원으로 placeholder.
    for (const s of this.sprites.values()) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 24, 0, Math.PI * 2)
      ctx.fillStyle =
        s.rarity === 'legendary'
          ? '#FFD54F'
          : s.rarity === 'rare'
            ? '#64B5F6'
            : '#A5D6A7'
      ctx.fill()
    }
  }
}
