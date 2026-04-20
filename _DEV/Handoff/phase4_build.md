# Phase 4 빌드 핸드오프 (capture · mission · collection — 구현·로컬·push 완료 · 체크포인트 ⓓ 검증 대기)

> **상태**: Phase 3-R1/R2/R3 완료 (phase3_build.md v0.7 · 체크포인트 ⓒ 5/5 통과). **Phase 4 코드 구현·로컬 검증·push 완료 (2026-04-20, 커밋 `8375dd0`)**. DB 마이그레이션 `0019` 원격 적용 대기 · 체크포인트 ⓓ 사용자 검증 대기.
> **작성 기준**: `AR_MODULE_PROJECT_BRIEF.md` v0.3, `PHASE_4_PROMPT.md` v1.0, `phase3_build.md` v0.7

---

## 📎 이전 Phase 아카이브

| 문서 | 상태 |
|---|---|
| `phase3_build.md` v0.7 | ✅ Phase 3 완결 · R1/R2/R3 통과 · 체크포인트 ⓒ 5/5 완료 (2026-04-20). 본 문서와 병행 참조 가능하나, Phase 4 이후는 본 문서가 단일 진실 |
| `phase2_build.md` v1.2 | ✅ 아카이브 (Phase 2 완결) |
| `phase1_build.md` · `페이즈0_빌드.md` | ✅ 아카이브 |

---

## 🎯 Phase 4 목표 (PHASE_4_PROMPT.md §1)

1. **포획 API 신규** — `/api/ar/capture` + `capture_creature` RPC 재설계 (geofence + velocity + 미션 판정 원자 처리)
2. **미션 판정·경품 발급** — `mission_{common,rare,legendary}_count` 도달 시 `ar_rewards` INSERT
3. **도감 UI** — `CollectionPage` (`/ar/collection`) — `/api/ar/collection` 으로 phone 기준 조회
4. **PlayPage 포획 핸들러 M-1 해소** — 로컬 captured state → 서버 RPC 호출로 교체
5. **velocity anti-cheat** — `velocity_cap_kmh` (default 50) 필드 + RPC 내부 검증 + 어드민 UI + DevPanel 표시

---

## ⚙️ 착수 전 확정 사항 (PHASE_4_PROMPT.md §3)

| 질문 | 결정 | 근거 |
|---|---|---|
| Q1 — 응답 유니온 규약 | **A** (R3 reason-shape 확장) | 기존 `isSpawnServerRejection` 가드 패턴 재활용 |
| Q2 — M-5 (ArScene 인스턴스 누적) 이관 | **B** (Phase 5 이관) | ArScene destroy API 신설은 Phase 5 에셋 도입과 함께 |
| Q3 — velocity anti-cheat | **A** (포함, 50km/h default, 첫 capture · 시간차 < 1초 skip) | 안티치트 제1안 |
| 커밋 분리 | **A** (R3 전례 일괄 단일 코드 커밋 + doc 커밋 별도) | 논리적 묶음 |

**응답 유니온 — capture (Q1=A):**

| status | payload |
|---|---|
| 200 | `{ ok:true, capture_id, grade, new_rewards?:[{grade,code}...] }` |
| 403 | `{ ok:false, reason:'outside_geofence', distance_m }` |
| 403 | `{ ok:false, reason:'velocity_anomaly', speed_kmh }` |
| 404 | `{ ok:false, reason:'invalid_token' }` |
| 409 | `{ ok:false, reason:'duplicate', capture_id }` |
| 410 | `{ ok:false, reason:'expired' }` |

클라 타입 가드는 **별도 `isCaptureRejection` 추가** (기존 `isSpawnServerRejection` 보존, 재량 결정).

---

## 🟡 Phase 4 구현·push 완료 상세 (2026-04-20)

### 커밋

| 해시 | 제목 | 상태 |
|---|---|---|
| `8375dd0` | feat(ar): Phase 4 capture/mission/collection | ✅ push 완료 (코드 본체 일괄) |
| `(본 커밋)` | docs(ar): phase4_build.md v0.1 | 🟡 본 doc 커밋 |

### 산출물 — 신규 (5)

| 경로 | 역할 |
|---|---|
| `supabase/migrations/0019_ar_capture_velocity.sql` | `velocity_cap_kmh` 컬럼 + `update_festival_settings` JSONB 파싱 확장 + `capture_creature` RPC 신규 (6-step validation + 미션 발급) |
| `api/ar/capture.ts` | POST 엔드포인트. RPC 호출 + reason 기반 HTTP status 매핑 + 입력 검증 |
| `api/ar/collection.ts` | GET `?phone=...` 엔드포인트. ar_captures + ar_creatures 조인 + mission_counts + ar_rewards (mission:<grade>) 조합 |
| `src/features/ar/pages/CollectionPage.tsx` | 도감 페이지 본체 (미션 진척도 · 경품 코드 · 등급별 썸네일 카드 그리드) |
| `src/features/ar/pages/CollectionPage.module.css` | 도감 스타일 |

### 산출물 — 수정 (8)

| 경로 | 변경 |
|---|---|
| `supabase/seeds/ar_festival_default.sql` | `velocity_cap_kmh=50` 포함 (기존 `WHERE NOT EXISTS` 가드 유지) |
| `src/types/database.ts` | `ar_festival_settings` Row/Insert/Update 에 `velocity_cap_kmh` 추가 · Functions 에 `capture_creature` 엔트리 추가 |
| `src/features/ar/lib/api.ts` | `FestivalSettingsDto.velocity_cap_kmh` 추가 · `CaptureResponse*` 유니온 + `isCaptureRejection` 가드 · `postArCapture` + `getArCollection` 함수 + `CollectionDto` 타입 세트 |
| `src/features/ar/hooks/useSpawnScheduler.ts` | `ServerRejectionReason` 유니온 확장 (capture reason 5종 포함) · `noteRejection(reason, detail)` 메서드 신규 · `LastServerRejection.reason` 타입 확장 |
| `src/features/ar/components/DevDiagnosticPanel.tsx` | `ServerRejectionReason` import · `Velocity cap` 행 추가 (`<N>km/h`) · `Server reject` 행이 capture reason 도 표시 |
| `src/features/ar/pages/admin/AdminArSettings.tsx` | 포획 섹션에 "이동 속도 상한 (km/h)" 필드 추가 · `velocity_cap_kmh` range 검증 [1, 500] · 미션 섹션 sub 문구 "Phase 4 범위" → "capture RPC 가 발급" 로 갱신 · 쿨다운 Phase 3-R3 안내 문구 제거 |
| `src/features/ar/pages/PlayPage.tsx` | 포획 핸들러 전면 교체 — 로컬 state 제거 → `postArCapture` 호출 · 응답 분기 (성공: markCaptured + 토스트 + new_rewards 모달 / RPC 거절: 한국어 토스트 + `scheduler.noteRejection` · duplicate 시 로컬도 captured 처리 / 기타 실패: lastError + generic 토스트) · `captureInFlightRef` 다중 터치 방지 · 도감 CTA 버튼 + 경품 모달 UI |
| `src/features/ar/pages/PlayPage.module.css` | `.collectionBtn` · `.rewards{Overlay,Card,Title,Desc,List,Item,Grade,Code,Actions,Primary,Secondary}` 스타일 추가 |

### capture_creature RPC 서버 검증 순서 (§1-1, RPC 내부 원자 처리)

```
(1) 토큰 존재 확인             → invalid_token (404)
(2) 토큰 만료 확인             → expired (410)
(3) 토큰 소비 확인 (duplicate) → duplicate (409, 기존 capture_id 동봉)
(4) geofence 재검증           → outside_geofence (403, distance_m)
(5) velocity 검증             → velocity_anomaly (403, speed_kmh)
(6) ar_captures INSERT + 토큰 consumed_at UPDATE (동일 트랜잭션)
(7) 등급별 누적 포획 수 >= mission_count 이고 ar_rewards 에 동일 triggered_by 가 없을 때만
    generate_ar_reward_code() 로 새 코드 발급 + ar_rewards INSERT
(8) 응답 { ok:true, capture_id, grade, new_rewards[] }
```

Velocity 로직 (§1-5):
- 해당 phone 의 직전 `ar_captures` 1건 조회 (없으면 skip)
- `captured_at` 시간차 < 1초 또는 음수 → skip (시계 왜곡 방지)
- 거리 / (시간차 hours) = km/h 계산 → `velocity_cap_kmh` 초과 시 거절

미션 발급 로직 (§1-2):
- `triggered_by = 'mission:common'` / `'mission:rare'` / `'mission:legendary'` 키로 ar_rewards 중복 방지
- `reward_type = 'voucher'`, `status = 'active'`, `amount = NULL`
- new_rewards 응답에는 **이번 capture 로 발급된 것만** 포함

### 클라 포획 UX (§1-4)

PlayPage.handleCanvasPointerDown:
- **성공**: `setCreatureVisible(false)` + `setActiveSpawn({captured:true, visible:false})` + `markCaptured()` + 토스트 `"포획! <이름>"` · new_rewards 존재 시 경품 모달 (도감 보기 CTA / 닫기)
- **RPC 거절** (reason 5종):
  - `outside_geofence`: "축제장 범위를 벗어났어요"
  - `expired`: "시간 초과예요. 다시 시도해 주세요"
  - `duplicate`: "이미 포획한 개체예요" + 로컬에서도 captured 처리 (재탭 방지)
  - `velocity_anomaly`: "이동 속도가 너무 빨라요"
  - `invalid_token`: "포획할 수 없는 상태예요"
  - 모두 `scheduler.noteRejection()` 호출하여 DevPanel `Server reject` 행에 기록
- **기타 실패** (invalid_phone / network_error / server_error): `lastError` + 제네릭 토스트
- **다중 터치 방지**: `captureInFlightRef` 가드

### 로컬 검증

- `npx tsc -b` — EXIT=0 (타입체크 통과)
- `npx vite build` — `built in 520ms` (기존 chunk size warning 외 이슈 없음)

---

## 🚫 금지 사항 준수 확인 (PHASE_4_PROMPT.md §2)

| 항목 | 상태 |
|---|---|
| ArScene · CreatureLoader · GyroController · CameraStream 수정 | ✅ 무변경 |
| `useSpawnScheduler` "활성 currentSpawn TTL 중복방지" 로직 | ✅ 무변경 (`noteRejection` 메서드만 신규 추가, 기존 로직 보존) |
| M-5 (ArScene 인스턴스 누적) 해결 | ✅ 미진행 (Phase 5 이관 확정) |
| M-6 (연속 동일 등급 실패) 해결 | ✅ 미진행 (Phase 5 재검증) |
| DEBUG 플래그 제거·축소 | ✅ 무변경 |
| 어드민 전체 인증 강화 | ✅ 미진행 (Phase 6+ 일괄) |
| R1 기존 스키마 컬럼 변경 | ✅ 추가만 수행 (`velocity_cap_kmh`). `ar_capture_attempts.result` CHECK enum 도 미변경 — 그에 따라 본 RPC 는 attempts 로그 미작성 (Phase 6+ 어드민 감사 범위) |
| `generate_ar_reward_code` RPC 시그니처 변경 | ✅ 재사용만, 시그니처 불변 |

---

## 🟡 체크포인트 ⓓ 사용자 검증 대기

> 체크포인트 ⓓ 상세 절차는 별도 사용자 프롬프트로 수신 예정. 아래는 Claude Code 측 제안 초안.

**선행 조치**: Supabase SQL Editor 또는 `supabase db push` 로 `supabase/migrations/0019_ar_capture_velocity.sql` 원격 적용. 기존 active row 는 `ADD COLUMN DEFAULT 50` 으로 자동 채워짐. seed 재실행은 `WHERE NOT EXISTS` 가드로 no-op.

### §6-1 DB 검증 제안 (4쿼리)

```sql
-- 1. velocity_cap_kmh 컬럼 존재·초기값
SELECT velocity_cap_kmh FROM ar_festival_settings WHERE active = true;
-- 기대: 50

-- 2. capture_creature RPC 존재·시그니처
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc WHERE proname = 'capture_creature';
-- 기대: 'p_token text, p_phone text, p_client_lat double precision,
--        p_client_lng double precision, p_captured_at timestamp with time zone DEFAULT now()'

-- 3. capture_creature 본문 요약
\sf capture_creature
-- 기대: 6-step validation + mission:common/rare/legendary 발급 블록

-- 4. update_festival_settings 시그니처 (불변 확인)
SELECT pg_get_function_arguments(oid)
FROM pg_proc WHERE proname = 'update_festival_settings';
-- 기대: 'p_settings jsonb, p_movement_outlier_cap_m integer DEFAULT NULL' (불변)
```

### §6-2 curl 검증 제안 (6건)

Production alias `https://gnfesta.vercel.app` + Vercel Protection Bypass Token `ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh`.

| # | 시나리오 | 기대 응답 |
|---|---|---|
| 1 | 토큰 발급 (spawn) → 즉시 capture 정상 | 200 `{ok:true, capture_id, grade, new_rewards}` |
| 2 | 동일 token 재호출 | 409 `{ok:false, reason:'duplicate', capture_id}` |
| 3 | 존재하지 않는 token | 404 `{ok:false, reason:'invalid_token'}` |
| 4 | geofence 밖 좌표로 capture | 403 `{ok:false, reason:'outside_geofence', distance_m}` |
| 5 | 짧은 TTL 설정 (`capture_token_ttl_sec=1`) → 만료 대기 후 capture | 410 `{ok:false, reason:'expired'}` |
| 6 | velocity_cap_kmh=1 설정 후 2번째 capture 시도 | 403 `{ok:false, reason:'velocity_anomaly', speed_kmh}` |

### §6-3 어드민 UI 왕복 제안

- `/admin/ar/settings` 포획 섹션에 "이동 속도 상한 (km/h)" 필드 존재 확인
- 50 → 30 저장 → 리로드 반영 확인 → 50 원복 + 성공 토스트 정상
- 미션 섹션 sub 문구가 "capture RPC 가 발급" 으로 바뀐 것 확인

### §6-4 클라 E2E 제안

- 새 세션 `https://gnfesta.vercel.app/ar?debug=1` 진입 → 전화번호 입력 → PlayPage
- DevPanel 에 `Velocity cap: 50km/h` 표시
- 스폰 후 크리처 탭 → `/api/ar/capture` 200 → 토스트 "포획! <이름>" + 크리처 사라짐 + (mission_count=1 짜리 설정으로) 경품 모달 노출 → "도감 보기" → `/ar/collection` 이동 → 해당 등급 1/1 · 경품 코드 노출
- 같은 토큰 재탭 테스트 (duplicate) → 토스트 "이미 포획한 개체예요" + DevPanel `Server reject: duplicate` 행
- 상단 "내 도감" 버튼 누르면 `/ar/collection` 이동 정상

---

## 📝 메모 (phase3_build.md 에서 승계 · Phase 4 이후 관리)

| ID | 주제 | 상태 |
|---|---|---|
| M-1 | PlayPage 포획 UI 서버 연동 | ✅ **Phase 4 에서 해소** (로컬 state → `postArCapture` + 응답 분기) |
| M-2 | iOS gesture chain 순서 튜닝 | Phase 7 QA 현장 실기 |
| M-3 | (삭제) TRUST_K 공식 | — |
| M-4 | 설정 실시간 반영 미지원 | Phase 6 어드민 개선 |
| M-5 | ArScene 인스턴스 누적 | Phase 5 이관 (Q2=B 확정) |
| M-6 | 연속 동일 등급 포획 실패 (PropertyBinding) | Phase 5 실 에셋 도입 시 재검증. Phase 3.5 격상 없음 |
| M-7 (신규) | `ar_capture_attempts` 로그 미작성 | Phase 4 RPC 는 attempts 에 기록하지 않음. `ar_capture_attempts.result` CHECK 제약 enum 이 신규 reason (expired / outside_geofence / velocity_anomaly) 과 맞지 않아 스키마 불변 원칙상 보류. Phase 6+ 어드민 감사 범위에서 enum 확장 + 로깅 재도입 검토 |

---

## 🔜 다음 단계

현재 main HEAD `8375dd0` (Phase 4 코드 push 완료). 본 doc 커밋 후 main HEAD 는 본 doc 커밋으로 이동.

### 다음 세션 재개 순서

1. ⏸ **DB 마이그레이션 원격 적용** — Supabase SQL Editor 또는 `supabase db push` 로 `supabase/migrations/0019_ar_capture_velocity.sql` 적용. 기존 active row 는 `velocity_cap_kmh=50` 로 자동 채워짐. seed no-op.
2. ⏸ **체크포인트 ⓓ 프롬프트 수신** — 사용자가 §6-1~§6-4 또는 그에 상응하는 검증 절차 전달 → 실행 → 결과 보고.
3. ⏸ **검증 결과 수신 → 본 문서 v0.1 → v0.2 치환** — 체크포인트 ⓓ 판정표 결과 반영. 부수 발견은 M-8 이하로 추가.
4. 🚫 **Phase 5 착수 금지** — 체크포인트 ⓓ 통과 + Phase 5 프롬프트 수신 전까지 실 에셋 도입·CreatureLoader 재설계 금지.

### Phase 4 완결 후에도 유지되는 가드

- ArScene · CreatureLoader · GyroController · CameraStream 불가침.
- M-5 Phase 5 이관 / M-6 Phase 5 재검증 / Phase 3.5 격상 없음 확정.
- DEBUG 플래그 Phase 7 QA 까지 유지.
- 어드민 전체 인증 강화는 Phase 6+ 일괄.

### 검증용 상수 · 토큰 (phase3 에서 승계)

- Production alias: `https://gnfesta.vercel.app`
- Vercel Protection Bypass Token: `ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh`
- geofence 안 샘플 좌표: `37.7985, 128.8990`
- geofence 밖 샘플 좌표: `37.7600, 128.9000`
- 검증 전화번호: `01000000000`

---

*Phase 4 빌드 핸드오프 v0.1 — capture · mission · collection 구현·push 완료 (8375dd0, 2026-04-20) · DB 0019 원격 적용 대기 · 체크포인트 ⓓ 사용자 검증 대기 · M-1 해소 · M-5 Phase 5 이관 / M-6 Phase 5 재검증 · DEBUG Phase 7 까지 유지 — 2026-04-20*
