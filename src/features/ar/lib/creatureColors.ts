/**
 * Phase 5 — creature placeholder 공유 상수.
 *
 * 단일 source of truth: CreatureLoader (3D plane 색) 와 CollectionPage (썸네일 색)
 * 양쪽이 같은 등급-색 매핑을 사용하도록 분리.
 *
 * 실 에셋 도입 Phase 에서 본 모듈은 placeholder 분기 잔재로만 남고, 등급별 단색은
 * 추가 fallback (이미지 로드 실패 시 등) 으로 활용 가능.
 */

import type { ArRarity } from './assets'

export const CREATURE_COLORS: Record<ArRarity, string> = {
  common: '#A0825A',
  rare: '#D4A574',
  legendary: '#FFE9A8',
} as const

export interface ParsedPrimitiveUrl {
  kind: 'plane'
  grade: ArRarity
}

/**
 * `primitive:plane:<grade>` 형식 URL 파싱. 매칭 실패 시 null.
 *
 * Phase 5 seed UPDATE 로 ar_creatures.model_url / thumbnail_url 이 본 형식으로 채워진다.
 */
export function parsePrimitiveUrl(url: string): ParsedPrimitiveUrl | null {
  const m = url.match(/^primitive:plane:(common|rare|legendary)$/)
  if (!m) return null
  return { kind: 'plane', grade: m[1] as ArRarity }
}
