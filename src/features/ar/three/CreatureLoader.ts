/**
 * glTF 모델 로더 (Draco 압축 지원 + URL 기반 메모리 캐시).
 *
 * TestScene.ts 엔 없던 신규 모듈 — Phase 2 에서 처음 도입.
 *
 * 정책:
 *  - 같은 URL 은 1회만 네트워크 요청, 이후 `scene.clone(true)` 로 복제 제공 (캐시).
 *  - 로딩 실패 시 `BoxGeometry` 폴백 Mesh 반환 + 에러 로그 콜백.
 *  - Draco 디코더는 Google 공개 CDN 사용 (gstatic, 버전 고정 1.5.6).
 *  - Phase 2 에서는 텍스처 공유 전제로 캐시 정책 단순화 (참조 카운트 없음).
 *    실제 프로덕션에서 수십 종 로딩 시 Phase 7 에서 재설계.
 */

import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/'

export interface CreatureLoaderOptions {
  onError?: (url: string, error: Error) => void
  onProgress?: (url: string, event: ProgressEvent) => void
}

export interface LoadedCreature {
  /** 씬에 추가할 준비된 Object3D. 복제본이므로 매 요청마다 새 인스턴스. */
  root: THREE.Object3D
  /** 원본 gltf.animations — 호출부가 AnimationMixer 로 재생. */
  animations: THREE.AnimationClip[]
  /** 캐시 히트 여부 (디버그 용) */
  fromCache: boolean
  /** 폴백 모델 여부 (로딩 실패 시 true, 기본 BoxGeometry) */
  isFallback: boolean
}

export class CreatureLoader {
  private readonly loader: GLTFLoader
  private readonly draco: DRACOLoader
  private readonly cache = new Map<string, GLTF>()
  private readonly options: CreatureLoaderOptions
  private disposed = false

  constructor(options: CreatureLoaderOptions = {}) {
    this.options = options
    this.draco = new DRACOLoader()
    this.draco.setDecoderPath(DRACO_DECODER_PATH)
    this.loader = new GLTFLoader()
    this.loader.setDRACOLoader(this.draco)
  }

  async load(url: string): Promise<LoadedCreature> {
    if (this.disposed) {
      return this.makeFallback(true)
    }
    const cached = this.cache.get(url)
    if (cached) {
      // TODO(Phase 7): clone(true) 는 geometry/material/texture 를 참조 공유한다.
      // 현재 ArScene.despawnCreature → disposeObject() 가 공유 리소스를 dispose 하면
      // 같은 url 을 재로드 할 때 캐시 원본이 불능화될 수 있다.
      // Phase 2 더미 스폰 범위에서는 동일 url 중복 스폰이 드물어 영향 없으나,
      // 포획 UX 가 완성되는 Phase 4~7 에서 참조 카운트 또는 복제본별 리소스 소유권 도입 필요.
      return {
        root: cached.scene.clone(true),
        animations: cached.animations,
        fromCache: true,
        isFallback: false,
      }
    }
    try {
      const gltf = await this.loader.loadAsync(url, evt =>
        this.options.onProgress?.(url, evt),
      )
      if (this.disposed) {
        // 로딩 중 dispose 됐으면 결과 즉시 폐기
        disposeObject(gltf.scene)
        return this.makeFallback(true)
      }
      this.cache.set(url, gltf)
      return {
        root: gltf.scene.clone(true),
        animations: gltf.animations,
        fromCache: false,
        isFallback: false,
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      this.options.onError?.(url, err)
      return this.makeFallback(false)
    }
  }

  private makeFallback(silent: boolean): LoadedCreature {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshNormalMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    // 폴백 메쉬는 ArScene.despawnCreature() 가 호출될 때 dispose 되어야 함
    mesh.userData.__creatureFallback = true
    if (!silent && this.options.onError) {
      // onError 는 이미 위에서 한 번 호출됨 — 여기선 중복 호출 금지
    }
    return { root: mesh, animations: [], fromCache: false, isFallback: true }
  }

  /**
   * 캐시 비우기 + Draco 워커 정리. Loader 재사용 가능.
   * dispose() 와 달리 loader 자체는 살려둠.
   */
  clearCache(): void {
    this.cache.forEach(gltf => disposeObject(gltf.scene))
    this.cache.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearCache()
    this.draco.dispose()
  }
}

/**
 * Object3D 전체를 순회하며 geometry/material/texture 를 해제.
 * Material 배열과 단일 양쪽 지원. Material 의 map·normalMap·roughnessMap 등
 * 자주 쓰이는 텍스처 슬롯을 탐색해 개별 dispose.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
      mesh.geometry.dispose()
    }
    const material = mesh.material
    if (!material) return
    const materials = Array.isArray(material) ? material : [material]
    materials.forEach(m => disposeMaterial(m))
  })
}

function disposeMaterial(material: THREE.Material): void {
  // Material 에 붙는 흔한 텍스처 속성들을 찾아 해제. runtime 검사로 타입 안전.
  const record = material as unknown as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (value && typeof value === 'object' && value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}
