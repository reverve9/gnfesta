# HANDOFF — GNfesta AR 모듈

> 이 문서는 AR 모듈 개발의 **진행 상태 단일 진실 문서**입니다.
> 각 Phase 완료 시 갱신됩니다.

- **프로젝트**: GNfesta AR 포획·수집 모듈 ("축제 탐험")
- **현재 Phase**: Phase 3 ⏸ **재설계 대기** (A~F+D+E 구현 완료 · E2E 중단 · 축제장 스케일 재정의)
- **마지막 업데이트**: 2026-04-19
- **최신 커밋**: `4e21a34 feat(ar): Phase 3-D+E — Leaflet 미니맵 + PlayPage 서버 스폰 통합`
- **기획 브리프**: `_DEV/Handoff/AR_MODULE_PROJECT_BRIEF.md` (v0.3)
- **Phase 1 빌드 핸드오프**: `_DEV/Handoff/phase1_build.md`
- **Phase 2 빌드 핸드오프**: `_DEV/Handoff/phase2_build.md`
- **Phase 3 빌드 핸드오프**: `_DEV/Handoff/phase3_build.md` ⚠ **다음 세션 첫 진입 시 이 문서부터** (v0.2 재설계 대기)
- **Phase 3 재설계 문서**: `_DEV/Handoff/phase3_redesign.md` ⚠ **사용자 작성 중, 확정되면 필독**
- **Phase 2-E/F 세부 체크포인트**: `_DEV/Handoff/phase2_ef_checkpoint.md` (phase2_build.md 의 서브셋)

---

## 🚨 다음 세션 시작 시 필독 순서

**Phase 3 재설계 진행 상태**. 아래 순서로만 읽어도 충분:

1. **본 문서 `HANDOFF.md`** — Phase 상태·최신 커밋·재설계 결정 (지금 읽고 있는 이 문서)
2. **`_DEV/Handoff/phase3_build.md`** (v0.2) — Phase 3 재활용/폐기 분류·체크포인트 통과 내역·재설계 사유. **다음 세션 진입 시 필수**
3. **`_DEV/Handoff/phase3_redesign.md`** — 축제장 geofence 재설계 상세 (사용자 작성, 확정 후 본 라인이 2번과 자리 뒤바뀔 수 있음)
4. **Phase 3 수정 프롬프트** — 사용자 전달 대기. **수신 전 코드 수정 금지**
5. **`_DEV/Handoff/phase2_build.md`** — Phase 2 알려진 이슈 2건 (자이로 · SkinnedMesh raycast) 참조용
6. **`_DEV/Handoff/phase1_build.md`** — Phase 1 산출물·RPC 임계치
7. **`_DEV/Handoff/AR_MODULE_PROJECT_BRIEF.md`** (v0.3) — §4 기술 정의, §7 번들·캐싱, §8 진입 플로우

부가 참고 (필요할 때만):
- `_DEV/reference/gnfesta_app_summary.md` — GNfesta 앱 전반 컨벤션 (AR 모듈 포함)
- `_DEV/Handoff/페이즈0_빌드.md` — Phase 0 결정·실기 검증
- `_DEV/Handoff/archive/PHASE_{0,1}_PROMPT.md` — 완료된 프롬프트 아카이브
- `_DEV/Handoff/vercel_preview_bypass.md` — Vercel SSO 프리뷰 curl 우회 (Phase 4~7 자동화 테스트 재사용)
- `docs/ar-module/integration-plan.md` — 통합 설계 (폴더 구조·API 방식)
- `supabase/README.md` — 마이그 적용 방법 (Studio SQL Editor 수동)

Phase 3 작업 시작 전 **Phase 3 프롬프트 수신 필수**. 프롬프트 없이 Phase 3 작업 진행 금지.

---

## Phase 진행 상태

| Phase | 주제 | 상태 |
|---|---|---|
| 0 | 코드베이스 분석 · 통합 지점 설계 · AR 기술 실기 프로토타입 | ✅ 완료 |
| 1 | DB 스키마 + 기본 라우팅 + BottomNav 진입점 + 방어 RPC | ✅ 완료 |
| 2 | WebAR 기반 (카메라 + Three.js + 자이로 + R2 연동) | ✅ A~F 완료 · 알려진 이슈 2건 (실 에셋 재검증 대기) |
| 3 | GPS 구역 판정 + 서버 스폰 + spawn 토큰 | ⏸ **재설계 대기** (A~F+D+E 구현 완료 · 축제장 geofence 전환 예정) |
| 4 | 포획 인터랙션 + 도감 UI + 대체 경로 | ⏸ 대기 |
| 5 | AR 보상 발급·사용 + 완주 경품 + `/api/ar/rewards/validate` | ⏸ 대기 |
| 6 | 어드민 도구 (설정·존·캐릭터·통계·보상·부정분석) | ⏸ 대기 |
| 7 | 성능 최적화 · QA · 현장 테스트 준비 | ⏸ 대기 |

---

## 🐛 Phase 2 실기 검증 로그

> 상태: ⏸ **로그 수집 보류 (실 에셋 재검증 시점까지)**. 2026-04-19 방침 변경 — 플레이스홀더 (CesiumMan/Fox) 의 root motion 특성 때문일 가능성이 커 Phase 5 근처 재검증 예정. 덤프 훅은 DEV 가드로 코드에 잔존.
> 상세 기술 분석 · 옵션 A 설계 · 3D 에셋 제작 가이드라인은 `_DEV/Handoff/phase2_build.md` §알려진 이슈 / §3D 에셋 제작 가이드라인 / §실기 검증 결과 에 수록.

### 1차 시도 — wrapper 도입 (커밋 `6ee1d28`)

**수정**: `ArScene.spawnCreature` 가 gltf root 를 `Object3D` wrapper 로 감싸고, 자이로 position lerp 는 wrapper 에, `AnimationMixer` 는 root 에 각각 작용.

**실기 결과 (2026-04-19, iPhone Safari)**:

| rarity | 모델 | 자이로 | 추가 증상 |
|---|---|---|---|
| common | BoxAnimated | ✅ 정상 | 없음 |
| rare | CesiumMan | ❌ 미동작 | 움직이면 사라졌다 재출현 / 포획 영역 대단히 좁음 (신규 발생) |
| legendary | Fox | ❌ 미동작 (변화 없음) | 없음 |

### 가설 (옵션 A 방향)

`AnimationMixer` 가 **root 자체가 아니라 wrapper 내부 자식(Armature/Hips 루트 본)의 `.position` 트랙** 을 매 프레임 덮어씀 → wrapper 격리 효과 무효. 추가로 SkinnedMesh 기본 `raycast` 는 **bind-pose geometry bounding sphere** 로 판정 → 본 애니메이션이 메시를 이동시키면 "보이는 위치" 와 "raycaster 판정 영역" 괴리 → 포획 영역 좁음.

두 증상 모두 **루트 본 position 트랙 (root motion)** 한 가지 원인으로 수렴 가능.

### 2차 진단 — DEV 덤프 훅 (커밋 `646b4b9`)

- `ArScene.spawnCreature` 내부 `import.meta.env.DEV` 가드 영구 블록.
- `[AR][spawn-dump]` 그룹: gltf tree + animation clip tracks + mixer clip + t=0 position.
- `[AR][spawn-dump-t1s]` 라인: 스폰 1초 후 wrapper/root/firstChild position — mixer 가 실제로 어디로 이동시키는지 확인.
- 프로덕션 번들 검증: `VITE_DEV_MODE=false` 빌드에서 PlayPage 청크 사이즈 변화 없음 (631.66 kB) — tree shake 정상.

### 예정 조치 (옵션 A — 루트 본 position 트랙 필터)

`ArScene.spawnCreature` 또는 `CreatureLoader.load` 에서 `clip.tracks` 를 순회해 **최상위 본/노드의 `.position` 트랙만 제거**하고 rotation / scale / 하위 본 트랙은 유지. 스킨 변형·팔다리 애니메이션은 살리고 공간 이동만 제거 → 자이로 lerp 가 유일한 위치 제어자로 남음. SkinnedMesh raycast 어긋남도 동시 해소.

덤프는 옵션 A 수정 후에도 그대로 유지 (DEV 상시 디버깅 훅).

---

## 🔧 Phase 5 실 에셋 도입 시 자이로 재검증 절차

> **⚠️ 지금 실행 대상 아님.** Phase 2 완료 시점(2026-04-19)에 로그 수집 보류로 결정. 아래 절차는 실 에셋 도입 후 동일 증상 재현 여부 확인용으로만 보존. 다음 단계는 §다음 단계: Phase 3 진입 참조.

1. **Vercel 프리뷰 배포 완료 확인** — GitHub `main` push 이벤트로 자동 트리거. 덤프 훅은 커밋 `646b4b9` 이후 모든 빌드에 포함됨 (DEV 가드).
2. **iPhone Safari** 로 프리뷰 URL 접근.
3. **Mac Safari 웹 인스펙터 연결**:
   - Mac: Safari → 설정 → 고급 → "메뉴 막대에 개발자 메뉴 표시" 체크
   - iPhone: 설정 → Safari → 고급 → "웹 인스펙터" ON
   - USB 연결 → Mac Safari 개발 메뉴 → [iPhone 이름] → [해당 Safari 탭] → Web Inspector
4. **Console 탭** 준비 → iPhone 에서 `/ar` → "시작하기" → `/ar/play` → 자이로·카메라 권한 허용.
5. **rare 세그먼트 탭 → "희귀 소환" 1회 → 1초 이상 대기** (`[AR][spawn-dump-t1s]` 로그 대기).
6. **legendary 세그먼트 탭 → "전설 소환" 1회 → 1초 이상 대기**.
7. Console 에서 `[AR][spawn-dump]` 2 그룹 + 각 `[AR][spawn-dump-t1s]` 라인 전부 복사 → 채팅 공유. 탭 순서 = rarity (rare 먼저, legendary 나중).
8. 로그 수신 → 트랙 타겟 노드 확정 → 옵션 A 수정 커밋 → push → 재검증.

---

## 🚀 다음 단계: Phase 3 재설계 수정 프롬프트 수신 대기

### 재설계 배경 (2026-04-19 사용자 결정)

현재 Phase 3 구현 (다중 zone + 엄격 GPS 히스테리시스 판정) 은 **도시 스케일 AR** 가정. 실제 타겟은 **축제장 스케일 (50×150m)**. zone radius 를 축제장 스케일로 축소하면 GPS 오차(실외 5~30m) 가 반경과 겹쳐 판정 불가.

### 재설계 방향 (큰 방향만 합의, 세부는 `phase3_redesign.md` 에 사용자 작성 중)

1. Zone = **다중 포인트 → 축제장 geofence 1개**.
2. 스폰 트리거 = **zone 진입 → 시간·이동량 기반**.
3. 축제장 밖에서는 AR 비활성 (안내 UI 만).
4. **쿨다운 메카닉 도입** (경품 풀 연동).

### 진행 상태

- Phase 3-A~F (`1e01e8f`) + D+E (`4e21a34`) 구현·커밋·push 완료.
- 체크포인트 ⓐ (GPS 훅 + 구역 판정) · ⓑ (curl 5건) 통과. ⓒ (DevTools E2E 11건) 실행 직전 재설계로 **중단**.
- 재활용/폐기 분류는 `_DEV/Handoff/phase3_build.md` §산출물 참조.

### 다음 세션 작업 금지 사항

- 재설계 방향 **추측** 기반 코드 수정 금지 (브리프 §13 원칙).
- `phase3_redesign.md` 만 읽고 자율 구현 금지 — 반드시 **Phase 3 수정 프롬프트** 수신 필수.
- Phase 2 자이로 이슈 + 기술 부채 #1 경계선 유지.

---

## ✅ Phase 1 — 완료된 것

### 산출물 (상세는 `_DEV/Handoff/phase1_build.md`)

**Supabase 마이그레이션 3 파일** (운영 `kjtplptbkjlchfmovgph` 에 적용 완료):
- `supabase/migrations/0013_ar_base_tables.sql` — 8 테이블 + 인덱스 + RLS 전면 개방 + Realtime publication + `ar_games` singleton seed
- `supabase/migrations/0014_ar_rpc_capture.sql` — `capture_creature` RPC + `haversine_km` + `generate_ar_reward_code` + `issue_spawn_token`
- `supabase/migrations/0015_ar_rpc_claim_prize.sql` — `claim_ar_prize` RPC

**테이블 8종**: `ar_games` (singleton), `ar_zones`, `ar_creatures`, `ar_spawn_tokens` (TTL 60s), `ar_captures` (UNIQUE phone+creature_id), `ar_capture_attempts` (7 result enum), `ar_rewards` (AR-XXXXXX), `ar_prize_claims` (UNIQUE phone).

**RPC 수동 테스트**: 5 시나리오 전부 통과 (유효 토큰 / 무효 토큰 / 중복 / 완주 4-rule 동시 발동 / claim_ar_prize 완주·재시도).

**유저 라우트 (lazy, 5종)**:
- `/ar` — IntroPage (3스텝 튜토리얼 + "시작하기" → `/ar/play`)
- `/ar/play`, `/ar/collection`, `/ar/rewards`, `/ar/fallback` — 스텁 (ArStub 공용)

**어드민 라우트 (superadmin 전용, 7종)**:
- `/ar/settings`, `/ar/zones`, `/ar/creatures`, `/ar/stats`, `/ar/rewards`, `/ar/prize-claims`, `/ar/attempts`
- AdminLayout `NAV_GROUPS` 에 "AR 게임 관리" 섹션 추가

**BottomNav 교체**: "탐험" `/ar-tech-test` → `/ar`.

**Phase 0 임시 자산 처리**:
- `/ar-tech-test` 라우트는 `import.meta.env.DEV` 가드로 전환 (프로덕션 제외)
- `_DEV/Handoff/PHASE_0_PROMPT.md` → `_DEV/Handoff/archive/` 이동
- `TechTestPage.tsx` / `TestScene.ts` 는 Phase 2 재활용 위해 유지

**타입**: `src/types/database.ts` 에 ar_* 8 테이블 + RPC 5 + 편의 타입 수동 추가. `tsc --noEmit` 통과.

### Phase 1 확정 결정사항

| ID | 항목 | 값 |
|---|---|---|
| ① | AR 보상 테이블·코드 명칭 | `ar_rewards` + `AR-XXXXXX` |
| ② | `/ar-tech-test` 처리 | DEV 전용 (`import.meta.env.DEV`) |
| ③ | `reward.type` 문자열 | `voucher` (DB 저장: `voucher` / `prize_claim_trigger`) |
| ④ | RLS 수위 | MVP 전면 개방 (`FOR ALL USING(true) WITH CHECK(true)`) |

### `capture_creature` 임계치

| 상수 | 값 |
|---|---|
| `RATE_LIMIT_SEC` | 5 |
| `VELOCITY_KMH_MAX` | 30 |
| `ZONE_WINDOW_MIN` | 10 |
| `ZONE_WINDOW_MAX_TRY` | 5 |
| `TOKEN_TTL_SEC` | 60 |

---

## ✅ Phase 0 — 완료된 것 (요약)

상세는 `_DEV/Handoff/페이즈0_빌드.md` 참조.

### 산출물
- `docs/ar-module/phase-0-analysis.md`, `integration-plan.md`, `ar-test-matrix.md`, `phase-0-test-scenarios.md`
- `src/features/ar/three/TestScene.ts`, `pages/TechTestPage.tsx` — WebAR 프로토타입
- 실기 검증 (iPhone iOS 26.3.1 Safari 26.3) — L1 60fps, L2 정상, 백 버튼·재진입 OK

### 핵심 결정사항
- 멀티테넌트 없음 (축제당 1 배포, 코드 포크)
- AR 스택 = `getUserMedia` + Three.js 오버레이 (WebXR/MindAR 배제)
- 3D 에셋 = Cloudflare R2 (egress 무료)
- 쿠폰 · 스탬프 · AR 수집 보상 **완전 분리**
- `ar_captures` UNIQUE = `(phone, creature_id)`, `ar_game_id`/`festival_id` FK 없음
- 접근성 폴백 계단 L1~L4, 실시간 희귀 알림 스코프 제외

### Phase 0 발견
- iOS UA Frozen (`iPhone OS 18_7`) — feature detection 필수
- `getUserMedia` 기본 해상도 VGA → Phase 2 에서 ideal 명시 필요

---

## 🎯 Phase 2 — 시작 조건

**진입 요구사항**:
- [x] Phase 1 완료 (DB + 방어 RPC + 라우팅 뼈대)
- [x] RPC 수동 테스트 통과
- [ ] Phase 2 프롬프트 수신
- [ ] Cloudflare R2 버킷 + 커스텀 도메인 확정
- [ ] 3D 에셋 샘플 1~2개 제공

**Phase 2 예상 범위**:
- `/ar/play` 에서 `getUserMedia` 카메라 + Three.js 오버레이 실구현
- 자이로 시차 (DeviceOrientation API, iOS `requestPermission` 플로우)
- 폴백 계단 Level 1~3 동작 (자이로 미지원 → 정적 / WebGL 저사양 → 2D)
- R2 연동 (`ar_creatures.model_url` 로드, Draco 압축 대응)
- Vite `manualChunks` 로 Three.js 청크 분리
- iOS 16.4 미만 → Level 4 (`/ar/fallback`) 자동 라우팅 (feature detection)

---

## 🔗 향후 Phase 진행 중 결정할 항목

아래 항목은 해당 Phase 착수 시점에 확정. Claude Code는 임의 결정 금지.

| 항목 | 결정 시점 | 영향 범위 |
|---|---|---|
| 3D 에셋 외주사 선정 세부 | Phase 2 착수 전 | 에셋 스케줄, 품질 기준 |
| Cloudflare R2 커스텀 도메인 | Phase 2 | `ar_creatures.model_url` 저장 형식 |
| 위치 데이터(`client_lat/lng`) 파기·익명화 정책 | Phase 5~6 | 보관 스크립트, 개인정보 공지 |
| GPS 약한 지점용 QR 기반 존 강제 확정 백업 | Phase 3 실기 테스트 후 | 존 API, QR 생성 |
| 정상 활동 대시보드 메트릭 상세 | Phase 6 어드민 | 통계 쿼리, 차트 구성 |

---

## 📝 최근 변경 파일

| Phase | 파일 | 종류 | 비고 |
|---|---|---|---|
| 1 | `supabase/migrations/0013_ar_base_tables.sql` | 신규 | 테이블 8 + 인덱스 + RLS + Realtime |
| 1 | `supabase/migrations/0014_ar_rpc_capture.sql` | 신규 | capture_creature + 보조 3종 |
| 1 | `supabase/migrations/0015_ar_rpc_claim_prize.sql` | 신규 | claim_ar_prize |
| 1 | `src/features/ar/pages/IntroPage.tsx` (+css) | 신규 | 유저 인트로 (튜토리얼) |
| 1 | `src/features/ar/pages/ArStub.tsx` (+css) | 신규 | 유저 스텁 공용 |
| 1 | `src/features/ar/pages/{Play,Collection,Rewards,Fallback}Page.tsx` | 신규 | 유저 스텁 4종 |
| 1 | `src/features/ar/pages/admin/AdminArStub.tsx` (+css) | 신규 | 어드민 스텁 공용 |
| 1 | `src/features/ar/pages/admin/AdminAr*.tsx` | 신규 | 어드민 스텁 7종 |
| 1 | `src/App.tsx` | 수정 | `/ar/*` 5 + admin `/ar/*` 7 routes, `/ar-tech-test` DEV 가드 |
| 1 | `src/components/layout/BottomNav.tsx` | 수정 | "탐험" path `/ar-tech-test` → `/ar` |
| 1 | `src/components/admin/AdminLayout.tsx` | 수정 | NAV_GROUPS "AR 게임 관리" 섹션 |
| 1 | `src/types/database.ts` | 수정 | ar_* 8 + RPC 5 + 편의 타입 |
| 1 | `_DEV/Handoff/PHASE_0_PROMPT.md` → `archive/` | 이동 | 완료 프롬프트 아카이브 |
| 1 | `_DEV/Handoff/PHASE_1_PROMPT.md` → `archive/` | 이동 | 완료 프롬프트 아카이브 |
| 1 | `_DEV/Handoff/phase1_build.md` | 신규 | Phase 1 빌드 핸드오프 |
| 0 | `package.json` | 수정 | `three`, `@types/three` |
| 0 | `src/features/ar/three/TestScene.ts` | 신규 | Three.js 프로토타입 씬 |
| 0 | `src/features/ar/pages/TechTestPage.tsx` (+css) | 신규 | 기술 검증 페이지 (DEV 전용 전환) |
| 0 | `docs/ar-module/*.md` | 신규 | 분석·설계·테스트 매트릭스 4종 |

---

## ⚠️ 알려진 위험·미결 이슈

- **어드민 비밀번호 하드코딩** (`AdminLayout.tsx:65–68`) — 운영 전 환경변수화 필요. AR 어드민 7종 추가로 보안 표면 소폭 증가.
- ~~**`/ar-tech-test` 프로덕션 번들 제거 검증**~~ — ✅ **Phase 2 착수 시 해결**. `src/App.tsx` 에서 `isDevMode` 변수 경유가 아닌 `import.meta.env.VITE_DEV_MODE === 'true'` inline 가드로 교체하여 Rolldown 이 orphan chunk 까지 제거하도록 유도. `VITE_DEV_MODE=false` 빌드에서 `TechTestPage-*.js/.css`, `TestScene-*.js` (505 KB three 청크) 모두 `dist/` 에서 사라지는 것 확인.
- **`ar_spawn_tokens` cleanup 미구현** — expire+1d 이후 row 누적. Phase 7 운영 작업 (pg_cron 등).
- **Realtime 구독 동작 미검증** — publication 등록은 완료, 실제 구독은 Phase 6 어드민 모니터 구현 시 확인.
- **Vercel serverless 함수 복사 관행** — AR 모듈은 RPC 집중으로 최소화. API 레이어 공통 코드 생기면 인라인 복사 필요.

---

*HANDOFF.md — v2.0 · Phase 1 completion*
