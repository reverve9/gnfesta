/**
 * AR 에셋 리졸버.
 *
 * 배포 모드:
 *  1. 플레이스홀더 모드 (기본): `VITE_AR_ASSETS_BASE_URL` 미설정 → Khronos 공개 샘플 CDN 사용.
 *     Phase 2 동안 R2 미준비 상태에서 AR 파이프라인(씬·로더·자이로) 개발에 사용.
 *  2. R2 모드 (배포): `VITE_AR_ASSETS_BASE_URL=https://ar-assets.gnfesta.com/` 형태로 설정.
 *     `ar_creatures.model_url` 은 상대 경로 (`creatures/foo.glb`) 또는 절대 URL 둘 다 수용.
 *
 * 프로덕션 에셋 교체 체크리스트는 `_DEV/Handoff/phase2_build.md` 의 attribution 섹션 참조.
 */

export type ArRarity = 'common' | 'rare' | 'legendary'

export interface PlaceholderCreature {
  id: string
  name: string
  rarity: ArRarity
  /** 에셋 베이스 기준 상대 경로 (또는 절대 URL) */
  model_url: string
}

const KHRONOS_SAMPLES_BASE =
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/'

/**
 * 현재 에셋 베이스 URL 을 반환. 항상 끝이 `/` 로 정규화됨.
 * env 미설정·공백이면 Khronos 샘플 CDN 으로 폴백.
 */
export function getAssetBaseUrl(): string {
  const raw = import.meta.env.VITE_AR_ASSETS_BASE_URL?.trim()
  const base = raw && raw.length > 0 ? raw : KHRONOS_SAMPLES_BASE
  return base.endsWith('/') ? base : base + '/'
}

/**
 * creature 의 `model_url` 을 실제 로딩 가능한 절대 URL 로 해석한다.
 *  - 절대 URL (http/https) → 그대로 반환
 *  - 상대 경로 → 에셋 베이스 URL 앞에 붙여서 반환
 */
export function resolveCreatureModelUrl(creature: { model_url: string }): string {
  const url = creature.model_url.trim()
  if (/^https?:\/\//i.test(url)) return url
  const base = getAssetBaseUrl()
  return base + url.replace(/^\/+/, '')
}

/**
 * Phase 2 플레이스홀더 creature 목록.
 *
 * rarity 별 1종씩 큐레이션 (체크포인트ⓐ 사용자 승인: 옵션 A = 전부 CC-BY 4.0):
 *  - common    : BoxAnimated  (11.7 KB, 단일 채널 애니메이션)
 *  - rare      : CesiumMan    (438 KB, 스킨드 애니메이션 — 분당 약 1종 수준 무게)
 *  - legendary : Fox          (159 KB, 3종 애니메이션 Survey/Walk/Run)
 *
 * 저작자·라이선스·원본 URL 은 phase2_build.md attribution 섹션에 전체 기록.
 * Phase 2 진행 중 추가 필요 시 동일 라이선스(CC-BY 4.0) 한정으로만 확장 허용.
 */
export const PLACEHOLDER_CREATURES: ReadonlyArray<PlaceholderCreature> = [
  {
    id: 'placeholder-box-animated',
    name: '상자 (일반)',
    rarity: 'common',
    model_url: 'BoxAnimated/glTF-Binary/BoxAnimated.glb',
  },
  {
    id: 'placeholder-cesium-man',
    name: '사람 (희귀)',
    rarity: 'rare',
    model_url: 'CesiumMan/glTF-Binary/CesiumMan.glb',
  },
  {
    id: 'placeholder-fox',
    name: '여우 (전설)',
    rarity: 'legendary',
    model_url: 'Fox/glTF-Binary/Fox.glb',
  },
]

/** rarity 별 플레이스홀더 1종을 반환 (더미 스폰 UI 용). 없으면 undefined. */
export function pickPlaceholderByRarity(
  rarity: ArRarity,
): PlaceholderCreature | undefined {
  return PLACEHOLDER_CREATURES.find(c => c.rarity === rarity)
}
