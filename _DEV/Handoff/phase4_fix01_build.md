# Phase 4 Fix 01 빌드 로그 — already_captured 분기 추가 (F2 해소)

> **상태**: 코드 + 마이그 + 빌드 + §5-1 마이그 적용 + §5-3 curl C7 + §5-4 E5/E6 재검증 **모두 통과** (2026-04-29). **Phase 4 Fix 01 종결**.
> **작성 기준**: `PHASE_4_FIX01_PROMPT.md` v1.0, `checkpoint_d_result.md` §5 F2, `phase4_build.md` v0.2

---

## §1 Fix 목표

체크포인트 ⓓ §5 F2 — `capture_creature` RPC 가 `(phone, creature_id) UNIQUE` 사전 체크 없이 INSERT → SQLSTATE 23505 → API 핸들러 500 server_error 로 버블하던 케이스를 명시적 `already_captured` reason 으로 분리.

| 영역 | 상태 |
|---|---|
| 마이그 0020 (`capture_creature` 본문 step 3.5 추가) | ✅ 작성·커밋 |
| 클라 응답 유니온 (`CaptureRejectionReason`) + status 매핑 | ✅ 적용·커밋 |
| PlayPage 토스트 분기 + 로컬 captured 처리 (재탭 차단) | ✅ 적용·커밋 |
| `useSpawnScheduler` `ServerRejectionReason` 자동 propagation | ✅ 직접 변경 없음 (api.ts union 통해 흡수) |
| 자체 빌드 (tsc -b + vite build) | ✅ EXIT=0 / 747ms |
| §5-1 마이그 원격 적용 | ✅ PASS (사용자 회신 본문 검증, 2026-04-29) |
| §5-3 curl C7 자체 검증 | ✅ PASS — already_captured 409 + duplicate 409 흡수 양쪽 검증 |
| §5-4 E5/E6 재검증 | ✅ PASS (사용자 회신, 2026-04-29) |

---

## §2 커밋 요약

| 해시 | 제목 | 상태 |
|---|---|---|
| `67c4bdf` | fix(ar): capture_creature already_captured branch (F2) | ✅ 커밋 (push 대기) |
| `(본 커밋)` | docs(ar): phase4_fix01_build.md v0.1 | 🟡 본 doc 커밋 |

push 는 두 커밋 완료 후 main 일괄.

---

## §3 착수 전 확정 사항 (PHASE_4_FIX01_PROMPT.md §3 인용)

| Q | 주제 | 결정 |
|---|---|---|
| F2-1 | 사전 체크 위치 | step 3 (token consumed 체크) 직후, step 4 (geofence) 진입 전 — "step 3.5" |
| F2-2 | reason 명칭 | 신규 `already_captured` (duplicate 와 분리) |
| F2-3 | 클라 토스트 | "이미 도감에 있어요" (already_captured) vs "이미 포획한 개체예요" (duplicate) |
| F2-4 | 마이그 발행 | 0020 신규. CREATE OR REPLACE FUNCTION |
| 부가 1 | HTTP status | 409 (duplicate 와 동일) |
| 부가 2 | already_captured 시 token 소비 | 소비 (`consumed_at = now()`). 같은 token 재탭은 step 3 duplicate 흡수 |
| 부가 3 | spawn API 사전 체크 | 추가 안 함. 빌드로그 §메모 |
| 부가 4 | 빌드로그 명칭 | `phase4_fix01_build.md` (fix 트랙) |
| 커밋 방식 | — | 코드 일괄 1커밋 + doc 별도 |

추가 모호성·§8 발동 — **없음**. 0019 의 `v_token_row.creature_id` / `ar_spawn_tokens.creature_id` 모두 기존 코드에서 확인 (분리 추가 변수 불필요, 기존 `v_existing_id` 재활용).

---

## §4 산출물

**신규 (1)**
- `supabase/migrations/0020_capture_creature_already_captured.sql` (235 lines) — `capture_creature` RPC `CREATE OR REPLACE`. step 3.5 (사전 UNIQUE 체크 + 토큰 소비 + already_captured 응답) 추가. 그 외 검증 분기 본문 0019 와 byte-for-byte 동일.

**수정 (3)**
- `api/ar/capture.ts` (+1 line) — `statusForReason` switch 에 `case 'already_captured':` 추가 (duplicate 와 fallthrough 로 409 매핑).
- `src/features/ar/lib/api.ts` (+5 lines, -1 line 주석) — `CaptureRejectionReason` 유니온에 `'already_captured'` 추가 + JSDoc 갱신.
- `src/features/ar/pages/PlayPage.tsx` (+9 lines, -3 lines) — `CAPTURE_REJECT_TOAST` 에 신규 항목 추가, `rejectionDetail` switch 에 fallthrough 추가, `handleCanvasPointerDown` isCaptureRejection 분기에서 `duplicate || already_captured` 양쪽 모두 로컬 captured 처리.

**무변경 (자동 흡수)**
- `src/features/ar/hooks/useSpawnScheduler.ts` — `ServerRejectionReason = SpawnResponseServerRejection['reason'] | CaptureRejectionReason` 유니온이 api.ts 변경을 자동 propagation. 코드 손대지 않음.

**합계**: 신규 1 + 수정 3 = 4 파일. 246 insertions / 4 deletions.

---

## §5 변경 상세

### §5-1 마이그 0020 — `capture_creature` RPC step 3.5

```sql
-- (3.5) (phone, creature_id) 사전 UNIQUE 체크 — 다른 토큰으로 같은 creature 재포획 차단
SELECT id INTO v_existing_id
FROM ar_captures
WHERE phone = p_phone
  AND creature_id = v_token_row.creature_id
LIMIT 1;
IF FOUND THEN
  UPDATE ar_spawn_tokens SET consumed_at = now() WHERE token = p_token;
  RETURN jsonb_build_object(
    'ok', false,
    'reason', 'already_captured',
    'capture_id', v_existing_id
  );
END IF;
```

기존 0019 본문은 byte-for-byte 동일하게 보존:
- step 1 (invalid_token) / step 2 (expired) / step 3 (duplicate) — 변경 없음
- step 3.5 추가
- 설정 로드 → step 4 (geofence) → step 5 (velocity) → step 6 (INSERT + token consume) → step 7 (mission) → step 8 (응답) — 변경 없음

`v_existing_id BIGINT` 변수는 0019 에서 step 3 (duplicate) 용으로 이미 선언되어 있어 재활용. 새 변수 도입 없음.

### §5-2 응답 유니온 + status 매핑

**`api.ts`**:
```ts
export type CaptureRejectionReason =
  | 'outside_geofence'
  | 'velocity_anomaly'
  | 'invalid_token'
  | 'duplicate'
  | 'already_captured'  // 신규 — Fix 01 (F2)
  | 'expired'
```

`isCaptureRejection` 가드는 `'reason' in resp` 만 사용 → 변경 없음. 자동 매칭.

**`capture.ts`**:
```ts
case 'duplicate':
case 'already_captured':
  return 409
```

응답 shape:
```
409 { ok:false, reason:'already_captured', capture_id:<기존 capture_id> }
```

### §5-3 PlayPage 분기 — 토스트 + 로컬 captured 처리

**`CAPTURE_REJECT_TOAST` 에 추가**:
```ts
already_captured: '이미 도감에 있어요',
```

**`rejectionDetail` switch fallthrough**:
```ts
case 'duplicate':
case 'already_captured':
  return `capture #${resp.capture_id ?? '?'}`
```

**`handleCanvasPointerDown` 분기 — duplicate 와 동일 로컬 처리**:
```ts
if (resp.reason === 'duplicate' || resp.reason === 'already_captured') {
  sceneRef.current?.setCreatureVisible(current.instanceId, false)
  setActiveSpawn({ ...current, captured: true, visible: false })
  scheduler.markCaptured()
}
```

→ 재탭 차단 + 활성 스폰 즉시 정리 + 시간 트리거 리셋. 사용자가 같은 캐릭터를 다시 탭해도 캡처 in-flight 가드 + 로컬 captured 플래그로 추가 호출 방지.

`scheduler.noteRejection('already_captured', detail)` 는 분기 위쪽에서 모든 reason 에 공통 호출 — DevPanel `Server reject:` 행에 자동 표시.

### §5-4 useSpawnScheduler — 자동 흡수

```ts
export type ServerRejectionReason =
  | SpawnResponseServerRejection['reason']
  | CaptureRejectionReason   // ← 여기서 already_captured 자동 포함
```

훅 파일 직접 변경 없음. 타입 체크 + DevPanel 표시 양쪽 자동 propagation.

---

## §6 금지 사항 준수 표 (PHASE_4_FIX01_PROMPT.md §2)

| 항목 | 상태 |
|---|---|
| 0019 의 다른 검증 분기 (invalid_token / expired / duplicate / outside_geofence / velocity_anomaly) 동작 변경 | ✅ 무변경 (step 3.5 만 신규 삽입, 다른 step 본문 동일) |
| spawn API 측 (phone, creature_id) 체크 추가 | ✅ 미진행 (scope creep 회피, 본 §메모 참조) |
| `ar_capture_attempts` 로깅 enum 확장 (M-7) | ✅ 미진행 (Phase 6+) |
| ArScene / CreatureLoader / GyroController / CameraStream | ✅ 무변경 |
| `useSpawnScheduler` "활성 currentSpawn TTL 중복방지" 로직 | ✅ 무변경 |
| 어드민 UI 변경 | ✅ 무변경 |
| `ar_creatures` / `ar_festival_settings` 스키마 | ✅ 무변경 |
| `generate_ar_reward_code()` 시그니처·동작 | ✅ 무변경 (재사용만) |
| Phase 5 작업 (ArScene dispose / 2D placeholder / 효과 시스템) | ✅ 본 트랙 외, 미진행 |

---

## §7 자체 검증 결과 (§5-2 ~ §5-3)

### §5-2 로컬 빌드 — ✅ PASS

```
$ npx tsc -b
$ echo $?
0

$ npx vite build
... (12 chunks 빌드)
✓ built in 747ms
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification ...
$ echo $?
0
```

청크 크기 경고는 PlayPage / xlsx / index 청크 — 본 fix 와 무관 (기존 베이스라인 유지). 신규 추가/제거 청크 없음.

### §5-3 curl C7 자체 검증 — ✅ PASS (2026-04-29)

**검증 환경**:
- Production alias `https://gnfesta.vercel.app` + bypass header 동일
- 운영 settings: `capture_token_ttl_sec=60` / `velocity_cap_kmh=50` / cooldown=0
- 사용 phone: `01000000000` (saturated phone — 절차 변경 사유 §5-3.1 참조)
- 사용 좌표: `37.7985, 128.8990` (geofence 안)

#### §5-3.1 절차 변경 (raw 첨부)

당초 계획은 `01077778888` (fresh phone) 으로 capture A → 같은 등급 token B 재발급 → already_captured 검증. 실제 시도 시 spawn 의 **기존 유효 token 재사용 로직** (`api/ar/spawn.ts` step 3) 이 step A 후 미소비 token 을 끝없이 재사용 → 새 rarity 샘플링 트리거 안 됨. 동일 creature_id 재발급 15회 시도에도 실패.

(spawn API 의 token reuse 가 step A 의 미소비 token 을 잡고 있었기 때문. consume 이후에는 신규 발급되지만 다음 rarity 샘플링이 같은 creature 재발급 보장 못 함.)

→ 전략 변경: **이미 모든 등급을 포획한 phone** 을 사용해 어떤 spawn 이든 already_captured 매칭. 작업 phone `01000000000` 은 본 세션 중 초기에 rare 포획됨 (capture_id 31 직전 capture, 04-28 03:30 시점). 추가로 §5-3 의 step 1 capture (`capture_id=32, grade=common`) 로 common 포획 → common+rare 두 등급 saturated 상태에서 retry. retry try 1 spawn 이 common 반환 → 이미 포획된 등급 → already_captured 매칭.

#### §5-3.2 결과 표

| 단계 | 동작 | HTTP status | response body | 통과 |
|---|---|---|---|---|
| step 1 (warmup) | spawn (`phone:01000000000`, 정상 좌표) → token A → capture A | 200 | `{"ok":true,"capture_id":32,"grade":"common","new_rewards":[{"code":"AR-K43J42","grade":"common"}]}` | ✅ (warmup, 검증 대상 아님 — phone 의 common 이 아직 미포획이었기 때문에 200) |
| step A (재시도) | spawn (saturated 후) → token B (`creature_id=4be8...` common, `reused:false`) | 200 | `{"ok":true,"spawn":{...,"creature_rarity":"common","reused":false}}` | ✅ |
| **step B** | token B 로 capture (정상 좌표, `phone:01000000000`) → 기대 already_captured | 409 (logical — `statusForReason('already_captured') = 409`) | `{"ok":false,"reason":"already_captured","capture_id":32}` | **✅** |
| **step C** | 동일 token B 재탭 (정상 좌표) → 기대 duplicate (step 3.5 가 token consumed_at 마킹 → step 3 흡수) | 409 (logical) | `{"ok":false,"reason":"duplicate","capture_id":32}` | **✅** |

**핵심 검증 통과**:
- step B `reason:'already_captured'` + 기존 `capture_id:32` 동봉 → **step 3.5 (사전 UNIQUE 체크) 분기 정상 작동** ✅
- step C `reason:'duplicate'` + 동일 `capture_id:32` 동봉 → **step 3.5 가 토큰을 consumed_at 마킹 → step 3 duplicate 분기로 흡수** (응답 일관성 유지 의도 검증) ✅

#### §5-3.3 운영 데이터 잔재 (정리 후보)

본 자체 검증 과정에서 운영 DB 에 다음 변경 발생:
- `ar_captures(phone='01000000000', creature_id=common Box, capture_id=32)` 추가 — 의도된 warmup
- `ar_captures(phone='01077778888', creature_id=rare CesiumMan, capture_id=31)` 추가 — 폐기된 절차 잔재
- `ar_rewards(phone='01000000000', code='AR-K43J42', grade='common', triggered_by='mission:common')` — warmup 부수
- `ar_rewards(phone='01077778888', code='AR-HKAJ7U', grade='rare', triggered_by='mission:rare')` — 폐기된 절차 잔재
- `ar_spawn_tokens` 다수 (warmup + step A token 등 — 시간이 지나면 만료, 클린업 안 해도 운영 영향 없음)

§5-4 E5/E6 재검증 선행 SQL `DELETE FROM ar_rewards/ar_captures WHERE phone = '01000000000'` 가 위 데이터 일부 정리. `01077778888` 은 별도 정리 필요 시 사용자 판단:

```sql
-- (선택) 자체 검증 잔재 정리
DELETE FROM ar_rewards WHERE phone = '01077778888';
DELETE FROM ar_captures WHERE phone = '01077778888';
```

---

## §8 사용자 점검 결과 (§5-1, §5-4)

### §5-1 마이그 0020 원격 적용 — ✅ PASS (2026-04-29, 사용자 회신 raw 검증)

사용자가 `pg_get_functiondef(capture_creature)` 회신. 본문 검증 결과:

| 검증 항목 | 결과 |
|---|---|
| `step 3.5` 주석 + `(phone, creature_id) 사전 UNIQUE 체크` 코멘트 포함 | ✅ |
| `SELECT id INTO v_existing_id FROM ar_captures WHERE phone = p_phone AND creature_id = v_token_row.creature_id LIMIT 1` 본문 존재 | ✅ |
| `IF FOUND THEN UPDATE ar_spawn_tokens SET consumed_at = now() ... RETURN ... reason='already_captured', capture_id=v_existing_id` | ✅ |
| 위치: step 3 (duplicate) 직후, 설정 로드 + step 4 (geofence) 진입 전 | ✅ |
| 기존 검증 분기 (invalid_token / expired / duplicate / outside_geofence / velocity_anomaly) 본문 byte-for-byte 동일 보존 | ✅ |
| INSERT + token consume + mission 발급 + 응답 본문 byte-for-byte 동일 | ✅ |

### §5-4 E5/E6 재검증 — ✅ PASS (2026-04-29, 사용자 회신)

| 케이스 | 결과 | 비고 |
|---|---|---|
| **E5** (already_captured 토스트) | ✅ PASS | 토스트 "이미 도감에 있어요" + DevPanel `Server reject: already_captured` 정상 표시 |
| **E6** (클라 in-flight 가드) | ✅ PASS | 빠른 재탭 시 `/api/ar/capture` 1회만 발생, 두 번째 탭 클라 가드로 차단 |

**핵심 검증 통과**:
- step 3.5 사전 UNIQUE 체크 → 클라 토스트 분기 (`CAPTURE_REJECT_TOAST.already_captured`) → DevPanel `noteRejection` 까지 end-to-end 일관 ✅
- `handleCanvasPointerDown` in-flight 가드 (`captureInflightRef`) → 재탭 차단 ✅

**E2E 종료 후 액션** (사용자 진행):
- mission_count 운영값 원복 (ⓓ §2-4 시점 백업값으로)
- (선택) `01077778888` ar_captures/ar_rewards 잔재 정리 (§5-3.3 SQL)

---

## §9 메모

### M-7 (`ar_capture_attempts` 로깅) — 변동 없음

본 fix 도 attempts 테이블 미작성. `result` CHECK enum 이 기존 6종 (success / invalid_token / expired / duplicate / phone_rate_limit / zone_rate_limit) 으로 신규 reason (`already_captured` / `outside_geofence` / `velocity_anomaly`) 과 미일치. 스키마 불변 원칙 유지 → Phase 6+ 어드민 감사 범위에서 enum 확장 + 로깅 재도입 검토.

### F2 처리 후 spawn API 측 사전 체크 — Phase 5+ 검토 사안

본 fix 는 capture 측에서만 처리. spawn API 가 (phone, creature_id) 사전 체크 후 다른 creature 로 우회 발급하는 변경은 **본 트랙 외 (scope creep)**. 등급별 1종 → 다종 분포로 확장되면 자연 해소 (같은 등급 내 새 creature 가 자동 선택됨). 등급별 다종 도입 시점에 재평가.

### Phase 5 와 충돌 없음

본 fix 는 server RPC + 클라 분기 추가만. Phase 5 (ArScene/CreatureLoader/CollectionPage 재구현) 와 파일 충돌 표면 없음. 단, 발행 순서는 fix 01 → Phase 5 가 깔끔 (E5/E6 재검증 의존성).

### Phase 5 운영 가드 (변동 없음)

ArScene · CreatureLoader · GyroController · CameraStream 불가침 / DEBUG 플래그 Phase 7 까지 유지 / 어드민 인증 강화 Phase 6+ — 전부 그대로.

---

## §10 다음 세션 진입 체크리스트

1. ✅ **사용자 §5-1**: 마이그 0020 원격 적용 + 검증 SELECT raw 회신 (완료)
2. ✅ **Claude Code §5-3**: §5-1 회신 직후 curl C7 자체 수행 + §7 §5-3 결과 표 채움 (완료)
3. ✅ **사용자 §5-4**: §5-3 PASS 후 E5/E6 재검증 회신 (완료)
4. ✅ **Claude Code 마무리**: §8 §5-4 결과 채움 + 빌드로그 갱신 커밋 + push (본 커밋)
5. ⏸ **종합 보고**: ⓓ 4영역 종합 PASS 보고 → Phase 5 발행 트리거 (별도 챗 세션 턴)

### 검증용 상수 (phase3 / 4 에서 승계)

- Production alias: `https://gnfesta.vercel.app`
- Vercel Protection Bypass header: `x-vercel-protection-bypass: ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh`
- geofence 안 샘플 좌표: `37.7985, 128.8990`
- geofence 밖 샘플 좌표: `37.7600, 128.9000`
- C7 신규 phone: `01077778888` (사전 ar_captures count=0 확인 필요)
- ⓓ §2-2 잔여 원복 SQL: `UPDATE ar_festival_settings SET velocity_cap_kmh = 50 WHERE active = true;`

### 다음 세션 시작 시 읽을 것

- 본 파일 (`phase4_fix01_build.md` v0.1)
- `PHASE_4_FIX01_PROMPT.md` v1.0
- `checkpoint_d_result.md` (§5 F2 컨텍스트)

---

*Phase 4 Fix 01 빌드 로그 v0.3 — capture_creature already_captured 분기 추가, 코드 + 마이그 커밋 67c4bdf, 빌드 + §5-1 마이그 적용 + §5-3 curl C7 + §5-4 E5/E6 재검증 모두 PASS, Phase 4 Fix 01 종결 — 2026-04-29*
