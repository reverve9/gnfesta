/**
 * AR 씬 통합 클래스 — 렌더러·씬·카메라·rAF 루프·creature 관리·리사이즈·FPS 리포트.
 *
 * TestScene.ts 에서 재활용:
 *  - WebGLRenderer 옵션 (alpha:true, antialias:true, DPR clamp min(dpr, 2))
 *  - setSize(w, h, false) — CSS 사이즈 외부 관리 (카메라 배경 오버레이 전제)
 *  - 리사이즈 핸들러 (resize + orientationchange 양쪽)
 *  - rAF 루프의 disposed 플래그 → return → 재예약 순서 (unmount 1프레임 누출 방지)
 *  - FPS 카운팅 (1초 단위 콜백)
 *  - GyroController 의 tx/ty → position lerp (damping GYRO_DAMPING)
 *
 * 신규:
 *  - creature 등록/해제 API (spawnCreature / despawnCreature / clearCreatures)
 *  - pause/resume (Page Visibility 대응용, rAF 자체 중단)
 *  - AnimationMixer 지원 (creature.animations 재생)
 *  - traverse 기반 geometry/material/texture dispose (disposeObject 공용 사용)
 */

import * as THREE from 'three'
import { disposeObject } from './CreatureLoader'
import { GyroController, GYRO_DAMPING } from './GyroController'

export interface ArSceneOptions {
  canvas: HTMLCanvasElement
  /** 자이로 연동이 없는 경우 생략. 있으면 매 프레임 offset 반영. */
  gyro?: GyroController
  /** 1초 단위 FPS 보고. DEV 진단 패널 용. */
  onFps?: (fps: number) => void
  /** WebGL context 생성 실패 등 치명적 에러 리포트. */
  onError?: (error: Error) => void
}

interface SpawnedCreature {
  id: string
  root: THREE.Object3D
  mixer: THREE.AnimationMixer | null
}

export class ArScene {
  private readonly canvas: HTMLCanvasElement
  private readonly gyro: GyroController | null
  private readonly onFps?: (fps: number) => void
  private readonly onError?: (e: Error) => void

  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private clock = new THREE.Clock()

  private creatures = new Map<string, SpawnedCreature>()
  private rafId: number | null = null
  private running = false
  private disposed = false
  private initialized = false

  private frameCount = 0
  private lastFpsStamp = 0

  private readonly raycaster = new THREE.Raycaster()
  private readonly ndcVec = new THREE.Vector2()

  private readonly handleResize = () => this.resize()

  constructor(options: ArSceneOptions) {
    this.canvas = options.canvas
    this.gyro = options.gyro ?? null
    this.onFps = options.onFps
    this.onError = options.onError
  }

  /**
   * WebGL 컨텍스트 생성 + 씬 초기화. 실패 시 onError 호출 후 false 반환.
   * 생성자와 분리하여 side effect 명시적으로 발생.
   */
  init(): boolean {
    if (this.disposed || this.initialized) return this.initialized
    try {
      const width = this.canvas.clientWidth || window.innerWidth
      const height = this.canvas.clientHeight || window.innerHeight

      this.scene = new THREE.Scene()
      this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
      this.camera.position.z = 5

      // 기본 조명: Fox/CesiumMan 등 표준 glTF 가 PBR 을 쓰므로 약한 ambient + directional 2종.
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))
      const dir = new THREE.DirectionalLight(0xffffff, 0.9)
      dir.position.set(2, 4, 3)
      this.scene.add(dir)

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
      })
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      this.renderer.setSize(width, height, false)

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

  /** rAF 루프 시작. init 실패 상태면 no-op. */
  start(): void {
    if (this.disposed || !this.initialized || this.running) return
    this.running = true
    this.clock.start()
    this.lastFpsStamp = performance.now()
    this.frameCount = 0
    this.tick()
  }

  /** rAF 루프 중단. 카메라 스트림/자이로는 건드리지 않음 (외부가 주관). */
  pause(): void {
    if (!this.running) return
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.clock.stop()
  }

  resume(): void {
    if (this.disposed || !this.initialized || this.running) return
    this.start()
  }

  /**
   * 로드된 creature 를 씬에 추가. id 는 호출부가 중복 방지.
   * animations 가 있으면 모든 클립을 mixer 에 연결해 자동 재생.
   */
  spawnCreature(
    id: string,
    root: THREE.Object3D,
    animations: THREE.AnimationClip[] = [],
    position?: THREE.Vector3,
  ): void {
    if (this.disposed || !this.scene) return
    if (this.creatures.has(id)) return
    if (position) root.position.copy(position)
    const mixer = animations.length > 0 ? new THREE.AnimationMixer(root) : null
    if (mixer) {
      animations.forEach(clip => mixer.clipAction(clip).play())
    }
    this.scene.add(root)
    this.creatures.set(id, { id, root, mixer })
  }

  despawnCreature(id: string): void {
    const c = this.creatures.get(id)
    if (!c || !this.scene) return
    c.mixer?.stopAllAction()
    c.mixer?.uncacheRoot(c.root)
    this.scene.remove(c.root)
    // TODO(Phase 7): disposeObject() 는 clone 된 Mesh 의 geometry/material 을
    // 공격적으로 dispose 한다. CreatureLoader 캐시의 원본이 리소스를 참조 공유하므로
    // 같은 url 재로드 시 원본 불능화 가능. 참조 카운트 또는 per-instance 소유권 도입 필요.
    // (대응 전까지 Phase 2 더미 스폰 범위에서만 안전)
    disposeObject(c.root)
    this.creatures.delete(id)
  }

  clearCreatures(): void {
    const ids = Array.from(this.creatures.keys())
    ids.forEach(id => this.despawnCreature(id))
  }

  /** 전체 정리. 호출 이후 다른 API 는 no-op. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pause()
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('orientationchange', this.handleResize)
    this.clearCreatures()
    if (this.scene) {
      // 기본 조명 등 자동 추가 객체도 정리
      disposeObject(this.scene)
    }
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.initialized = false
  }

  get isRunning(): boolean {
    return this.running
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  get creatureCount(): number {
    return this.creatures.size
  }

  /**
   * NDC 좌표(-1~1, y 상향 양수) 로 raycast 하여 가장 가까운 creature id 반환.
   * 없으면 null. CreatureLoader 가 반환한 root 전체 하위 메쉬를 순회한다.
   */
  pickCreatureAt(ndc: { x: number; y: number }): string | null {
    if (this.disposed || !this.camera || this.creatures.size === 0) return null
    this.ndcVec.set(ndc.x, ndc.y)
    this.raycaster.setFromCamera(this.ndcVec, this.camera)
    let bestId: string | null = null
    let bestDist = Infinity
    for (const c of this.creatures.values()) {
      const hits = this.raycaster.intersectObject(c.root, true)
      if (hits.length > 0 && hits[0].distance < bestDist) {
        bestDist = hits[0].distance
        bestId = c.id
      }
    }
    return bestId
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  private tick = (): void => {
    if (!this.running || this.disposed) return
    this.rafId = requestAnimationFrame(this.tick)

    if (!this.renderer || !this.scene || !this.camera) return

    const delta = this.clock.getDelta()
    const offset = this.gyro?.getOffset()
    for (const c of this.creatures.values()) {
      c.mixer?.update(delta)
      if (offset) {
        c.root.position.x += (offset.tx - c.root.position.x) * GYRO_DAMPING
        c.root.position.y += (offset.ty - c.root.position.y) * GYRO_DAMPING
      } else {
        c.root.position.x += (0 - c.root.position.x) * GYRO_DAMPING
        c.root.position.y += (0 - c.root.position.y) * GYRO_DAMPING
      }
    }

    this.renderer.render(this.scene, this.camera)

    this.frameCount += 1
    const now = performance.now()
    const elapsed = now - this.lastFpsStamp
    if (elapsed >= 1000 && this.onFps) {
      this.onFps(Math.round((this.frameCount * 1000) / elapsed))
      this.frameCount = 0
      this.lastFpsStamp = now
    }
  }
}
