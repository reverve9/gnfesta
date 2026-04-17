# HANDOFF — GNfesta AR 모듈

> 이 문서는 AR 모듈 개발의 **진행 상태 단일 진실 문서**입니다.
> 각 Phase 완료 시 갱신됩니다.

- **프로젝트**: GNfesta AR 포획·수집 모듈 ("축제 탐험")
- **현재 Phase**: 0 / 7
- **마지막 업데이트**: 2026-04-17
- **기획 브리프**: `_DEV/Handoff/AR_MODULE_PROJECT_BRIEF.md` (v0.3)
- **Phase 0 프롬프트**: `_DEV/Handoff/PHASE_0_PROMPT.md`

---

## Phase 진행 상태

| Phase | 주제 | 상태 |
|---|---|---|
| 0 | 코드베이스 분석 · 통합 지점 설계 · AR 기술 실기 프로토타입 | ✅ 완료 (실기 테스트는 사용자 몫) |
| 1 | DB 스키마 + 기본 라우팅 + BottomNav 진입점 + 방어 RPC | ⏸ 대기 |
| 2 | WebAR 기반 (카메라 + Three.js + 자이로 + R2 연동) | ⏸ 대기 |
| 3 | GPS 구역 판정 + 서버 스폰 + spawn 토큰 | ⏸ 대기 |
| 4 | 포획 인터랙션 + 도감 UI + 대체 경로 | ⏸ 대기 |
| 5 | AR 보상 발급·사용 + 완주 경품 + `/api/ar/rewards/validate` | ⏸ 대기 |
| 6 | 어드민 도구 (설정·존·캐릭터·통계·보상·부정분석) | ⏸ 대기 |
| 7 | 성능 최적화 · QA · 현장 테스트 준비 | ⏸ 대기 |

---

## ✅ Phase 0 — 완료된 것

### 산출물
- `docs/ar-module/phase-0-analysis.md` — 기존 코드베이스 11개 영역 분석 리포트 (파일 경로 · 코드 인용 포함)
- `docs/ar-module/integration-plan.md` — 통합 지점 설계 + 확정 결정사항 (메뉴 위치·폴더구조·API 방식)
- `docs/ar-module/ar-test-matrix.md` — 실기 테스트 빈 양식 + 기록 지침

### 구현
- `src/features/ar/three/TestScene.ts` — Three.js 씬 (Dynamic Import 타깃, 회전 BoxGeometry + 자이로 시차)
- `src/features/ar/pages/TechTestPage.tsx` — 권한 요청·진단 패널·폴백 계단 L1~L4
- `src/features/ar/pages/TechTestPage.module.css`
- `src/App.tsx` — `/ar-tech-test` 라우트 등록 (Customer 모드, lazy import). **내부 팀만 URL을 아는 전제**로 프로덕션에도 포함 — 정식 AR 라우트(Phase 1+) 도입 시 제거 예정.
- `TechTestPage` 에 `<meta name="robots" content="noindex, nofollow">` 동적 삽입 — 혹시 URL 유출 시 검색 엔진 인덱싱 방지.
- `src/components/layout/BottomNav.tsx` — **임시** "탐험" 슬롯(`Compass` 아이콘) 추가, `/ar-tech-test` 직결. Phase 1 에서 `/ar` 정식 라우트 도입 시 path 교체 예정. UI는 추후 재디자인 전제의 임시 배치.

### 의존성 추가
- `three@^0.170` (런타임)
- `@types/three` (devDep)

### Phase 0에서 확정된 결정사항
1. **메뉴 진입점**: BottomNav 5번째 독립 슬롯 추가 — `/ar`, 라벨 "탐험", 아이콘 `Compass`
2. **폴더 구조**: `src/features/ar/{lib, pages, three, components, hooks}` 모듈화
3. **API 공유 로직**: Supabase RPC 집중 방식 (`capture_creature` 등)
4. **기존 스탬프 도감이 `/:phone` path param 미사용** 확인 → AR도 동일(`/ar/collection` + form input)
5. **Vercel `api/_lib/` 실제로는 미사용** — 각 라우트가 함수 인라인 복사. AR은 RPC 집중으로 이 이슈 최소화
6. **어드민 비밀번호 하드코딩** 상태 식별 (`AdminLayout.tsx:65–68`) — 별도 이슈 트랙

### 기획 문서 (브리프 v0.3)에서 확정된 결정사항
- 멀티테넌트 없음 (축제당 1 배포, 코드 포크 방식)
- Cloudflare R2 에셋 저장 + Cloudflare Worker 프록시 업로드
- AR 스택 = `getUserMedia` + Three.js 오버레이 (WebXR/MindAR 배제)
- iOS 16.4 미만 = 폴백 Level 4 자동 진입
- 5분 무터치 세션 타임아웃 (배터리·열)
- 쿠폰 · 스탬프 · AR 수집 보상 **완전 분리** → 신규 `ar_rewards` 테이블
- `ar_captures` UNIQUE = `(phone, creature_id)` (멀티테넌트 없으므로 단순화)
- `ar_spawn_tokens` 도입 (부정 포획 차단, TTL 60초)
- `capture_creature` RPC 원자 처리 (검증+포획+보상+토큰소비)
- `ar_capture_attempts` 전 시도 로그 (부정 패턴 분석)
- 접근성 폴백 계단 L1~L4
- 실시간 희귀 캐릭터 알림 스코프 제외 (안전 리스크)

---

## ⏳ Phase 0 — 대기 중 (사용자 몫)

### 실기 테스트 (모바일)
- 브랜치 커밋·푸시 후 Vercel 자동 프로덕션 배포 대기 (~1~2분)
- 배포된 프로덕션 도메인에서 `/ar-tech-test` 로 접속 (예: `https://gnfesta.com/ar-tech-test`)
- **HTTPS 필수** — Vercel은 자동 HTTPS, iOS Safari `getUserMedia` 정상 작동
- `docs/ar-module/ar-test-matrix.md` 양식에 최소 5개 단말 결과 기록
- iOS 16.4 미만 단말 가능하면 1대 포함 (Level 4 폴백 검증)

### URL 비공개 방침
- 내부 팀만 `/ar-tech-test` URL 인지
- 외부 공유·문서화 금지
- Phase 1 정식 AR 라우트 작업 시점에 테스트 라우트 삭제 예정

### 테스트 후 진행
- 테스트 결과를 공유하면 Phase 1 프롬프트 착수
- 필요 시 `/ar-tech-test` 수정·재배포 요청 가능

---

## 🎯 Phase 1 — 시작 조건

**Phase 1 착수 요구사항**:
- [ ] Phase 0 실기 테스트 매트릭스 최소 5개 단말 기록 완료
- [ ] 치명적 이슈(예: iOS Safari `getUserMedia` 권한 플로우 실패 등) 없음 확인
- [ ] Phase 1 프롬프트 수신

**Phase 1 예상 범위**:
- Supabase 마이그레이션: `ar_games`, `ar_zones`, `ar_creatures`, `ar_spawn_tokens`, `ar_captures`, `ar_capture_attempts`, `ar_rewards`, `ar_prize_claims`
- `capture_creature` RPC 작성 (부정 방지 체크 + 원자 처리)
- `BottomNav.tsx` 에 "탐험" 슬롯 추가
- `/ar` 라우트에 인트로 페이지 (Customer 모드)
- 어드민 라우트 `/ar/settings`, `/ar/zones`, `/ar/creatures` 등 뼈대

---

## 🔗 향후 Phase 진행 중 결정할 항목

아래 항목은 해당 Phase 착수 시점에 확정. Claude Code는 임의 결정 금지.

| 항목 | 결정 시점 | 영향 범위 |
|---|---|---|
| AR 보상 테이블·코드 정식 명칭 (`voucher` / `ar_coupon` / `수집 보상` 등) | Phase 1 스키마 작성 시 | `ar_rewards` 컬럼명, UI 라벨, 코드 prefix(`AR-XXXXXX` 유지 여부) |
| 3D 에셋 외주사 선정 세부 | Phase 2 착수 전 | 에셋 스케줄, 품질 기준 |
| 위치 데이터(`client_lat/lng`) 축제 종료 후 파기·익명화 정책 | Phase 5~6 | 보관 스크립트, 개인정보 공지 |
| GPS 약한 지점용 QR 기반 존 강제 확정 백업 | Phase 3 실기 테스트 후 | 존 API, QR 코드 생성 |
| 정상 활동 대시보드 메트릭 상세 목록 | Phase 6 어드민 작업 시 | 통계 쿼리, 차트 구성 |

---

## 📝 최근 변경 파일

| Phase | 파일 | 종류 | 비고 |
|---|---|---|---|
| 0 | `package.json` | 수정 | `three`, `@types/three` 의존성 추가 |
| 0 | `src/App.tsx` | 수정 | `/ar-tech-test` 라우트 추가 (lazy import, prod 포함, URL 내부 비공개) |
| 0 | `src/components/layout/BottomNav.tsx` | 수정 | "탐험" 슬롯 임시 추가 (Compass, `/ar-tech-test` 직결) |
| 0 | `src/features/ar/three/TestScene.ts` | 신규 | Three.js 씬 (dynamic import 타깃) |
| 0 | `src/features/ar/pages/TechTestPage.tsx` | 신규 | 권한 플로우 + 폴백 + 진단 패널 |
| 0 | `src/features/ar/pages/TechTestPage.module.css` | 신규 | 전체화면 스테이지 스타일 |
| 0 | `docs/ar-module/phase-0-analysis.md` | 신규 | 코드베이스 분석 리포트 |
| 0 | `docs/ar-module/integration-plan.md` | 신규 | 통합 설계 + 확정 결정사항 |
| 0 | `docs/ar-module/ar-test-matrix.md` | 신규 | 실기 테스트 빈 양식 |
| 0 | `HANDOFF.md` | 신규 | 본 문서 |

---

## ⚠️ 알려진 위험·미결 이슈

- **어드민 비밀번호 하드코딩** (`AdminLayout.tsx:65–68`) — 프로덕션 진입 전 환경변수화 필요. AR 어드민 추가 시 재부상.
- **Vercel serverless 함수 복사 관행** — AR 모듈은 RPC 집중 방식으로 최소화 예정이나, 순수 API-레벨 공통 코드가 생기면 동일 관행 따름 필요.
- **실기 테스트 미완료** — iOS Safari 자이로 권한이 "테스트 시작" 버튼 단일 클릭으로 올바르게 획득되는지 실기 검증 필수. 실패 시 권한별 버튼 분리 등 UX 변경 필요.

---

*HANDOFF.md — v1.0 · Phase 0 completion*
