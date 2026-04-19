/**
 * AR 진단 플래그 — DEV 빌드 또는 URL `?debug=1` / localStorage `__ar_debug__`.
 *
 * 용도: Phase 3-R2 체크포인트 ⓑ · Phase 7 QA 현장 검증 시 Production 에서도
 *        DevDiagnosticPanel 을 조건부 노출하기 위한 임시 플래그.
 *
 * 규칙 (모듈 로드 시 1회 평가):
 *  - DEV 빌드 → 항상 true
 *  - URL `?debug=1` → localStorage 에 set + true
 *  - URL `?debug=0` → localStorage 에서 remove + false
 *  - URL 미지정 → localStorage 값 (`'1'` 이면 true)
 *
 * 한계 (의도된 단순화):
 *  - SPA 세션 중 URL 수동 교체로는 재평가되지 않음. QA 는 URL 을 붙여 새로고침하는
 *    흐름을 가정. 필요시 호출자 측에서 `readDebugFlag()` 를 재호출 가능.
 */

const STORAGE_KEY = '__ar_debug__'

export function readDebugFlag(): boolean {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search).get('debug')
    if (q === '1') {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        /* storage 차단 환경 — 세션 한정으로만 동작 */
      }
      return true
    }
    if (q === '0') {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* storage 차단 환경 */
      }
      return false
    }
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  } catch {
    return false
  }
}

// 모듈 로드 1회 평가값. import 측에서 이 상수를 참조하면 URL → localStorage 동기화도 1회로 끝남.
export const isDebugEnabled: boolean = readDebugFlag()
