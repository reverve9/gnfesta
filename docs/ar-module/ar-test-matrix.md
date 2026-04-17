# AR 모듈 실기 테스트 매트릭스

> `/ar-tech-test` 페이지를 여러 단말에서 띄워 아래 표를 채운다.
> **최소 5개 단말** 테스트 후 Phase 1 착수 가능 여부 판단.

---

## 테스트 결과 표

| # | 단말 | OS / 브라우저 | GPS 권한 | 카메라 권한 | 자이로 권한 | WebGL 버전 | FPS(유휴) | 폴백 Level | 이슈 |
|---|---|---|---|---|---|---|---|---|---|
| 예시 | iPhone 13 | iOS 17.2 Safari | granted | granted | granted (후 prompt) | WebGL 2 | 58 | Level 1 | 자이로 권한 요청은 버튼 터치 내에서만 작동 |
| 1 | iPhone (모델 미상) | iOS 26.3.1 Safari 26.3 | granted | granted | granted | WebGL 2 (Apple GPU) | 60 | Level 1 | L1 정상. Camera res 640×480(저), UA "iPhone OS 18_7"로 frozen |
| 2 | 동일 iPhone | 동일 | granted | granted | denied (자이로 skip 버튼) | WebGL 2 | — | Level 2 | L2 정상, 큐브 중앙 고정 |
| 2 |  |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |  |  |  |

---

## 기록 지침

- **권한 컬럼 값**: `granted` / `denied` / `unsupported` / `prompt`(요청 대기)
- **WebGL 버전**: `WebGL 1` / `WebGL 2` / `none`
- **FPS(유휴)**: 큐브 렌더링 중 카메라 정지 상태의 평균 FPS
- **폴백 Level**: 실제 진입한 화면 레벨 (Level 1~4)
  - L1: 카메라 + 3D + 자이로 시차
  - L2: 카메라 + 3D 정적 중앙
  - L3: 카메라 + 2D 스프라이트
  - L4: 대체 경로 페이지
- **이슈**: 오류 메시지·비정상 동작·UX 문제 등

## 필수 커버 범위

- [ ] iOS Safari 16.4 이상 (최신 기기)
- [ ] iOS Safari 16.4 미만 가능하면 1대 (폴백 Level 4 진입 확인)
- [ ] iOS PWA (홈 화면 추가 상태) — 카메라 권한 재요청 여부
- [ ] Android Chrome 중급 단말
- [ ] Android 저가 단말 (갤럭시 A 시리즈 등) — Level 3 폴백 트리거 확인

## 확인 항목 체크리스트 (단말별)

단말마다 아래를 한 번씩 수행:
- [ ] `/ar-tech-test` 페이지 정상 로드
- [ ] "테스트 시작" 버튼 클릭 → 권한 순차 요청
- [ ] 권한 1개 거부 시 폴백 단계 정상 진입
- [ ] 카메라 스트림이 전체화면 배경으로 표시
- [ ] Three.js 큐브가 카메라 위에 오버레이
- [ ] 자이로 지원 단말에서 기기 회전 시 큐브 위치 시차 효과
- [ ] 진단 패널에 userAgent, WebGL 버전, 해상도, FPS, Safe Area 표시
- [ ] Safe Area(노치/홈바) 영역 침범 없음

## 기록 완료 후 보고 사항

1. 채워진 테스트 매트릭스 (위 표)
2. 전체 단말 공통 이슈 (있다면)
3. 특정 단말/OS 고유 이슈 (있다면)
4. Phase 1 스키마 작성 전 재확인 필요 사항

---

## 🔍 Phase 0 실기 테스트 발견 (2026-04-17)

### 발견 1 — iOS UA 문자열 버전 Frozen
- iOS 17.4+ 부터 Apple 이 UA 의 `iPhone OS X_Y` 부분을 **고정값**(예: `18_7`)으로 유지
- 실기 테스트에서 iOS 26.3.1 인데 UA 에는 `iPhone OS 18_7` 표시
- **진짜 Safari 버전은 UA 의 `Version/26.3` 토큰**에서 확인 가능
- **함의**: 브리프 §4 "iOS 16.4 미만 = Level 4 자동 폴백" 로직을 **UA 파싱으로 구현 금지**
- 대안: `navigator.mediaDevices?.getUserMedia` 존재 + `getUserMedia()` 실제 호출 실패 여부로 **feature detection**

### 발견 2 — `getUserMedia` 기본 해상도 낮음
- 현재 요청: `{ video: { facingMode: { ideal: 'environment' } } }` (해상도 미지정)
- iOS 26.3.1 응답: **640×480 (VGA)**
- AR 캐릭터 배경 품질로는 부족
- **Phase 2 반영**: `width: { ideal: 1280 }, height: { ideal: 720 }` 명시 필요 (720p 이상)

### 발견 3 — FPS 초기 웜업 ~3초
- 씬 초기화 직후 FPS 계산 첫 윈도우(1초)는 부분 측정 → 수치 낮게 보일 수 있음
- 3초 후 안정적으로 60 도달 (iOS 26.3.1 / iPhone / Apple GPU)
- **정상 동작**, 매트릭스 기록 시 "유휴 3초 이후 평균값" 기준

---

*AR 실기 테스트 매트릭스 v1.1 — 2026-04-17*
