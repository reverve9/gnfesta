/**
 * 부분 오픈용 기능 플래그.
 *
 * 프로덕션(gnfesta.vercel.app / 커스텀 도메인)에서는 VITE_DEV_MODE 를 설정하지 않음 → false.
 * 개발(gnfesta-dev) / 로컬 에서는 VITE_DEV_MODE=true → 전체 기능 노출.
 *
 * 정식 오픈 시: 이 파일 사용처 전부 정리하고 파일 제거.
 */
export const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'
