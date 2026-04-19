/**
 * AR 진단 플래그 — DEV 빌드 또는 URL `?debug=1` / localStorage `__ar_debug__`.
 *
 * 용도: Phase 3-R2 체크포인트 ⓑ · Phase 7 QA 현장 검증 시 Production 에서도
 *        DevDiagnosticPanel 을 조건부 노출하기 위한 임시 플래그.
 *
 * 평가 규칙 (호출 시점마다 최신 상태 반영):
 *  - DEV 빌드 → 항상 true
 *  - URL `?debug=1` → localStorage 에 set + true 반환
 *  - URL `?debug=0` → localStorage 에서 remove + false 반환
 *  - URL 미지정 → localStorage 값 (`'1'` 이면 true)
 *
 * 부트 동기화 (모듈 로드 1회):
 *  - 이 모듈을 `main.tsx` 에서 eager import. 앱 초기 URL 이 `?debug=1` 이면 어떤
 *    라우트(예: /ar IntroPage) 든 localStorage 에 즉시 기록된다. 이후 쿼리가
 *    라우트 이동으로 drop 되어도 localStorage 기반으로 유지.
 *
 * 비-module-const 로 전환한 이유:
 *  - 기존 `export const isDebugEnabled = readDebugFlag()` 는 모듈 로드 시점
 *    1회 평가돼 캐싱됐음. 사용자가 console 에서 localStorage 를 수동 변경해도
 *    반영 불가 → QA 상 수동 우회가 막히는 문제 발생. 함수 호출로 전환.
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

// 모듈 로드 시 URL → localStorage 1회 sync (side effect). main.tsx 에서 eager import.
// IntroPage(`/ar`) → PlayPage(`/ar/play`) 라우트 이동 시 navigate 가 쿼리 drop 해도
// 이 시점 localStorage 에 기록이 남아 이후 readDebugFlag() 호출이 true 반환.
readDebugFlag()
