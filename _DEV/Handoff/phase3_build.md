# Phase 3 빌드 핸드오프 (R1 완료 · ⓐ 검증 대기 · R2 프롬프트 대기)

> **상태**: Phase 3-R1 (스키마·RPC·API·어드민 UI) 구현·로컬 검증·커밋 완료. push 는 체크포인트 ⓐ(사용자 검증) 통과 후 진행. R2 프롬프트 수신 전 R2 착수 금지.
> **작성 기준**: `AR_MODULE_PROJECT_BRIEF.md` v0.3, `phase3_redesign.md` v1.0, `PHASE_3_R1_PROMPT.md` v1.0, `phase2_build.md` v1.2

---

## 🚨 재설계 사유 (2026-04-19, 사용자 결정 · 역사 기록)

### 배경

Phase 3-A~F 설계(다중 zone + 엄격 GPS 판정 + 히스테리시스) 는 **도시 스케일 AR** 가정. 실제 타겟은 **축제장 스케일(50×150m)**. zone radius 를 축제장 스케일로 축소하면 GPS 오차(실외 5~30m) 가 반경과 겹쳐 판정 불가.

> Phase 3 엔지니어링 품질은 문제 없음. 사용 맥락과 어긋남. — 사용자

### 재설계 방향

1. Zone 을 **다중 포인트에서 축제장 geofence 1개**로 재정의.
2. 스폰 트리거를 **zone 진입 → 시간·이동량 기반**으로 전환.
3. 축제장 밖에서는 AR 비활성 (안내 UI 만).
4. **쿨다운 메카닉 도입** (경품 풀 연동).

상세는 `phase3_redesign.md` v1.0.

### 작업 분리 · 진행 현황

| 단계 | 주제 | 상태 |
|---|---|---|
| **Phase 3-R1** | 설정 · 스키마 · 어드민 | ✅ 구현·로컬 검증·커밋 완료 (2026-04-19). 체크포인트 ⓐ(사용자 검증) 대기 |
| **Phase 3-R2** | 클라이언트 geofence + 스폰 스케줄러 | ⏸ R1 검증·승인 후 별도 프롬프트로 착수 |
| **Phase 3-R3** | 서버 스폰 정책 재정의 + 경품 미션 필드 | ⏸ R2 완료 후 |

**전달 방식**: R1 → R2 → R3 순차. 각 단계 완료 후 체크포인트 보고 → 사용자 승인 → 다음 단계 프롬프트 수신.

### 확정 파라미터 (초기값 · R1 에서 DB 반영 완료)

전부 어드민에서 조정 가능. DB 저장은 `ar_festival_settings` (R1 범위, 구현 완료).
세부 해석·근거·변경 이력은 `phase3_redesign.md` 참조.

| 파라미터 | 초기값 | 비고 |
|---|---|---|
| geofence 중심 좌표 | `37.7985, 128.8990` | 축제장 중앙(경포해변) |
| geofence 반경 | `200m` | 축제장 50×150m + 주변 동선 여유 |
| 스폰 주기 | `45s` | 시간 트리거 — R2 클라 훅이 참조 |
| 이동 보너스 임계 | `50m` | R2 이후 사용 |
| rarity 분포 | `common 75 / rare 22 / legendary 3` (%) | DB 저장, R3 에서 `/api/ar/spawn` 로직 연동 |
| 포획 유효 | `60s` | 현재 `issue_spawn_token` 하드코딩. R3 에서 DB 값 연동 예정 |
| 쿨다운 | `0s` (없음) | DB 저장, R3 에서 로직 반영 |
| 경품 미션 | `common 10 / rare 3 / legendary 1` | DB 필드 저장까지만. 판정·발급은 Phase 4 |

---

## ✅ Phase 3-R1 완료 상세 (2026-04-19)

### 커밋

| 해시 | 제목 | 상태 |
|---|---|---|
| `0edb681` | feat(ar): Phase 3-R1 — ar_festival_settings + 설정 RPC + 어드민 UI + ar_zones 삭제 | ✅ 로컬 · 체크포인트 ⓐ 검증 후 push 예정 |

### 산출물 (14 files changed, 964 insertions, 207 deletions)

**신규 (5)**
- `supabase/migrations/0016_ar_festival_settings.sql` — 싱글톤 테이블 + RLS + `get_festival_settings` / `update_festival_settings` RPC
- `supabase/migrations/0017_ar_drop_zones.sql` — `ar_zones` DROP + `zone_id` FK 컬럼 3개 DROP + `issue_spawn_token` 2파라미터 전환 + `capture_creature` DROP
- `supabase/seeds/ar_festival_default.sql` — 활성 설정 row 1개 seed (경포해변 초기값. `WHERE NOT EXISTS` 가드로 멱등)
- `api/ar/festival.ts` — `GET /api/ar/festival` (활성 설정 조회)
- `src/features/ar/pages/admin/AdminArSettings.module.css` — 어드민 폼 스타일

**수정 (6)**
- `api/ar/spawn.ts` — zone_id 요구 제거, `issue_spawn_token` 2파라미터 호출, 기존 유효 토큰 재사용 키를 `phone` 단독으로
- `src/App.tsx` — `AdminArZones` import/route 제거
- `src/components/admin/AdminLayout.tsx` — "구역 관리" 네비 항목 제거 + `Map` 아이콘 import 제거
- `src/features/ar/pages/admin/AdminArSettings.tsx` — 스텁을 실제 편집 폼으로 교체 (기본·Geofence·스폰·Rarity·포획·미션 6 섹션. rarity 합 100 클라 검증)
- `src/types/database.ts` — `ar_zones` 제거, 3개 테이블의 `zone_id` 필드 제거, `ar_festival_settings` 추가, `issue_spawn_token` 2파라미터로 수정, `get/update_festival_settings` 추가, `capture_creature` 제거, 편의 타입 교체
- `supabase/README.md` — 초기 셋업 목록에 0013~0017 추가, Phase 3 seed 섹션 재작성

**삭제 (3)**
- `api/ar/zones.ts` → `api/ar/festival.ts` 로 교체
- `src/features/ar/pages/admin/AdminArZones.tsx` — 스텁 정리 (네비·라우트 동시 제거)
- `supabase/seeds/ar_test_zones.sql` → `ar_festival_default.sql` 로 교체

### 핵심 결정 반영

| 결정 | 값 | 구현 위치 |
|---|---|---|
| Q1 — `ar_zones` FK 처리 | **B (컬럼 전부 DROP)** | `0017_ar_drop_zones.sql` |
| Q2 — `issue_spawn_token` 시그니처 | **A (`p_zone_id` 제거, 2파라미터)** | `0017` + `api/ar/spawn.ts` + `database.ts` |
| Q3 — 어드민 저장 인증 경로 | **γ (공개 RPC 로 진행, 서버 인증은 Phase 6+ 전체 어드민 일괄)** | `AdminArSettings.tsx` → `supabase.rpc` 직접 호출 |

### 로컬 검증

- `npx tsc --noEmit` — EXIT=0
- `npm run build` — `built in 454ms` (기존 chunk size warning 외 이슈 없음)

---

## 🧩 R1 부수 처리 기록

### `capture_creature` RPC DROP (계획 외 — Q1-B 귀결)

**결정**: `0017_ar_drop_zones.sql` 에서 `capture_creature` RPC 를 DROP.

**사유**
- 함수 본문이 `v_token_row.zone_id` / `ar_captures.zone_id` / `ar_capture_attempts.zone_id` 등 **4곳**에서 zone_id 를 참조.
- Q1-B(컬럼 전부 DROP) 확정 후 해당 참조 전부 제거 불가피.
- HTTP `/api/ar/capture` 엔드포인트는 아직 **미존재** (`api/ar/` 에 `spawn.ts` · `festival.ts` 만). 즉 `capture_creature` 를 실사용하는 경로 없음.
- R1 프롬프트 §2.1 "포획 API (`/api/ar/capture`) 수정 금지 — Phase 4 범위" 는 HTTP 엔드포인트에 대한 제약. RPC 는 범위 내로 해석.

**전제 (Phase 4 범위)**
- Phase 4 에서 geofence 기반으로 `capture_creature` 를 신규 작성.
- 재설계 후 RPC 는 festival_settings 의 쿨다운·포획 조건 파라미터를 참조하게 될 예정.
- R1 은 스키마·파라미터 저장만 제공. 판정 로직은 Phase 4 가 구현.

**영향**
- 기존 `zone_rate_limit` result 값은 `ar_capture_attempts.result` CHECK 제약에 enum 으로 남김. 불필요한 churn 회피 (Phase 4 가 필요 시 제약 정리).

---

## 🔒 후속 보안 작업 (Phase 6+ 범위) — γ 조건 2-1

현재 GNfesta 어드민 전체(공지·쿠폰·매출·주문·AR 설정 등) 가 **클라 sessionStorage 단일 인증** 수준. Phase 3-R1 의 `update_festival_settings` 도 이 관행에 맞춰 공개 RPC 로 구현.

### TODO (Phase 6+ 일괄 적용)

| 항목 | 범위 |
|---|---|
| 전체 어드민 서버 인증 체계 도입 | 현재 sessionStorage 클라 인증 → 서버 세션·토큰 기반. 신규 env (예: `ADMIN_API_TOKEN` / `SUPABASE_SERVICE_ROLE_KEY`) 도입 |
| `update_festival_settings` RPC 를 service_role 전용 RPC 로 전환 | SECURITY DEFINER 유지하되 호출 경로를 서버 API 로만 제한 |
| `/api/admin/*` 네임스페이스 신설 · 어드민 API 통합 | 모든 어드민 write 를 서버 미들웨어 경유 |
| 본 보안 작업은 AR 기능 **단독이 아닌 전체 어드민 일괄 적용 범위** | 공지·쿠폰·매출·주문·AR 설정 등 동시에 강화 |

### 현 상태 주석 (코드 내)

- `0016_ar_festival_settings.sql` `update_festival_settings` 정의 상단에 SECURITY NOTE 주석 명시 완료.
- 향후 세션이 "왜 공개 RPC 냐" 헷갈리지 않도록 이 문서 섹션을 링크.

---

## 📦 Phase 3 산출물 재분류 (R1 반영 후)

### ✅ R1 완료분 (재설계 반영 완료)

| 파일 / 자산 | 내용 |
|---|---|
| DB `ar_festival_settings` 테이블 | 싱글톤 패턴 (`active=true` partial unique) + CHECK 제약 (rarity 합 100 포함) |
| RPC `get_festival_settings()` / `update_festival_settings(jsonb)` | 공개 RPC (γ). SECURITY NOTE 주석 명시 |
| RPC `issue_spawn_token(p_phone, p_creature_id)` | 2파라미터로 축소. TTL 60초 하드코딩 유지 (R3 에서 festival 설정 연동 예정) |
| `api/ar/festival.ts` | `GET /api/ar/festival` — `get_festival_settings` 프록시 |
| `api/ar/spawn.ts` | zone_id 제거 + 2파라미터 RPC 호출. rarity 분포 하드코딩 유지 (R3 에서 festival 설정 연동) |
| `/admin/ar/settings` 페이지 | 실제 편집 폼. rarity 합 100 클라 검증 + RPC 직접 호출 |
| `ar_zones` DB 테이블 | DROP 완료 |
| `zone_id` FK 컬럼 (`ar_spawn_tokens` / `ar_captures` / `ar_capture_attempts`) | DROP 완료 (관련 인덱스 연쇄 제거) |
| `capture_creature` RPC | DROP 완료. Phase 4 재설계 |

### ⏸ R2 범위 — 손대지 말 것

| 파일 | 상태 / R2 예정 작업 |
|---|---|
| `src/features/ar/pages/PlayPage.tsx` | 손대지 않음. R2 에서 zone 콜백 제거 → `useFestivalGeofence` + `useSpawnScheduler` 로 재구성 + 축제장 밖 안내 UI |
| `src/features/ar/components/MiniMap.tsx` | 손대지 않음. R2 에서 `zones[]` → 단일 `geofence` prop 으로 좁힘 |
| `src/features/ar/lib/detectZoneEntry.ts` | 손대지 않음. R2 에서 삭제 |
| `src/features/ar/hooks/useZoneDetection.ts` | 손대지 않음. R2 에서 삭제 |
| `src/features/ar/lib/api.ts` `getArZones` | 손대지 않음. R2 에서 `/api/ar/zones` 404 가 될 것 (엔드포인트 삭제됨) 을 감안해 호출자 제거 후 함수 자체 삭제 |
| `src/features/ar/lib/api.ts` `postArSpawn({ zoneId })` | 손대지 않음. 현재 서버가 `zone_id` 를 조용히 무시하므로 빌드·런타임 모두 영향 없음. R2 에서 시그니처 정리 |
| `src/features/ar/components/DevDiagnosticPanel.tsx` | 손대지 않음. R2/R3 에서 의미 재해석 |

### ⏸ R3 범위

| 항목 | 예정 작업 |
|---|---|
| `api/ar/spawn.ts` | geofence 검증 + 시간·이동 유효성 + 쿨다운 파라미터 반영. rarity 분포를 `ar_festival_settings` 에서 동적 로드 |
| `issue_spawn_token` TTL | `ar_festival_settings.capture_token_ttl_sec` 에서 동적 로드 |
| `ar_festival_settings` 경품 미션 조건 | 저장 필드는 R1 에서 도입 완료. 판정·발급 로직은 Phase 4 |

### 🔁 유지 (Phase 3 재설계 무관, 변경 없음)

| 파일 | 역할 |
|---|---|
| `src/features/ar/hooks/useArPermissions.ts` | GPS 권한 확장 |
| `src/features/ar/hooks/useGpsPosition.ts` | `watchPosition` 래퍼 |
| `src/features/ar/three/ArScene.ts` / `CreatureLoader.ts` / `GyroController.ts` / `CameraStream.ts` | Phase 2 회귀 보호 불가침 |
| Phase 1 DB 나머지 7 테이블 (`ar_games`, `ar_creatures`, `ar_spawn_tokens`, `ar_captures`, `ar_capture_attempts`, `ar_rewards`, `ar_prize_claims`) + `haversine_km` / `generate_ar_reward_code` / `claim_ar_prize` RPC | 유지. R1 에서 `zone_id` 컬럼만 DROP |

---

## 🗂 커밋 이력 (Phase 3 진행)

| 해시 | 제목 | 상태 |
|---|---|---|
| `0edb681` | feat(ar): Phase 3-R1 — ar_festival_settings + 설정 RPC + 어드민 UI + ar_zones 삭제 | ✅ 로컬 · 체크포인트 ⓐ 통과 후 push |
| `0173462` | docs(ar): phase3_build v0.2 → v0.3 — 재설계 4곳 보완 | 유지 |
| `70eaf2a` | docs(ar): Phase 3 재설계 대기 핸드오프 — 다음 세션 컨텍스트 보존 | 유지 |
| `4e21a34` | feat(ar): Phase 3-D+E — Leaflet 미니맵 + PlayPage 서버 스폰 통합 | R2 에서 대폭 수정 예정 |
| `eade0b1` | docs: Vercel preview SSO curl 우회 절차 문서화 | 유지 |
| `1e01e8f` | feat(ar): Phase 3-A~F — GPS 훅 + 구역 판정 + 스폰 API + seed SQL | 일부 폐기 (`ar_zones` / seed), 일부 재활용 (`ar_creatures` seed 등) — R1 에서 정리 |

---

## 🔍 체크포인트 통과 내역

### Phase 3-A~F 이전 설계 체크포인트

**ⓐ GPS 훅 + 구역 판정 단위 구현 (통과)**
- `useArPermissions.requestGps` 분리 확정
- 히스테리시스 / `TRUST_K=1.5` 공식 확정

**ⓑ 서버 스폰 API + seed SQL + curl 5건 (통과)**
- `GET /api/ar/zones` / `POST /api/ar/spawn` 정상
- `zone_not_active` / `invalid_phone` 거절 정상

**ⓒ DevTools 위치 시뮬 E2E (중단)**
- 11 케이스 실행 전 사용자가 재설계 결정. 본 시리즈는 폐기.

### Phase 3 재설계 체크포인트

**⓪ R1 로컬 (통과)**
- `tsc --noEmit` EXIT=0
- `vite build` 성공 (454ms)
- 빌드 이슈: 기존 chunk size warning 만 (R1 무관)

**ⓐ R1 사용자 검증 (⏸ 대기)** — 절차는 `PHASE_3_R1_PROMPT.md` §5 참조
1. Supabase SQL Editor 에서 마이그레이션 0016·0017 + seed `ar_festival_default.sql` 실행
2. DB 검증 쿼리 3건 (ar_zones 없음 · ar_festival_settings 활성 1행 · zone_id 컬럼 없음)
3. curl 검증 (쿠키 우회 토큰 방식 — `vercel_preview_bypass.md`):
   - `GET /api/ar/festival` → 활성 설정 반환
   - `POST /api/ar/spawn` (zone_id 없이) → `{ok:true, spawn:{...}}`
4. 어드민 UI `/admin/ar/settings` 접속·로드·저장·확인

**ⓑ R2 (R1 승인 후)**
**ⓒ R3 (R2 승인 후)**

---

## 📝 메모 (재설계 후에도 보존)

### M-1. PlayPage 포획 UI — Phase 2 잔존

PlayPage 의 **로컬 captured state / 포획 토스트 / HUD 포획 완료** 는 Phase 2 잔존 로직. Phase 4 에서 서버 `/api/ar/capture` (신규 엔드포인트 + 재설계된 `capture_creature` RPC) 응답으로 대체 예정.

- 현재 포획 터치는 **서버 미호출**, 로컬 UI 전환만 발생.
- R1 는 PlayPage 미접촉 (R2 범위).
- Phase 4 진입 시 `handleCanvasPointerDown` 내부 `setActiveSpawn({ captured: true })` 블록을 `capture_creature` RPC 호출 + 응답 분기로 교체.

### M-2. iOS gesture chain 순서 — Phase 7 QA 실기 튜닝

`handleStart` 에서 `requestGyro → requestCamera → requestGps` 순으로 호출. 실기 단말에서 프롬프트 수용성·사용자 당황도·권한 거부율은 **Phase 7 QA 현장 테스트에서 튜닝 항목**. (변경 없음)

### M-3. `detectZoneEntry.ts` TRUST_K=1.5 + 히스테리시스 공식 (폐기 예정이나 재활용 가능)

R2 에서 삭제 예정이나, 신뢰 임계치 공식 자체는 `useFestivalGeofence` (신규) 에서 재활용 여지:
- `accuracy ≤ radius × 1.5` 만 판정 후보
- 진입 `d ≤ radius`, 퇴장 `d > radius × 1.1`
- Haversine 은 PostGIS 금지 원칙 (브리프·프롬프트 반복) 그대로.

---

## 🔜 다음 단계 (체크포인트 ⓐ 통과 후)

1. **체크포인트 ⓐ 통과 확인**: 사용자가 DB·curl·어드민 UI 검증 → 승인.
2. **push**: `git push origin main` — 승인 후에만.
3. **R2 프롬프트 수신**: 사용자가 R2 착수 프롬프트 작성·전달.
4. **R2 착수 금지 원칙**: R2 프롬프트 수신 전 `PlayPage.tsx` / `MiniMap.tsx` / `detectZoneEntry.ts` / `useZoneDetection.ts` / `getArZones` / `postArSpawn` 손대지 않음.

---

## 🔜 다음 세션 진입 절차 (혹시 세션 단절 시)

1. **필독**:
   - 본 문서 (phase3_build.md v0.4)
   - `phase3_redesign.md` v1.0
   - `PHASE_3_R1_PROMPT.md` v1.0 (R1 완료됨 — 역사)
   - 향후 R2/R3 프롬프트 (사용자 전달)
2. **코드 수정 금지**: R2 프롬프트 수신 전까지 게임 로직 영역 코드 작성 금지.
3. **Phase 2 회귀 보호 유지**: ArScene 자이로 이슈 / 기술 부채 #1 (CreatureLoader clone 공유 참조) — 재설계가 ArScene 내부를 다시 건드리게 되지 않는지 경계.

---

*Phase 3 빌드 핸드오프 v0.4 — R1 완료 · 체크포인트 ⓐ 대기 · capture_creature DROP 및 후속 보안 작업 기록 — 2026-04-19*
