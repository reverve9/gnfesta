/**
 * AR 씬 통합 클래스 — 렌더러·씬·카메라·rAF 루프·creature 관리·리사이즈·FPS 리포트.
 *
 * Phase 5 변경:
 *  - public `dispose()` 강화: scene 트래버스 dispose + renderer.forceContextLoss() +
 *    부착된 CreatureLoader.clearCache() 호출 + RAF cancel + 리스너 해제.
 *  - 모듈 스코프 `instanceCount` 카운터 도입. 생성자 +1 / dispose() 정상 종료 시 -1.
 *    DevDiagnosticPanel 가 `getArSceneInstanceCount()` 로 폴링.
 *  - `attachCreatureLoader(loader | null)` — dispose 시 loader 캐시까지 같이 정리.
 *  - update loop 에 effect 추가:
 *      · userData.isCreature === true Mesh 에 Y축 회전 (3초/회전)
 *      · idle 바운스 ±0.05m (2초 sin 사인파, baseY 기준)
 *  - `despawnCreature` 가 더 이상 root mesh 의 geometry/material 을 dispose 하지 않음.
 *    Phase 5 placeholder 는 CreatureLoader 캐시가 geometry/material 을 인스턴스간
 *    공유하므로, per-creature dispose 는 캐시 원본을 불능화한다.
 *    리소스 해제는 ArScene.dispose() → CreatureLoader.clearCache() 일괄 경로에서만.
 *
 * Phase 2~4 유지:
 *  - WebGLRenderer 옵션 (alpha:true, antialias:true, DPR clamp min(dpr, 2))
 *  - setSize(w, h, false) — CSS 사이즈 외부 관리
 *  - 리사이즈 핸들러 (resize + orientationchange 양쪽)
 *  - rAF 루프의 disposed 플래그 → return → 재예약 순서 (unmount 1프레임 누출 방지)
 *  - FPS 카운팅 (1초 단위 콜백)
 *  - GyroController 의 tx/ty → wrapper.position lerp (damping GYRO_DAMPING)
 *  - public 메서드 시그니처 (`pickCreatureAt`, `spawnCreature`, `despawnCreature`,
 *    `setCreatureVisible`, `clearCreatures`, `start`, `pause`, `resume`, `init`,
 *    `dispose`, `isRunning`, `isDisposed`, `creatureCount`) 무변경.
 */

import * as THREE from 'three'
import type { CreatureLoader } from './CreatureLoader'
import { GyroController, GYRO_DAMPING } from './GyroController'

// ---------------------------------------------------------------------------
// 인스턴스 카운터 — DevDiagnosticPanel 표시용. 정상 작동 시 동시 표시 1 초과 금지.
// useArSceneLifecycle 내 disposedRef idempotency 가드와는 별개 메커니즘.
// ---------------------------------------------------------------------------

let instanceCount = 0

export function getArSceneInstanceCount(): number {
  return instanceCount
}

// ---------------------------------------------------------------------------
// 효과 시스템 상수 (PHASE_5_PROMPT.md §1-3)
// ---------------------------------------------------------------------------

/** Y축 회전 각속도 (rad/sec). 3초 / 1 회전 → 2π/3. */
const ROTATION_SPEED = (Math.PI * 2) / 3
/** Idle 바운스 진폭 (m). */
const BOUNCE_AMPLITUDE = 0.05
/** Idle 바운스 주기 (sec). 2초. sin 인자 계수 = 2π/주기 = π. */
const BOUNCE_OMEGA = Math.PI

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
  /** 자이로 position lerp 적용 대상. */
  wrapper: THREE.Object3D
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

  private creatureLoader: CreatureLoader | null = null

  private readonly handleResize = () => this.resize()

  constructor(options: ArSceneOptions) {
    this.canvas = options.canvas
    this.gyro = options.gyro ?? null
    this.onFps = options.onFps
    this.onError = options.onError
    instanceCount += 1
  }

  /**
   * WebGL 컨텍스트 생성 + 씬 초기화. 실패 시 onError 호출 후 false 반환.
   */
  init(): boolean {
    if (this.disposed || this.initialized) return this.initialized
    try {
      const width = this.canvas.clientWidth || window.innerWidth
      const height = this.canvas.clientHeight || window.innerHeight

      this.scene = new THREE.Scene()
      this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
      this.camera.position.z = 5

      // MeshBasicMaterial 은 조명을 받지 않지만, 향후 Material 변경 시 호환을 위해 유지.
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

  /** rAF 루프 중단. */
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
   * dispose 시 캐시까지 같이 정리할 CreatureLoader 등록. null 로 해제 가능.
   * Phase 5 신설 — ArScene 가 loader 의 라이프사이클을 책임지지는 않지만
   * dispose 시점에 캐시를 비우기 위한 단방향 reference.
   */
  attachCreatureLoader(loader: CreatureLoader | null): void {
    this.creatureLoader = loader
  }

  /**
   * 로드된 creature 를 씬에 추가. id 는 호출부가 중복 방지.
   * animations 가 있으면 모든 클립을 mixer 에 연결해 자동 재생.
   * Phase 5: root 에 isCreature 플래그가 있으면 baseY 박아 idle 바운스 기준점 저장.
   */
  spawnCreature(
    id: string,
    root: THREE.Object3D,
    animations: THREE.AnimationClip[] = [],
    position?: THREE.Vector3,
  ): void {
    if (this.disposed || !this.scene) return
    if (this.creatures.has(id)) return
    const wrapper = new THREE.Object3D()
    if (position) wrapper.position.copy(position)
    wrapper.add(root)
    if (root.userData.isCreature === true) {
      // root 의 local position.y 는 보통 0. wrapper 가 절대 위치를 잡고,
      // root 가 sin 바운스 (±0.05m) 를 표현. baseY 는 그 기준점.
      root.userData.baseY = root.position.y
    }
    const mixer = animations.length > 0 ? new THREE.AnimationMixer(root) : null
    if (mixer) {
      animations.forEach(clip => mixer.clipAction(clip).play())
    }
    this.scene.add(wrapper)
    this.creatures.set(id, { id, wrapper, root, mixer })
  }

  /**
   * Phase 5 변경: root mesh 의 geometry/material 은 dispose 하지 않는다.
   * CreatureLoader 캐시가 등급별 단일 geometry/material 을 인스턴스 간 공유하므로
   * 여기서 dispose 하면 같은 등급의 다음 spawn 이 불능화된다. 캐시 dispose 는
   * ArScene.dispose() → CreatureLoader.clearCache() 일괄 경로 1회.
   */
  despawnCreature(id: string): void {
    const c = this.creatures.get(id)
    if (!c || !this.scene) return
    c.mixer?.stopAllAction()
    c.mixer?.uncacheRoot(c.root)
    this.scene.remove(c.wrapper)
    c.wrapper.remove(c.root)
    this.creatures.delete(id)
  }

  /**
   * id 에 해당하는 creature 의 root 가시성 토글. dispose 없이 scene graph 유지.
   * Phase 3 zone leave 시 비가시 처리, Phase 4 포획 직후 피드백 등에 재활용.
   */
  setCreatureVisible(id: string, visible: boolean): void {
    if (this.disposed) return
    const c = this.creatures.get(id)
    if (!c) return
    c.root.visible = visible
  }

  clearCreatures(): void {
    const ids = Array.from(this.creatures.keys())
    ids.forEach(id => this.despawnCreature(id))
  }

  /**
   * 전체 정리. 호출 이후 다른 API 는 no-op.
   *
   * 순서:
   *  1) RAF cancel + 리스너 unbind (pause 가 RAF, 그 다음 직접 unbind)
   *  2) creatures 모두 scene 에서 제거 (per-creature dispose 안 함 — 캐시 보호)
   *  3) 부착된 CreatureLoader 캐시 dispose (geometry/material 일괄 해제)
   *  4) lights 등 잔여 scene 자식 traverse dispose
   *  5) renderer.dispose() + forceContextLoss()
   *
   * idempotent: 두 번째 호출은 no-op.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pause()
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('orientationchange', this.handleResize)

    // 1) creatures 분리 (geo/mat 은 loader 캐시 소유 → 여기서 dispose 안 함)
    this.clearCreatures()

    // 2) loader 캐시 dispose — 등급별 PlaneGeometry/MeshBasicMaterial 1회 해제
    this.creatureLoader?.clearCache()
    this.creatureLoader = null

    // 3) 잔여 scene 객체 (lights 등) traverse dispose
    if (this.scene) {
      this.scene.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
          mesh.geometry.dispose()
        }
        const mat = mesh.material
        if (mat) {
          const list = Array.isArray(mat) ? mat : [mat]
          list.forEach(m => m.dispose())
        }
      })
      this.scene.clear()
    }

    // 4) renderer 정리 — forceContextLoss 는 GPU 리소스 즉시 회수 (Safari 누수 회피)
    if (this.renderer) {
      this.renderer.dispose()
      try {
        this.renderer.forceContextLoss()
      } catch {
        /* 일부 컨텍스트는 forceContextLoss 미지원 — 무시 */
      }
    }

    this.renderer = null
    this.scene = null
    this.camera = null
    this.initialized = false

    instanceCount = Math.max(0, instanceCount - 1)
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
   */
  pickCreatureAt(ndc: { x: number; y: number }): string | null {
    if (this.disposed || !this.camera || this.creatures.size === 0) return null
    this.ndcVec.set(ndc.x, ndc.y)
    this.raycaster.setFromCamera(this.ndcVec, this.camera)
    let bestId: string | null = null
    let bestDist = Infinity
    for (const c of this.creatures.values()) {
      const hits = this.raycaster.intersectObject(c.wrapper, true)
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
    const nowMs = performance.now()
    for (const c of this.creatures.values()) {
      c.mixer?.update(delta)

      // 자이로 lerp — wrapper 에 적용. AnimationMixer 가 root position 트랙을
      // 매 프레임 덮어쓰는 모델에서도 wrapper 는 영향받지 않음.
      if (offset) {
        c.wrapper.position.x += (offset.tx - c.wrapper.position.x) * GYRO_DAMPING
        c.wrapper.position.y += (offset.ty - c.wrapper.position.y) * GYRO_DAMPING
      } else {
        c.wrapper.position.x += (0 - c.wrapper.position.x) * GYRO_DAMPING
        c.wrapper.position.y += (0 - c.wrapper.position.y) * GYRO_DAMPING
      }

      // Phase 5 효과: isCreature 플래그가 박힌 root 에 회전 + 바운스 적용
      const root = c.root
      if (root.userData.isCreature === true) {
        root.rotation.y += delta * ROTATION_SPEED
        const baseY = (root.userData.baseY as number | undefined) ?? 0
        const spawnedAt = (root.userData.spawnedAt as number | undefined) ?? nowMs
        const elapsedSec = (nowMs - spawnedAt) / 1000
        root.position.y = baseY + Math.sin(elapsedSec * BOUNCE_OMEGA) * BOUNCE_AMPLITUDE
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
