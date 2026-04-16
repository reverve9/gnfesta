/**
 * localStorage 기반 익명 클라이언트 식별자.
 *
 * 쓰임
 *  · 프로그램 쿠폰(스탬프랠리) 발급 시 `(client_id, event_id)` unique 키로 사용.
 *  · 전화번호를 받지 않는 흐름에서 "이 기기" 를 식별하는 단일 키.
 *
 * 수명
 *  · localStorage 유지되는 동안 동일 기기/브라우저에서 재사용.
 *  · 시크릿창/캐시삭제/브라우저 변경 시 새 ID 생성 — 이미 받은 쿠폰은 DB 에
 *    남아있지만 이 기기의 쿠폰함에선 조회 불가. 축제 단기 특성상 수용 가능.
 */

const STORAGE_KEY = 'gnfesta.clientId'

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC4122 v4 fallback (crypto.randomUUID 미지원 환경 — 구형 iOS 등)
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return (
    hex.slice(0, 8) +
    '-' +
    hex.slice(8, 12) +
    '-' +
    hex.slice(12, 16) +
    '-' +
    hex.slice(16, 20) +
    '-' +
    hex.slice(20, 32)
  )
}

/** 기존 ID 가 있으면 반환, 없으면 생성 후 저장 + 반환. SSR 안전(없으면 새 ID 반환). */
export function ensureClientId(): string {
  if (typeof window === 'undefined') return generateUuid()
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing && existing.length >= 32) return existing
    const fresh = generateUuid()
    window.localStorage.setItem(STORAGE_KEY, fresh)
    return fresh
  } catch {
    // localStorage 접근 실패(private mode 제한 등) — 세션 단발성 ID 반환
    return generateUuid()
  }
}

/** 현재 저장된 clientId 를 반환 (없으면 null — 생성 안 함) */
export function getClientId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
