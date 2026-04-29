/**
 * Creature 로더 — Phase 5: 2D plane primitive.
 *
 * Phase 2~4 의 GLTFLoader / Draco / 외부 GLB fetch 경로는 전면 제거됐다.
 * 본 모듈은 `model_url` 을 `primitive:plane:<grade>` 형식으로 받아
 * 등급별 단색 PlaneGeometry + MeshBasicMaterial(DoubleSide) 인스턴스를 반환한다.
 *
 * 정책 (PHASE_5_PROMPT.md §1-2):
 *  - public API 시그니처 보존 (Q3=A): `load(url)` / `clearCache()` / `dispose()` /
 *    export `disposeObject(...)` 모두 동일. 호출부 수정 없이 동작해야 함.
 *  - `primitive:plane:<grade>` 외 형식은 console.warn + common 단색 fallback.
 *  - 캐시는 `Map<grade, { geometry, material }>` — 동일 grade 가 동시에 여러 위치에
 *    스폰돼도 transform 충돌 없이 `new Mesh(cachedGeo, cachedMat)` 로 인스턴스화.
 *  - 빌보드 처리 안 함 — Y축 회전 시 옆모습이 사라지는 의도된 시각 효과.
 *
 * 실 에셋 도입 Phase 에서는 본 모듈을 재교체하거나, 실 텍스처/스프라이트 분기를 추가한다.
 */

import * as THREE from 'three'
import type { ArRarity } from '../lib/assets'
import { CREATURE_COLORS, parsePrimitiveUrl } from '../lib/creatureColors'

const PLANE_SIZE = 0.7

export interface CreatureLoaderOptions {
  onError?: (url: string, error: Error) => void
  onProgress?: (url: string, event: ProgressEvent) => void
}

export interface LoadedCreature {
  /** 씬에 추가할 준비된 Object3D. 매 요청마다 새 Mesh 인스턴스. */
  root: THREE.Object3D
  /** Phase 5 placeholder 는 애니메이션 없음. 호환성 위해 빈 배열 반환. */
  animations: THREE.AnimationClip[]
  /** geometry/material 캐시 히트 여부 (디버그 용). */
  fromCache: boolean
  /** primitive 형식 외 들어와 fallback 으로 처리됐는지 여부. */
  isFallback: boolean
}

interface PrimitiveCacheEntry {
  geometry: THREE.PlaneGeometry
  material: THREE.MeshBasicMaterial
}

export class CreatureLoader {
  private readonly cache = new Map<ArRarity, PrimitiveCacheEntry>()
  private disposed = false

  // options 는 시그니처 호환 위해 받기만 하고 보관 안 함 — Phase 5 placeholder 는
  // 외부 fetch 가 없어 onError/onProgress 호출 경로가 없다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_options: CreatureLoaderOptions = {}) {}

  async load(url: string): Promise<LoadedCreature> {
    if (this.disposed) {
      return this.makePlaneMesh('common', false, true)
    }

    const parsed = parsePrimitiveUrl(url)
    if (!parsed) {
      console.warn(
        `[CreatureLoader] unsupported model_url "${url}" — primitive:plane:<grade> 만 지원. common fallback.`,
      )
      return this.makePlaneMesh('common', false, true)
    }

    const cached = this.cache.has(parsed.grade)
    return this.makePlaneMesh(parsed.grade, cached, false)
  }

  private makePlaneMesh(
    grade: ArRarity,
    fromCache: boolean,
    isFallback: boolean,
  ): LoadedCreature {
    const entry = this.getOrCreateEntry(grade)
    const mesh = new THREE.Mesh(entry.geometry, entry.material)
    mesh.userData.isCreature = true
    mesh.userData.grade = grade
    mesh.userData.spawnedAt = performance.now()
    return {
      root: mesh,
      animations: [],
      fromCache,
      isFallback,
    }
  }

  private getOrCreateEntry(grade: ArRarity): PrimitiveCacheEntry {
    const existing = this.cache.get(grade)
    if (existing) return existing
    const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE)
    const material = new THREE.MeshBasicMaterial({
      color: CREATURE_COLORS[grade],
      side: THREE.DoubleSide,
      transparent: false,
    })
    const entry: PrimitiveCacheEntry = { geometry, material }
    this.cache.set(grade, entry)
    return entry
  }

  /**
   * 캐시 비우기. geometry/material 모두 dispose.
   * 다음 load 호출 시 lazy 재생성.
   */
  clearCache(): void {
    this.cache.forEach(entry => {
      entry.geometry.dispose()
      entry.material.dispose()
    })
    this.cache.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearCache()
  }
}

/**
 * Object3D 전체를 순회하며 geometry/material/texture 를 해제.
 *
 * Phase 5 placeholder 는 캐시된 geometry/material 을 인스턴스간 공유하므로
 * 호출 시점에 따라 캐시 원본이 dispose 될 수 있다. 본 함수는 ArScene.dispose()
 * (전체 정리) 경로에서만 호출되어야 하며, 단일 creature despawn 에서는 caller 가
 * 공유 리소스를 dispose 하지 않도록 주의해야 한다.
 *
 * Phase 4 까지의 Object3D dispose 헬퍼와 동일 시그니처 유지.
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
  const record = material as unknown as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (value && typeof value === 'object' && value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}
