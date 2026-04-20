# GNfesta — Phase 4 빌드 01 결과 보고

**작성일**: 2026-04-20
**커밋 범위**: `c4a452a` (Phase 3 완결) → `8ae57fd` (Phase 4 doc v0.1)
**상태**: Phase 4 코드 구현·로컬 검증 (tsc + vite build) 통과·push 완료. **DB 마이그 `0019` 원격 적용 대기 · 체크포인트 ⓓ 사용자 검증 대기**.

---

## 1. Phase 4 목표 (PHASE_4_PROMPT.md v1.0)

| 주제 | 상태 |
|---|---|
| 포획 API 신규 — `/api/ar/capture` + `capture_creature` RPC 재설계 | ✅ 구현 완료 |
| 미션 판정·경품 발급 — RPC 내부 원자 처리 | ✅ 구현 완료 |
| 도감 UI — `CollectionPage` + `/api/ar/collection` | ✅ 구현 완료 |
| PlayPage 포획 핸들러 M-1 해소 (로컬 state → 서버 RPC) | ✅ 구현 완료 |
| velocity anti-cheat — `velocity_cap_kmh` (default 50) | ✅ 구현 완료 |

---

## 2. 커밋 요약

| 해시 | 제목 | 범위 |
|---|---|---|
| `8375dd0` | feat(ar): Phase 4 capture/mission/collection | 코드 본체 일괄 (§3 Q4=A 결정) |
| `8ae57fd` | docs(ar): phase4_build.md v0.1 | 구현 완료 핸드오프 초안 |

현재 main HEAD: `8ae57fd`.

---

## 3. 착수 전 확정 사항 (PHASE_4_PROMPT.md §3)

| 질문 | 결정 |
|---|---|
| Q1 — 응답 유니온 규약 | **A** — R3 reason-shape 확장. 클라 타입 가드는 `isCaptureRejection` 별도 추가 (기존 `isSpawnServerRejection` 보존) |
| Q2 — M-5 (ArScene 인스턴스 누적) | **B** — Phase 5 이관. 이번 Phase 에서 ArScene destroy API 금지 |
| Q3 — velocity anti-cheat | **A** — 포함. 기본 50 km/h · 첫 capture / 시간차 < 1초 skip |
| Q4 — 커밋 분리 | **A** — R3 전례대로 코드 일괄 1 커밋 + doc 별도 |

---

## 4. 산출물

### 신규 파일 (5)

| 경로 | 라인 | 역할 |
|---|---:|---|
| `supabase/migrations/0019_ar_capture_velocity.sql` | 325 | `velocity_cap_kmh` 컬럼 + `update_festival_settings` JSONB 파싱 확장 + `capture_creature` RPC 신규 |
| `api/ar/capture.ts` | 189 | POST 엔드포인트 · RPC 호출 + reason → HTTP status 매핑 |
| `api/ar/collection.ts` | 154 | GET `?phone=...` · ar_captures + ar_creatures 조인 + mission_counts + ar_rewards 조합 |
| `src/features/ar/pages/CollectionPage.tsx` | 218 | 도감 페이지 — 미션 진척도 · 경품 코드 · 등급별 썸네일 카드 |
| `src/features/ar/pages/CollectionPage.module.css` | 210 | 도감 스타일 |

### 수정 파일 (8)

| 경로 | 변경 |
|---|---|
| `supabase/seeds/ar_festival_default.sql` | `velocity_cap_kmh=50` 포함 (기존 `WHERE NOT EXISTS` 가드 유지) |
| `src/types/database.ts` | `ar_festival_settings` Row/Insert/Update 에 `velocity_cap_kmh` · Functions 에 `capture_creature` 엔트리 |
| `src/features/ar/lib/api.ts` | `FestivalSettingsDto.velocity_cap_kmh` · `CaptureResponse*` 유니온 + `isCaptureRejection` 가드 · `postArCapture` + `getArCollection` 함수 + `CollectionDto` |
| `src/features/ar/hooks/useSpawnScheduler.ts` | `ServerRejectionReason` 유니온 확장 (capture reason 5종 포함) · `noteRejection(reason, detail)` 메서드 신규 |
| `src/features/ar/components/DevDiagnosticPanel.tsx` | `Velocity cap` 행 추가 · `Server reject` 행이 capture reason 도 표시 |
| `src/features/ar/pages/admin/AdminArSettings.tsx` | 포획 섹션에 "이동 속도 상한 (km/h)" 필드 + range 검증 [1, 500] · 미션 섹션 sub 문구 갱신 |
| `src/features/ar/pages/PlayPage.tsx` | 포획 핸들러 전면 교체 — `postArCapture` 호출 + 응답 분기 + new_rewards 모달 + 도감 CTA 버튼 + 다중 터치 방지 (`captureInFlightRef`) |
| `src/features/ar/pages/PlayPage.module.css` | `.collectionBtn` + `.rewards*` 스타일 |

**합계**: 신규 5 + 수정 8 = 13 파일. 1,701 insertions / 23 deletions.

---

## 5. DB 스키마 변경 (마이그 0019)

### 컬럼 추가

```sql
ALTER TABLE ar_festival_settings
  ADD COLUMN IF NOT EXISTS velocity_cap_kmh INTEGER NOT NULL DEFAULT 50;
-- 별도 CHECK: velocity_cap_kmh BETWEEN 1 AND 500
```

### `update_festival_settings` 시그니처 불변 · 본문에 velocity_cap_kmh JSONB 파싱 추가

어드민 UI 기존 JSONB 호출 패턴 그대로 호환.

### `capture_creature` RPC 신규

시그니처: `capture_creature(p_token TEXT, p_phone TEXT, p_client_lat DOUBLE PRECISION, p_client_lng DOUBLE PRECISION, p_captured_at TIMESTAMPTZ DEFAULT now()) RETURNS JSONB`

**검증 순서** (RPC 내부 원자):
```
(1) 토큰 존재 확인             → invalid_token
(2) 토큰 만료 확인             → expired
(3) 토큰 소비 확인 (duplicate) → duplicate + 기존 capture_id 동봉
(4) geofence 재검증           → outside_geofence + distance_m
(5) velocity 검증             → velocity_anomaly + speed_kmh
(6) ar_captures INSERT + ar_spawn_tokens.consumed_at = now() (같은 트랜잭션)
(7) 등급별 누적 포획 수 >= mission_count 이고
    ar_rewards(phone, triggered_by='mission:<grade>') 없을 때만
    generate_ar_reward_code() 신규 발급 + ar_rewards INSERT
(8) 응답 { ok:true, capture_id, grade, new_rewards[] }
```

**Velocity 계산**:
- 해당 phone 의 직전 `ar_captures` 1건 조회 (없으면 skip)
- `EXTRACT(EPOCH FROM p_captured_at - last.captured_at)` < 1초 또는 음수 → skip
- `haversine_km(last, now) / (elapsed_sec / 3600)` > `velocity_cap_kmh` → 거절

**미션 발급**:
- `reward_type = 'voucher'`, `status = 'active'`, `amount = NULL`
- `triggered_by ∈ {'mission:common', 'mission:rare', 'mission:legendary'}` (중복 방지 키)
- `new_rewards` 응답에는 **이번 capture 로 발급된 것만** 포함 (기존 발급분 제외)

**ar_capture_attempts 로그 미작성** — 기존 `result` CHECK enum 이 신규 reason (expired/outside_geofence/velocity_anomaly) 과 맞지 않아 스키마 불변 원칙(§2) 준수. Phase 6+ 어드민 감사 범위에서 enum 확장 + 로깅 재도입 검토 (M-7 신규).

---

## 6. API 명세

### POST `/api/ar/capture`

**요청**: `{ token, phone, lat, lng, captured_at (ISO) }`

**성공 (200)**:
```json
{ "ok": true, "capture_id": 42, "grade": "rare", "new_rewards": [{"grade":"rare","code":"AR-XXXXXX"}] }
```

**거절 (reason shape)**:
| status | reason | 추가 필드 |
|---|---|---|
| 403 | `outside_geofence` | `distance_m` |
| 403 | `velocity_anomaly` | `speed_kmh` |
| 404 | `invalid_token` | — |
| 409 | `duplicate` | `capture_id` |
| 410 | `expired` | — |

**기타 실패 (result shape)**:
- 400 `invalid_phone` / `invalid_request`
- 405 `method_not_allowed`
- 500 `server_error` / `server_misconfigured`

### GET `/api/ar/collection?phone=01012345678`

**성공 (200)**:
```json
{
  "ok": true,
  "collection": {
    "phone": "01012345678",
    "captures": [{ "id", "creature_id", "creature_name", "rarity", "thumbnail_url", "captured_at" }, ...],
    "mission_counts": { "common": 10, "rare": 3, "legendary": 1 },
    "progress":       { "common":  7, "rare": 2, "legendary": 0 },
    "rewards": [{ "grade", "code", "issued_at", "status" }, ...]
  }
}
```

**실패**:
- 400 `invalid_phone`
- 405 `method_not_allowed`
- 500 `server_error` / `server_misconfigured`

---

## 7. 클라이언트 포획 UX (§1-4)

**PlayPage.handleCanvasPointerDown** (전면 교체):

| 응답 | 동작 |
|---|---|
| `ok: true` | `setCreatureVisible(false)` + `setActiveSpawn({captured, visible:false})` + `scheduler.markCaptured()` + 토스트 `포획! <이름>` · `new_rewards.length > 0` 시 경품 모달 (도감 보기 CTA / 닫기) |
| `outside_geofence` | 토스트 "축제장 범위를 벗어났어요" + `scheduler.noteRejection` |
| `expired` | 토스트 "시간 초과예요. 다시 시도해 주세요" + `scheduler.noteRejection` |
| `duplicate` | 토스트 "이미 포획한 개체예요" + `scheduler.noteRejection` + **로컬에서도 captured 처리** (재탭 방지) + `scheduler.markCaptured()` |
| `velocity_anomaly` | 토스트 "이동 속도가 너무 빨라요" + `scheduler.noteRejection` |
| `invalid_token` | 토스트 "포획할 수 없는 상태예요" + `scheduler.noteRejection` |
| 기타 실패 (network/server) | `lastError` 업데이트 + 제네릭 토스트 "포획 요청에 실패했어요…" |

**다중 터치 방지**: `captureInFlightRef` 가드 (true 일 때 추가 탭 무시).

**부가 UI**:
- 우상단 HUD 좌측에 "내 도감" 버튼 (상시 노출, `/ar/collection` 이동)
- 경품 획득 모달 (조건부) — grade + code 리스트 + 도감 보기 / 닫기 버튼

**scheduler 확장**: `LastServerRejection.reason` 유니온에 capture 5종 추가, `noteRejection(reason, detail)` 메서드 신규. 기존 "활성 currentSpawn TTL 중복방지" 로직 불변.

---

## 8. 어드민 UI 변경

**`/admin/ar/settings` 포획 섹션**:
- "포획 토큰 유효시간 (초)" (기존)
- "포획 쿨다운 (초, 0 = 없음)" (기존)
- **"이동 속도 상한 (km/h)"** (신규, 기본 50)
  - 힌트: "직전 포획과의 평균 속도가 초과하면 velocity_anomaly 로 거절 (Phase 4). 기본 50km/h."
- 기존 "쿨다운 실제 적용 로직은 Phase 3-R3 에서…" 안내 제거

**경품 미션 조건 섹션** sub 문구 갱신:
- 기존: "미션 달성 판정 · 경품 발급 로직은 Phase 4 범위 (현재는 조건값 저장만)"
- 신규: "등급별 누적 포획 수가 조건값에 도달하면 capture RPC 가 경품 코드를 1회 발급"

**범위 검증 확장**: `velocity_cap_kmh` [1, 500] 추가.

**DevDiagnosticPanel** 에 `Velocity cap: <N>km/h` 행 추가.

---

## 9. 로컬 검증

```bash
npx tsc -b       # EXIT=0 (타입체크 통과)
npx vite build   # built in 520ms
```

기존 chunk size warning 외 이슈 없음. PlayPage·CollectionPage chunk 정상 분리.

---

## 10. 금지 사항 준수 (§2)

| 항목 | 상태 |
|---|---|
| ArScene · CreatureLoader · GyroController · CameraStream | ✅ 무변경 |
| `useSpawnScheduler` "활성 currentSpawn TTL 중복방지" 로직 | ✅ 무변경 (`noteRejection` 신규 메서드만 추가) |
| M-5 (ArScene 인스턴스 누적) 해결 | ✅ 미진행 (Phase 5 이관) |
| M-6 (연속 동일 등급 실패) 해결 | ✅ 미진행 (Phase 5 재검증) |
| DEBUG 플래그 제거·축소 | ✅ 무변경 |
| 어드민 전체 인증 강화 | ✅ 미진행 (Phase 6+) |
| R1 기존 스키마 컬럼 변경 | ✅ 추가만 수행 (`velocity_cap_kmh`) |
| `generate_ar_reward_code` 시그니처 | ✅ 재사용만, 시그니처 불변 |

---

## 11. 체크포인트 ⓓ 선행 조치 + 검증 계획 (초안)

### 선행 조치

`supabase/migrations/0019_ar_capture_velocity.sql` 원격 적용 (Supabase SQL Editor or `supabase db push`). 기존 active row 는 `ADD COLUMN DEFAULT 50` 으로 자동 채워짐. seed no-op.

### 제안 검증 (§6-1 ~ §6-4)

**§6-1 DB (4쿼리)**:
1. `velocity_cap_kmh` 컬럼·초기값 → 50
2. `capture_creature` 시그니처 → `p_token text, p_phone text, p_client_lat double precision, p_client_lng double precision, p_captured_at timestamp with time zone DEFAULT now()`
3. `capture_creature` 본문에 6-step 검증 + `mission:*` 발급 블록 포함
4. `update_festival_settings` 시그니처 불변 확인

**§6-2 curl (6건)**: 정상 200 / duplicate 409 / invalid_token 404 / outside_geofence 403 / expired 410 (TTL 1초 설정 후) / velocity_anomaly 403 (cap 1km/h 설정 후).

**§6-3 어드민 UI**: "이동 속도 상한" 필드 존재 / 50→30 저장·리로드·원복 / 미션 sub 문구 갱신 확인.

**§6-4 클라 E2E**: `?debug=1` → DevPanel `Velocity cap: 50km/h` / 스폰 후 포획 200 → 토스트 + 경품 모달 (mission_count=1 설정 후) → 도감 보기 CTA → `/ar/collection` → 진척도·경품 표시 / 같은 토큰 재탭 시 duplicate 토스트·DevPanel 기록 / 상단 "내 도감" 버튼 네비게이션 정상.

---

## 12. 메모 (이전 Phase 승계)

| ID | 주제 | 상태 |
|---|---|---|
| M-1 | PlayPage 포획 UI 서버 연동 | ✅ **Phase 4 에서 해소** |
| M-2 | iOS gesture chain 순서 튜닝 | Phase 7 QA 현장 실기 |
| M-3 | (삭제) TRUST_K 공식 | — |
| M-4 | 설정 실시간 반영 미지원 | Phase 6 어드민 개선 |
| M-5 | ArScene 인스턴스 누적 | Phase 5 이관 확정 (Q2=B) |
| M-6 | 연속 동일 등급 포획 실패 (PropertyBinding) | Phase 5 실 에셋 도입 시 재검증. Phase 3.5 격상 없음 |
| **M-7 (신규)** | `ar_capture_attempts` 로그 미작성 | Phase 4 RPC 는 attempts 에 기록하지 않음. `result` CHECK enum 이 신규 reason 과 불일치. Phase 6+ 어드민 감사 범위에서 enum 확장 검토 |

---

## 13. 다음 세션 진입 체크리스트

1. ⏸ **DB 마이그 `0019_ar_capture_velocity.sql` 원격 적용** (선행 조치)
2. ⏸ **체크포인트 ⓓ 사용자 프롬프트 수신** (§6-1 ~ §6-4 또는 그에 상응하는 절차)
3. ⏸ **검증 결과 보고 후 `phase4_build.md` v0.1 → v0.2 치환**
4. 🚫 **Phase 5 착수 금지** — 체크포인트 ⓓ 통과 + Phase 5 프롬프트 수신 전까지 실 에셋 도입·CreatureLoader 재설계 금지

### 참고 문서 (우선순위순)

- `_DEV/Handoff/phase4_build.md` v0.1 — 본 결과 보고와 쌍. 상세 핸드오프
- 본 문서 (`phase4_build01.md`) — 결과 보고 스냅샷
- `_DEV/Handoff/PHASE_4_PROMPT.md` v1.0 — 착수 프롬프트 원본
- `_DEV/Handoff/phase3_build.md` v0.7 — Phase 3 완결 (이전 베이스라인)

### 검증용 상수 (phase3 에서 승계)

- Production alias: `https://gnfesta.vercel.app`
- Vercel Protection Bypass Token: `ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh` (curl 헤더 `x-vercel-protection-bypass`)
- geofence 안 샘플 좌표: `37.7985, 128.8990` (축제장 중앙)
- geofence 밖 샘플 좌표: `37.7600, 128.9000` (강릉역 방향)
- 검증 전화번호: `01000000000`

---

**다음 세션 시작 시 읽을 것**: 본 파일 + `phase4_build.md` v0.1 + `PHASE_4_PROMPT.md` + 사용자 체크포인트 ⓓ 프롬프트.
