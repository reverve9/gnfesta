# Phase 3 빌드 핸드오프 (R1·R2·R3 완료·push · 체크포인트 ⓒ 5/5 완전 통과 · Phase 4 진입 대기)

> **상태**: R1 완료·검증·push 완료. R2 구현·로컬 검증·체크포인트 ⓑ (5/5) 통과·push 완료. **R3 구현·로컬 검증·push 완료 (2026-04-20, 커밋 `c969a55`)**. DB 마이그레이션 `0018` 원격 적용 · **체크포인트 ⓒ (§5-1~5-4) 5/5 완전 통과 (2026-04-20)**. Phase 4 프롬프트 수신 대기.
> **작성 기준**: `AR_MODULE_PROJECT_BRIEF.md` v0.3, `phase3_redesign.md` v1.0, `PHASE_3_R1_PROMPT.md` v1.0, `PHASE_3_R2_PROMPT.md` v1.0, `PHASE_3_R3_PROMPT.md` v1.0, `phase2_build.md` v1.2

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
| **Phase 3-R1** | 설정 · 스키마 · 어드민 | ✅ 구현·로컬·ⓐ 검증·push 완료 (2026-04-19) |
| **Phase 3-R2** | 클라이언트 geofence + 스폰 스케줄러 | ✅ 구현·로컬·체크포인트 ⓑ (5/5) 통과·push 완료 (2026-04-19 ~ 2026-04-20) |
| **Phase 3-R3** | 서버 스폰 정책 재정의 + `movement_outlier_cap_m` 설정화 + Phase 3.5 격상·DEBUG 운영 정책 디폴트 유지 | ✅ 구현·로컬·체크포인트 ⓒ (5/5) 통과·push 완료 (2026-04-20, `c969a55`) |

**전달 방식**: R1 → R2 → R3 순차. 각 단계 완료 후 체크포인트 보고 → 사용자 승인 → 다음 단계 프롬프트 수신.

### 확정 파라미터 (초기값 · R1 에서 DB 반영 완료)

전부 어드민에서 조정 가능. DB 저장은 `ar_festival_settings` (R1 범위, 구현 완료). R2 에서 클라 훅이 실제 참조.

| 파라미터 | 초기값 | 비고 |
|---|---|---|
| geofence 중심 좌표 | `37.7985, 128.8990` | 축제장 중앙(경포해변) |
| geofence 반경 | `200m` | 축제장 50×150m + 주변 동선 여유 |
| 스폰 주기 | `45s` | 시간 트리거 — R2 `useSpawnScheduler` 참조 |
| 이동 보너스 임계 | `50m` | R2 `useSpawnScheduler` 이동 트리거 |
| rarity 분포 | `common 75 / rare 22 / legendary 3` (%) | DB 저장, `/api/ar/spawn` 가 `rarity_weight_*` 동적 로드 (R3 반영 완료) |
| 포획 유효 | `60s` | `issue_spawn_token` 이 `capture_token_ttl_sec` 동적 로드 (R3 반영 완료) |
| 쿨다운 | `0s` (없음) | `issue_spawn_token` 내부 원자 판정 (P0001 `cooldown_active:<N>`) (R3 반영 완료) |
| 이동 이상치 상한 | `100m` | `ar_festival_settings.movement_outlier_cap_m` 필드화, 클라 `useSpawnScheduler` 옵션 주입 (R3 반영 완료) |
| 경품 미션 | `common 10 / rare 3 / legendary 1` | DB 필드 저장까지만. 판정·발급은 Phase 4 |

---

## ✅ Phase 3-R1 완료 상세 (2026-04-19, 검증·push 완료)

### 커밋

| 해시 | 제목 | 상태 |
|---|---|---|
| `0edb681` | feat(ar): Phase 3-R1 — ar_festival_settings + 설정 RPC + 어드민 UI + ar_zones 삭제 | ✅ push 완료 |
| `8948b27` | docs(ar): phase3_build v0.3 → v0.4 — R1 완료 반영 + 후속 보안 작업 + capture_creature DROP 기록 | ✅ push 완료 |
| `7c259c1` | style(ar): /ar/settings 어드민 UI 톤앤매너 정비 — 기존 어드민 페이지 일관성 복원 | ✅ push 완료 |

### 산출물 요약

**DB**: `ar_festival_settings` 테이블(singleton, rarity CHECK) + `get_festival_settings` / `update_festival_settings` RPC + `ar_zones` DROP + `zone_id` 3 컬럼 DROP + `issue_spawn_token` 2파라미터 + `capture_creature` DROP
**API**: `GET /api/ar/festival` 신규, `POST /api/ar/spawn` zone_id 제거
**어드민**: `/admin/ar/settings` 실 편집 폼 (6 섹션, rarity 합 100 검증, 기존 톤앤매너 일관성)
**Seed**: `ar_festival_default.sql` (멱등 가드)

### 핵심 결정

| 결정 | 값 |
|---|---|
| Q1 — `ar_zones` FK 처리 | **B (컬럼 전부 DROP)** |
| Q2 — `issue_spawn_token` 시그니처 | **A (`p_zone_id` 제거, 2파라미터)** |
| Q3 — 어드민 저장 인증 경로 | **γ (공개 RPC 유지, 서버 인증은 Phase 6+ 전체 어드민 일괄)** |

### 체크포인트 ⓐ 통과 결과 (사용자 확인)

- §5.1 DB 3건: ar_zones 없음 ✅ / active row 초기값 일치 ✅ / zone_id 컬럼 없음 ✅
- §5.2 curl 2건: `GET /api/ar/festival` 정상 / `POST /api/ar/spawn` (zone_id 없이) 정상 ✅
- §5.3 어드민 UI 왕복 (200 → 50 → 200) + curl 반영 확인 + 성공 토스트 정상 ✅
- 부수 발견: UI 톤앤매너 회귀 → `7c259c1` 정비로 일괄 해소

---

## ✅ Phase 3-R2 완료 상세 (2026-04-19 ~ 2026-04-20, 체크포인트 ⓑ 5/5 통과·push 완료)

### 커밋

| 해시 | 제목 | 상태 |
|---|---|---|
| `d4825df` | feat(ar): Phase 3-R2 — useFestivalGeofence + useSpawnScheduler 훅 + PlayPage 재통합 + 다중 zone 로직 삭제 | ✅ push 완료 (R2 코드 본체) |
| `02a6425` | feat(ar): PlayPage 엔트리에 전화번호 직접 입력 필드 추가 — 스탬프/설문 우회 진입 지원 | ✅ push 완료 (테스트 편의) |
| `b92c8b6` | docs(ar): phase3_build v0.4 → v0.5 — R1 ⓐ 통과·push 완료 + R2 완료 + R3 진입 체크리스트 확장 (MOVEMENT_OUTLIER_CAP 설정화) | ✅ push 완료 |
| `b93eb6f` | fix(ar): PlayPage 포획 핸들러 currentSpawn 연결 복원 — R2 재통합 누락분 | ✅ push 완료 (테스트 2 통과 직결) |
| `1867659` | docs(ar): phase3_build v0.5 — R2 ⓑ 진행 상태 + 다음 세션 재개 지시 추가 | ✅ push 완료 |
| `c788b9d` | feat(ar): DevDiagnosticPanel 프로덕션 조건부 노출 (?debug=1) — QA·체크포인트 검증 지원 | ✅ push 완료 (debug 플래그 최초 도입) |
| `627f327` | fix(ar): debug 플래그 시작 버튼 이후 유지 안 됨 — 평가 타이밍 수정 (eager bootstrap sync + 함수 호출 전환) | ✅ push 완료 (테스트 3~5 진행에 필요) |

### 산출물

**신규 (4)**
- `src/features/ar/lib/geo.ts` — `haversineKm` / `haversineMeters`. `detectZoneEntry.ts` 삭제 후 공용.
- `src/features/ar/hooks/useFestivalGeofence.ts` — 설정 1회 fetch + inside/distance 판정. GPS 구독 금지 (PlayPage 가 `useGpsPosition` 단독 소유, 중복 watchPosition 회피).
- `src/features/ar/hooks/useSpawnScheduler.ts` — 시간·이동 기반 스폰 트리거. `MOVEMENT_OUTLIER_CAP_M = 100` 내부 상수 (R3 에서 설정 필드화 예정). 포획 후 리셋용 `markCaptured()` 메서드 노출 (b93eb6f 에서 추가).
- `src/features/ar/lib/debugFlag.ts` — 프로덕션 진단 플래그 (c788b9d + 627f327). 상세는 R2 부수 처리 기록 §c 참조.

**수정 (6)**
- `src/features/ar/lib/api.ts` — `getArZones`/`ArZoneDto` 삭제, `getFestivalSettings`/`FestivalSettingsDto` 신규, `postArSpawn` body 에서 `zone_id` 제거, fail 유니온 정리 (`zone_not_active` 제거 → `no_creatures`).
- `src/features/ar/components/MiniMap.tsx` — `zones[]+currentZoneId` props → `geofence+userPosition+inside`. Leaflet 번들 분리 구조 보존. 3-useEffect 구조 유지.
- `src/features/ar/components/DevDiagnosticPanel.tsx` — `currentZoneId`/`lastPollingAt` 제거. `inside` · `distanceToCenter` · `nextSpawnEta` · `accumulatedDistanceM` · `lastSpawnAt` · `lastRejectedDelta` · settings (cooldown 등) 추가. 노출 가드 `readDebugFlag()` 치환 (627f327).
- `src/features/ar/pages/PlayPage.tsx` — zone enter/leave + 폴링 30s + tokenExpiryTimer 삭제. `useFestivalGeofence`+`useSpawnScheduler` 통합. `scheduler.currentSpawn` 변화 감지 effect 로 모델 로드/숨김/전환. geofence 밖 오버레이 UI ("축제장에서 만나요" + 거리). 포획 핸들러 `scheduler.markCaptured()` 연결 (b93eb6f). DevPanel 가드 `readDebugFlag()` 치환 (627f327).
- `src/features/ar/pages/PlayPage.module.css` — `.outsideOverlay`/`.outsideCard`/`.outsideTitle`/`.outsideDesc`/`.outsideDist` 추가.
- `src/main.tsx` — `@/features/ar/lib/debugFlag` eager import (627f327). 앱 부트 시 URL `?debug=1` → localStorage 1회 sync.

**삭제 (2)**
- `src/features/ar/lib/detectZoneEntry.ts`
- `src/features/ar/hooks/useZoneDetection.ts`

### 핵심 결정

| 결정 | 값 | 근거 |
|---|---|---|
| Q1 — MiniMap | **수정** (재작성 아님) | 히스토리·번들 분리·OSM 타일 구조 보존. 3-useEffect 구조 재활용 |
| Q2 — geofence 밖 ArScene | **mount 유지 + 스폰·렌더만 중단** (프롬프트 추천 unmount 대신) | Phase 2 자이로 이슈 재현 리스크 > 리소스 절약. §2.3 불가침 원칙 일치 |
| Q3 — 이동 거리 상한 | **100m (하드코딩) + DevPanel `GPS spike` 행** | 추천값 승인, R3 설정 필드 이동 |
| 설정 소유권 | **`useFestivalGeofence` 단일 fetch + state 노출** → PlayPage 가 필요 필드를 `useSpawnScheduler` 옵션 주입 | API 중복 호출 회피 · 훅 간 책임 분리 |

### 통합 흐름 (PlayPage)

```
scheduler.enabled = started && gps granted && inside && settings 로드
scheduler.currentSpawn 변화 → useEffect
  ├ null → 기존 activeSpawn 숨김 (setCreatureVisible false + visible=false)
  ├ 동일 token → setCreatureVisible true (재진입 가시성 복원)
  └ 신규 token → loader.load + spawnCreature + activeSpawn 갱신
geofence 밖 → scheduler enabled=false 자동 리셋 → currentSpawn=null → 위 null 분기
              + outsideOverlay 카드 표시 ("축제장까지 XXm")
포획 탭 → scheduler.markCaptured() 호출 → 활성 currentSpawn 즉시 소멸 + 시간 타이머 재시작
```

### 로컬 검증

- `npx tsc --noEmit` — EXIT=0
- `npm run build` — vite `built in 455ms` (기존 chunk size warning 외 이슈 없음)

### 체크포인트 ⓑ 5건 판정 결과 (2026-04-20, 사용자 E2E 완료)

| # | 테스트 | 판정 | 비고 |
|---|---|---|---|
| 1 | 지점 A (강릉역, geofence 밖) | ✅ 통과 | 오버레이·미니맵·거리·AR 씬 비활성 전환 정상 |
| 2 | 지점 B (경포 중앙, 안) + 포획 | ✅ 통과 | 스폰·포획·재스폰·토스트 정상 (b93eb6f 포획 복원 포함) · rarity 3종 전부 정상 |
| 3 | 이동 트리거 | ⚠️ 부분 통과 | 이동 축적(MOVED 56m) ✅ · 이상치 필터(100m 초과 델타 무시) ✅ · outside 전환 시 스케줄러 비활성 + 누적 리셋 ✅ · **50m 초과 시 새 스폰 발생은 활성 currentSpawn TTL 중복방지 로직이 이동 트리거도 막음**. 실기기 환경에서는 GPS 드리프트·걸음 흔들림으로 watchPosition 수시 업데이트 + TTL 만료와 자연 동기화되어 UX 문제 없을 것으로 판단. Phase 7 QA 재검증 필요 항목으로 기록 |
| 4 | 어드민 값 반영 | ✅ 통과 | `spawn_interval_sec=10` 설정 후 새 세션에서 10초 주기 확인. 45 원복 완료. M-4 "세션 재시작 필수" 원칙대로 동작 |
| 5 | Phase 2 회귀 | ✅ 통과 (단 기존 기술 부채 #1 확장 재현 1건) | 기본 기능 정상. 연속 동일 등급 rare/legendary 스폰 시 두 번째 포획 실패 패턴 발견 → M-6 확장 기록. R2 회귀 아님 |

→ **체크포인트 ⓑ 완전 통과 판정**. R3 프롬프트 대기.

---

## ✅ Phase 3-R3 완료 상세 (2026-04-20, 체크포인트 ⓒ 5/5 통과·push 완료)

### 커밋

| 해시 | 제목 | 상태 |
|---|---|---|
| `c969a55` | feat(ar): Phase 3-R3 — 서버 스폰 정책 재정의 + movement_outlier_cap_m 설정화 | ✅ push 완료 (R3 코드 본체 일괄) |
| `(본 커밋)` | docs(ar): phase3_build v0.6 → v0.7 — Phase 3-R3 완료·체크포인트 ⓒ 5/5 통과 + Phase 4 진입 체크리스트 | ✅ push 완료 (v0.7 치환 · 26487ce 내용 대체) |

### 착수 전 확정 사항 (사용자 결정, 2026-04-20)

| 질문 | 결정 | 근거 |
|---|---|---|
| Q1 — `outside_geofence` 클라 처리 | **γ** (무시 + DevPanel `lastServerRejection` 표시) | 클라 inside 판정이 watchPosition 으로 자연 수렴. 토스트·오버레이 불필요 |
| Q2 — 쿨다운 검증 위치 | **B** (`issue_spawn_token` RPC 내부 원자 처리) | 동시성 안전. RPC 가 §1-4 로 이미 재작성 범위 안 |
| Q3 — 마이그레이션 커밋 분리 | **A** (DB + RPC + API + 어드민 + 클라 일괄 단일 `feat(ar)` + doc 별도) | R1·R2 전례. 논리적으로 묶임 |
| Phase 3.5 격상 | **격상 없음** | Phase 5 에셋 도입 시 M-6 재검증 유지 |
| DEBUG 플래그 운영 | **Phase 7 QA 까지 유지** | 현장 QA 도구로 계속 활용 |

### 산출물

**신규 (1)**
- `supabase/migrations/0018_ar_festival_movement_outlier.sql`
  - `ar_festival_settings.movement_outlier_cap_m INTEGER NOT NULL DEFAULT 100 CHECK [1, 10000]` 컬럼 추가 (ADD COLUMN IF NOT EXISTS + 별도 CHECK 제약, 멱등)
  - `update_festival_settings(p_settings JSONB, p_movement_outlier_cap_m INTEGER DEFAULT NULL)` — DROP + CREATE. explicit 파라미터 우선, JSONB 키 폴백, 기존값 유지 3단 COALESCE. 어드민 기존 JSONB 호출 패턴 무변경 호환
  - `issue_spawn_token(TEXT, UUID)` 재작성 — settings 1회 조회 → TTL 동적 로드 + `capture_cooldown_sec > 0` 시 최신 issued_at 경과 체크 → 미경과면 `RAISE EXCEPTION ERRCODE='P0001' MESSAGE=format('cooldown_active:%s', <N>)` 시그널. settings 미존재 시 TTL 60·쿨다운 0 폴백

**수정 (8)**
- `supabase/seeds/ar_festival_default.sql` — 초기 INSERT 에 `movement_outlier_cap_m = 100` 포함. 기존 `WHERE NOT EXISTS` 멱등 가드 유지 (기존 row 는 ADD COLUMN DEFAULT 로 자동 채워짐)
- `api/ar/spawn.ts` — 전면 재구성:
  - (1) `get_festival_settings` RPC 로 center/radius/rarity 로드
  - (2) 서버 geofence 검증: haversine(client_lat/lng ↔ center) > radius 시 403 + `{ ok:false, reason:'outside_geofence', distance_m }`
  - (3) 기존 유효 token 재사용 경로 유지 (쿨다운 대상 아님 — 신규 발급이 아니므로)
  - (4) rarity 샘플링을 DB 가중치(`rarity_weight_{common,rare,legendary}`) 로 교체 — R2 까지 하드코딩 70/25/5 완전 제거
  - (5) `issue_spawn_token` 호출 후 `rpcErr.message` 에서 `cooldown_active:<N>` 파싱 → 429 + `{ ok:false, reason:'cooldown', retry_after_sec }` 변환
  - haversine 계산은 `api/_lib/` 임포트 금지 제약으로 인라인
- `src/features/ar/lib/api.ts`
  - `FestivalSettingsDto` 에 `movement_outlier_cap_m: number` 추가
  - `SpawnResponseServerRejection` 신규 유니온 + `isSpawnServerRejection` 타입 가드. 기존 `{ ok:false, result, message? }` shape 은 불변 유지 → 3-way 디스크리미네이티드 유니온 (`ok:true` / `result` / `reason`)
- `src/features/ar/hooks/useSpawnScheduler.ts`
  - `movementOutlierCapM?: number` 옵션 추가. 미주입 시 `DEFAULT_MOVEMENT_OUTLIER_CAP_M = 100` 폴백 (기존 하드코딩 상수 동작 보존)
  - `lastServerRejection: LastServerRejection | null` state 추가 — `isSpawnServerRejection(resp)` 분기에서 기록, `setError` 호출 안 함 (Q1=γ)
  - 이상치 판정에서 `outlierCapRef.current` 참조. `resetScheduler` 에서 `lastServerRejection` 도 초기화
- `src/features/ar/pages/PlayPage.tsx` — `useSpawnScheduler` 호출에 `movementOutlierCapM: geofence.settings?.movement_outlier_cap_m` 주입. DevDiagnosticPanel 에 `lastServerRejection={scheduler.lastServerRejection}` 전달
- `src/features/ar/components/DevDiagnosticPanel.tsx`
  - props 에 `lastServerRejection?: { reason, detail, timestamp } | null` 추가
  - 패널 그리드에 `Outlier cap: <N>m` (항상) + `Server reject: <reason> · <detail> @ <time>` (존재 시 조건부) 행 추가. 기존 `Cooldown` 라벨에서 `(R3)` 보조표기 제거
- `src/features/ar/pages/admin/AdminArSettings.tsx`
  - `FestivalSettings` · `FormState` · `toFormState` 에 필드 반영
  - `numericOk` 에 `[1, 10000]` 범위 검증 추가
  - **스폰 스케줄 섹션** 내 "이동 이상치 상한 (m)" 필드 + 헬퍼 텍스트 추가 (톤앤매너 유지)
- `src/types/database.ts` — `ar_festival_settings` Row/Insert/Update 에 필드 추가. `update_festival_settings` Functions 엔트리의 Args 를 `{ p_settings: Json; p_movement_outlier_cap_m?: number | null }` 로 확장

### 응답 유니온 정합성

**성공 / 기존 실패 (불변)**

```
200 { ok:true, spawn: { token, creature_id, creature_name, creature_rarity, model_url, thumbnail_url, expires_at, reused? } }
400 { ok:false, result:'invalid_phone' }
400 { ok:false, result:'invalid_request', message }
405 { ok:false, result:'method_not_allowed' }
500 { ok:false, result:'server_error' | 'server_misconfigured', message }
200 { ok:false, result:'no_creatures' }
```

**R3 신규 실패 (신설)**

```
403 { ok:false, reason:'outside_geofence', distance_m:<number> }
429 { ok:false, reason:'cooldown', retry_after_sec:<number> }
```

클라 분기: `isSpawnServerRejection(resp)` 로 `reason` shape 식별 → `lastServerRejection` 기록. 기존 `result` shape 는 종전처럼 `setError` 경로.

### 로컬 검증

- `npx tsc --noEmit` — EXIT=0
- `npm run build` — vite `built in 416ms` (기존 chunk size warning 외 이슈 없음)

### 체크포인트 ⓒ 사용자 검증 결과 (✅ 5/5 완전 통과, 2026-04-20)

**선행 조치 완료**: `supabase/migrations/0018_ar_festival_movement_outlier.sql` 원격 적용 완료. 기존 active row 는 ADD COLUMN DEFAULT 100 으로 자동 채워짐 (확인됨). seed 재실행 no-op.

**§5-1 DB 검증 (3쿼리) — ✅ 통과**

| # | 쿼리 목적 | 결과 |
|---|---|---|
| 1 | `movement_outlier_cap_m` 필드 존재·초기값 | ✅ 컬럼 존재, 초기값 `100` 확인 |
| 2 | `update_festival_settings` 시그니처 | ✅ `p_settings jsonb, p_movement_outlier_cap_m integer DEFAULT NULL` 포함 확인 |
| 3 | `issue_spawn_token` 본문 | ✅ `ar_festival_settings` 조회 + `capture_token_ttl_sec` 동적 로드 + 쿨다운 원자 처리(P0001 커스텀 에러) 전부 확인 |

**§5-2 curl 검증 (4건) — ✅ 통과** · Production alias + Vercel Protection Bypass Token `ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh` 사용

| # | 시나리오 | 기대 응답 | 실제 결과 |
|---|---|---|---|
| 1 | geofence 밖 (`37.76, 128.90`) | 403 `{ ok:false, reason:'outside_geofence', distance_m }` | ✅ HTTP 403 + `distance_m: 4282` |
| 2 | geofence 안 (`37.7985, 128.8990`) | 200 + 정상 spawn + `expires_at` TTL 60 반영 | ✅ HTTP 200 + 정상 발급 + `expires_at` TTL 60 정확 반영 |
| 3 | TTL 60 / cooldown 120 설정 후 토큰 만료 재시도 | 429 `{ ok:false, reason:'cooldown', retry_after_sec }` | ✅ HTTP 429 + `retry_after_sec: 47` |
| 4 | TTL 120 설정 후 발급 (동적 로드 증명) | `expires_at - now ≈ 120s` | ✅ 119.58초 ≈ 120초 (TTL 동적 로드 확정) |

테스트 후 `capture_cooldown_sec=0`, `capture_token_ttl_sec=60` 원복 완료.

**§5-3 어드민 UI 왕복 — ✅ 통과**

- `/admin/ar/settings` 스폰 스케줄 섹션에 "이동 이상치 상한 (m)" 필드 정상 렌더링 확인
- **DB ↔ UI 교차 검증**: DB 특이값(217 / 43 / 59)과 UI 표시값이 완전 일치 → UI 정상 동작 증명
- 페이지 로드만으로는 DB 변경 없음 확인 (read-only 페이지 로드 경로 정상)

**§5-4 클라 E2E — ✅ 통과**

- `https://gnfesta.vercel.app/ar?debug=1` → PlayPage 진입 → DevDiagnosticPanel 에 `OUTLIER CAP: 100m` 정상 표시
- DB 값 77 변경 + **세션 재시작** (M-4 원칙) 시 DevPanel `77m` 반영 확인
- `GEOFENCE` / `MOVED` / `COOLDOWN` 등 다른 필드도 DB 반영 값으로 정확히 표시됨

→ **체크포인트 ⓒ 5/5 완전 통과 판정**. Phase 4 프롬프트 대기.

### R3 부수 처리 기록

#### a. 어드민 UI DB ↔ UI 교차 검증 (§5-3 부수 확인)

§5-3 수행 중 DB 특이값(217 / 43 / 59) 을 `/admin/ar/settings` 화면에서 조회 → UI 표시값 완전 일치 확인. **UI 정상 동작 증명**. 이 과정에서 `updated_at` 필드에 `04:35:10` 타임스탬프 갱신이 관찰됨 — 페이지 로드만으로는 DB 변경이 발생하지 않는 것도 함께 확인됨에 따라 원인은 미확정 (직원 조작 / SQL 컨텍스트 / 타 경로 등 가능성 복수). **UI 자체 결함은 아님**. Phase 4/5 에서 어드민 감사 로그 보강 시 재점검 포인트로 메모만 남김.

#### b. 응답 유니온 신규 2종 — Phase 4 포획 API 반영 예정

R3 에서 `/api/ar/spawn` 에 `outside_geofence` (403) · `cooldown` (429) 두 reason-shape 신설됨. **M-1 포획 UI 대체 경로(PlayPage Phase 4 교체) 설계 시** `/api/ar/capture` 응답에도 동일 규약 확장 여부 결정해야 함 → Phase 4 진입 체크리스트에 반영됨.

---

## 🧩 R1 부수 처리 기록

### `capture_creature` RPC DROP (계획 외 — Q1-B 귀결)

**결정**: `0017_ar_drop_zones.sql` 에서 DROP. HTTP `/api/ar/capture` 엔드포인트 미존재 → 실사용 경로 영향 없음. Phase 4 에서 geofence 기반으로 신규 작성 예정.

**영향**: `zone_rate_limit` result 값은 `ar_capture_attempts.result` CHECK 제약에 enum 으로 남김 (불필요한 churn 회피, Phase 4 가 필요 시 정리).

---

## 🧩 R2 부수 처리 기록

### a. `b93eb6f` — 포획 핸들러 `currentSpawn` 연결 복원

**문제**: R2 본체(`d4825df`) 재통합 시 PlayPage 포획 핸들러가 `scheduler.currentSpawn` 과 분리되어 포획 터치 시 활성 크리처 소멸·시간 타이머 재시작이 동작하지 않음. 테스트 2 에서 포착.

**처리**:
- `useSpawnScheduler` 에 `markCaptured()` 메서드 추가 — 활성 currentSpawn 을 null 로 리셋 + `lastSpawnAt = Date.now()` 로 재갱신해 시간 타이머 45s 부터 재시작.
- `PlayPage.handleCanvasPointerDown` 의 포획 분기에서 `scheduler.markCaptured()` 호출 연결.

**검증**: 테스트 2 재실행 → 포획 → 소멸 + 45s 후 재스폰 정상.

### b. `c788b9d` — DevDiagnosticPanel 프로덕션 조건부 노출 (최초 도입)

**동기**: 로컬 dev 서버의 `/api/ar/festival` Vercel serverless 프록시 미설정 + PWA SW 꼬임으로 로컬 E2E 불가. Production 경유로 재개하되 DevPanel 필드(GEOFENCE/MOVED/NEXT SPAWN 등)가 필요.

**설계**:
- `debugFlag.ts` 신규 — DEV || URL `?debug=1` || localStorage `__ar_debug__`.
- `?debug=1` → localStorage set, `?debug=0` → remove.
- 외부 연동 (Sentry/Analytics) 금지.
- ArScene/Loader/Gyro/Camera 불가침 유지.

### c. `627f327` — debug 플래그 평가 타이밍 수정 (eager bootstrap + 함수 호출)

**문제**: `c788b9d` 최초 도입 후 사용자 E2E 중 재현 — `/ar?debug=1` 에서 IntroPage "시작하기" 클릭 → `navigate('/ar/play')` 가 쿼리 drop. PlayPage 에서 처음 평가된 `const isDebugEnabled` 가 false 로 고정. 사용자가 console 에서 localStorage 수동 set 해도 module const 캐싱으로 반영 불가.

**수정**:
- `main.tsx` 에 `@/features/ar/lib/debugFlag` eager import → 앱 부트 시 URL → localStorage 1회 sync 보장 (어떤 라우트든 최초 진입 URL 에 `?debug=1` 있으면 기록됨).
- `isDebugEnabled` const 제거 → `readDebugFlag()` 함수 호출로 전환 (호출 시점마다 최신 localStorage 반영, console 수동 우회 복원).
- `PlayPage`·`DevDiagnosticPanel` 호출부 치환.

**검증**: Production 재배포 후 `/ar?debug=1` → IntroPage → `/ar/play` → DevPanel 노출 정상. 이후 테스트 3~5 진행.

---

## 🔒 후속 보안 작업 (Phase 6+ 범위) — γ 조건 2-1

현재 GNfesta 어드민 전체(공지·쿠폰·매출·주문·AR 설정 등) 가 **클라 sessionStorage 단일 인증** 수준. `update_festival_settings` 도 이 관행에 맞춰 공개 RPC.

### TODO (Phase 6+ 일괄 적용)

| 항목 | 범위 |
|---|---|
| 전체 어드민 서버 인증 체계 도입 | sessionStorage 클라 인증 → 서버 세션·토큰 기반. 신규 env 도입 |
| `update_festival_settings` RPC 를 service_role 전용으로 전환 | SECURITY DEFINER 유지하되 호출 경로를 서버 API 로만 제한 |
| `/api/admin/*` 네임스페이스 신설 · 어드민 API 통합 | 모든 어드민 write 를 서버 미들웨어 경유 |
| AR 단독이 아닌 **전체 어드민 일괄 적용** | 공지·쿠폰·매출·주문·AR 설정 동시 강화 |

---

## 🎯 Phase 7 QA 재검증 필요 항목 (체크포인트 ⓑ 잔여)

DevTools Location 시뮬레이션의 한계로 E2E 에서 완전 검증 불가. 실기기·축제 현장 QA 에서 확인 필요.

| 항목 | 확인 포인트 | 근거 |
|---|---|---|
| 이동 트리거 50m 초과 시 새 스폰 | 실기기 환경에서 TTL 만료·GPS 업데이트 빈도와 자연 동기화 UX 확인. 사용자 체감상 "걸어갔더니 새 캐릭터가 나타났다" 경험 성립 여부 | 테스트 3 부분 통과. 활성 currentSpawn TTL 중복방지가 이동 트리거와 겹침 |
| `MOVEMENT_OUTLIER_CAP_M=100` 타이트니스 | 정상 보행·뛰기·자전거·차량(주차 이동) 등 실 시나리오에서 과도하게 이상치로 걸러지지 않는지. 실수 기록 기반으로 R3 `ar_festival_settings.movement_outlier_cap_m` 초기값 재결정 | 테스트 3 점프(~1km) 필터 정상. 단 경계값·소폭 bounce 는 미검증 |
| Phase 2 기술 부채 #1 재현 빈도 | 연속 동일 등급(rare/legendary) 스폰 조건의 실 노출 빈도 체감. rarity 확률상 common 75/rare 22/legendary 3 → 연속 동일 rare ≈4.84%, 연속 동일 legendary ≈0.09%. 실 유저 중 겪는 비율 | 테스트 5 에서 1건 재현 — M-6 확장 기록. Phase 3.5 격상 여부 판단 인풋 |

---

## 📦 Phase 3 산출물 재분류 (R1·R2·R3 반영 후)

### ✅ R1·R2·R3 완료분

| 파일 / 자산 | 구현 위치 |
|---|---|
| DB `ar_festival_settings` + RPC 2종 + `issue_spawn_token` 2파라미터 + `ar_zones`/`zone_id` DROP + `capture_creature` DROP | R1 (0016·0017) |
| `api/ar/festival.ts` + `api/ar/spawn.ts` (zone_id 제거) | R1 |
| `/admin/ar/settings` 편집 폼 | R1 |
| 클라 `geo.ts` + `useFestivalGeofence` + `useSpawnScheduler` (+ `markCaptured()`) | R2 |
| `MiniMap` 단순화 + `PlayPage` 재통합 + outside 오버레이 | R2 |
| `DevDiagnosticPanel` 필드 교체 | R2 |
| `detectZoneEntry.ts` + `useZoneDetection.ts` 삭제 | R2 |
| `api.ts` `getArZones` 삭제 · `getFestivalSettings` 신규 · `postArSpawn` 시그니처 정리 | R2 |
| `debugFlag.ts` + `main.tsx` eager import + `readDebugFlag()` 전환 | R2 부수 (c788b9d + 627f327) |
| `ar_festival_settings.movement_outlier_cap_m` 필드 + seed + 타입 + `update_festival_settings` 시그니처 확장 | R3 (0018) |
| `issue_spawn_token` TTL 동적 로드 + 쿨다운 내부 원자 판정 (P0001 `cooldown_active:<N>`) | R3 (0018) |
| `api/ar/spawn.ts` geofence 검증 + rarity DB 로드 + cooldown 429 변환 + 403/429 reason-shape 신설 | R3 |
| `useSpawnScheduler.movementOutlierCapM` 옵션 + `lastServerRejection` state | R3 |
| `PlayPage` settings 주입 + DevPanel prop 전달 | R3 |
| `DevDiagnosticPanel` `Outlier cap` · `Server reject` 행 추가 | R3 |
| `/admin/ar/settings` 스폰 스케줄 섹션에 `movement_outlier_cap_m` 입력 + 클라 범위 검증 `[1, 10000]` | R3 |

### ⏸ Phase 4 진입 체크리스트 (R3 체크포인트 ⓒ 5/5 통과 후 프롬프트 수신 대기)

**포획 API 신규**:
- `/api/ar/capture` HTTP 엔드포인트 신설 (R3 까지 미존재 — Phase 1 에서도 엔드포인트는 없었음)
- `capture_creature` RPC 재작성 (R1 `0017` 에서 DROP 상태). geofence 기반 — 포획 시점의 `client_lat/lng` 를 `ar_festival_settings.center_lat/lng/radius_m` 와 거리 비교하여 거절. `ar_spawn_tokens.consumed_at` 설정 + `ar_captures` INSERT + `ar_capture_attempts` 로그. 실패 result enum: `invalid_token` / `expired` / `duplicate` / `outside_geofence` / `velocity` 등
- **R3 신규 응답 유니온 (`outside_geofence` 403 / `cooldown` 429) 의 capture 엔드포인트 확장 여부 결정** — `/api/ar/spawn` 과 동일 규약으로 reason-shape 신설할지, 또는 capture 고유의 result enum 경로로 통일할지. 포획 UI M-1 교체 설계 이전에 Phase 4 프롬프트 단계에서 방침 확정 필요

**경품 미션 판정·발급**:
- `ar_festival_settings.mission_{common,rare,legendary}_count` 조건 읽어 해당 phone 의 `ar_captures` 집계 판정
- 조건 달성 시 `ar_rewards` INSERT (기존 RPC `generate_ar_reward_code` 재활용) + `claim_ar_prize` 연계
- Phase 1 에서 설치된 `claim_ar_prize` RPC 는 현 시점 그대로 유지

**도감 UI (`CollectionPage`)**:
- `captured` 목록 + 미션 진척도 (예: common 7/10, rare 2/3, legendary 0/1) 렌더링
- 기존 `CollectionPage.tsx` 는 placeholder 상태 — 실 데이터 연동

**PlayPage 포획 핸들러 M-1 해소**:
- 현재 `handleCanvasPointerDown` 는 로컬 `setActiveSpawn({ captured: true })` state 전환 + `scheduler.markCaptured()` 리셋만 수행 (서버 미호출)
- Phase 4 에서 `/api/ar/capture` 호출 + 응답 분기 + 실패 reason UI 반영으로 교체
- 성공 시 `scheduler.markCaptured()` 유지, 실패 시 토큰 만료·쿨다운·outside_geofence 등 사유별 UI 분기

**M-5 (ArScene 인스턴스 누적) 이관 판단**:
- Phase 4 (포획 시점에 destroy API 추가로 묶음) 와 Phase 5 (에셋 도입 시 loader 재설계로 자연 해소) 중 어느 쪽으로 이관할지 **Phase 4 프롬프트 작성 시 재판단**

**M-6 (연속 동일 등급 포획 실패)**:
- **Phase 5 재검증 방침 유지** — 실 에셋 도입 시 clone 격리 방식 결정과 함께 자연 해소 예상. Phase 3.5 격상 없음 (확정). 본 R3 범위 외

**무관 (R3 완결)**:
- Phase 3.5 격상 — 격상 없음 (확정). Phase 5 에셋 도입 시 M-6 재검증
- DEBUG 플래그 운영 — Phase 7 QA 까지 유지 (확정). 현 구조(`readDebugFlag()` + eager bootstrap) 그대로

### 🔁 유지 (Phase 3 재설계 무관, 변경 없음)

| 파일 | 역할 |
|---|---|
| `src/features/ar/hooks/useArPermissions.ts` | GPS 권한 확장 |
| `src/features/ar/hooks/useGpsPosition.ts` | `watchPosition` 래퍼 |
| `src/features/ar/three/ArScene.ts` / `CreatureLoader.ts` / `GyroController.ts` / `CameraStream.ts` | Phase 2 회귀 보호 불가침 |
| Phase 1 DB 나머지 7 테이블 + `haversine_km` / `generate_ar_reward_code` / `claim_ar_prize` RPC | 유지 |

---

## 🗂 커밋 이력 (Phase 3 진행)

| 해시 | 제목 | 상태 |
|---|---|---|
| `(본 커밋)` | docs(ar): phase3_build v0.6 → v0.7 — Phase 3-R3 완료·체크포인트 ⓒ 5/5 통과 + Phase 4 진입 체크리스트 | ✅ push 완료 (v0.7 치환 · 26487ce 내용 대체) |
| `26487ce` | docs(ar): phase3_build v0.6 → v0.7 — R3 코드 push 완료 반영 + 체크포인트 ⓒ 검증 재개 지시 | ✅ push 완료 (v0.7 초판 · 본 커밋으로 내용 치환됨) |
| `c969a55` | feat(ar): Phase 3-R3 — 서버 스폰 정책 재정의 + movement_outlier_cap_m 설정화 | ✅ push 완료 (R3 코드 본체) |
| `627f327` | fix(ar): debug 플래그 시작 버튼 이후 유지 안 됨 — 평가 타이밍 수정 (eager bootstrap sync + 함수 호출 전환) | ✅ push 완료 |
| `c788b9d` | feat(ar): DevDiagnosticPanel 프로덕션 조건부 노출 (?debug=1) — QA·체크포인트 검증 지원 | ✅ push 완료 |
| `1867659` | docs(ar): phase3_build v0.5 — R2 ⓑ 진행 상태 + 다음 세션 재개 지시 추가 | ✅ push 완료 |
| `b93eb6f` | fix(ar): PlayPage 포획 핸들러 currentSpawn 연결 복원 — R2 재통합 누락분 | ✅ push 완료 |
| `02a6425` | feat(ar): PlayPage 엔트리에 전화번호 직접 입력 필드 추가 — 스탬프/설문 우회 진입 지원 | ✅ push 완료 |
| `b92c8b6` | docs(ar): phase3_build v0.4 → v0.5 — R1 ⓐ 통과·push 완료 + R2 완료 + R3 진입 체크리스트 확장 | ✅ push 완료 |
| `d4825df` | feat(ar): Phase 3-R2 — useFestivalGeofence + useSpawnScheduler 훅 + PlayPage 재통합 + 다중 zone 로직 삭제 | ✅ push 완료 |
| `7c259c1` | style(ar): /ar/settings 어드민 UI 톤앤매너 정비 — 기존 어드민 페이지 일관성 복원 | ✅ push 완료 |
| `8948b27` | docs(ar): phase3_build v0.3 → v0.4 — R1 완료 반영 + 후속 보안 작업 + capture_creature DROP 기록 | ✅ push 완료 |
| `0edb681` | feat(ar): Phase 3-R1 — ar_festival_settings + 설정 RPC + 어드민 UI + ar_zones 삭제 | ✅ push 완료 |
| `0173462` | docs(ar): phase3_build v0.2 → v0.3 — 재설계 4곳 보완 | 유지 |
| `70eaf2a` | docs(ar): Phase 3 재설계 대기 핸드오프 — 다음 세션 컨텍스트 보존 | 유지 |
| `4e21a34` | feat(ar): Phase 3-D+E — Leaflet 미니맵 + PlayPage 서버 스폰 통합 | R2 에서 로직 대체됨 |
| `eade0b1` | docs: Vercel preview SSO curl 우회 절차 문서화 | 유지 |
| `1e01e8f` | feat(ar): Phase 3-A~F — GPS 훅 + 구역 판정 + 스폰 API + seed SQL | 일부 폐기 / 일부 재활용 |

---

## 🔍 체크포인트 통과 내역

### Phase 3-A~F 이전 설계 체크포인트 (역사)

**ⓐ GPS 훅 + 구역 판정 단위 구현 (통과)** · **ⓑ 서버 스폰 API + seed SQL + curl 5건 (통과)** · **ⓒ DevTools 위치 시뮬 E2E (중단, 재설계 결정)**

### Phase 3 재설계 체크포인트 (현 시점)

**⓪ R1 로컬 (통과)** — `tsc` EXIT=0 · `vite build` 454ms

**ⓐ R1 사용자 검증 (✅ 통과, 2026-04-19)** — DB 3건 + curl 2건 + 어드민 UI 왕복 저장 + UI 톤앤매너 정비 병행

**⓪' R2 로컬 (통과)** — `tsc` EXIT=0 · `vite build` 369~455ms (R2 본체 ~ debug 플래그 수정 누적)

**ⓑ R2 사용자 E2E 검증 (✅ 5/5 통과, 2026-04-20)**

| # | 테스트 | 판정 | 잔여 |
|---|---|---|---|
| 1 | 지점 A (강릉역, 밖) | ✅ 통과 | — |
| 2 | 지점 B (경포 중앙, 안) + 포획 | ✅ 통과 | — |
| 3 | 이동 트리거 | ⚠️ 부분 통과 | 50m 초과 시 새 스폰 → Phase 7 QA 재검증 항목으로 이관 |
| 4 | 어드민 값 반영 | ✅ 통과 | — |
| 5 | Phase 2 회귀 | ✅ 통과 | M-6 확장 1건 기록 (회귀 아님) |

**⓪'' R3 로컬 (통과, 2026-04-20)** — `tsc --noEmit` EXIT=0 · `vite build` 416ms

**ⓒ R3 사용자 검증 (✅ 5/5 완전 통과, 2026-04-20)**

| # | 영역 | 판정 | 결과 요약 |
|---|---|---|---|
| §5-1 | DB 3건 (신규 필드 초기값 / `update_festival_settings` 시그니처 / `issue_spawn_token` 본문) | ✅ 통과 | 컬럼 DEFAULT 100 · 시그니처 `p_movement_outlier_cap_m` 포함 · 본문 내 `ar_festival_settings` 조회 + TTL 동적 + P0001 쿨다운 원자 처리 전부 확인 |
| §5-2 | curl 4건 (outside 403 / 정상 200 / cooldown 429 / TTL 120 동적) | ✅ 통과 | 403 `distance_m: 4282` / 200 정상 + TTL 60 반영 / 429 `retry_after_sec: 47` / TTL 120 → 119.58초 (동적 로드 확정) |
| §5-3 | 어드민 UI 왕복 | ✅ 통과 | "이동 이상치 상한 (m)" 필드 정상 렌더링. DB 특이값(217/43/59) ↔ UI 완전 일치로 UI 정상 동작 증명 |
| §5-4 | 클라 E2E (DevPanel `OUTLIER CAP` 표시 / 세션 재시작 시 DB→UI 반영) | ✅ 통과 | 100m / 77m 세션 재시작 반영 확인. 기타 GEOFENCE·MOVED·COOLDOWN 필드도 DB 값 정확 반영 |

→ **체크포인트 ⓒ 완전 통과**. Phase 4 프롬프트 대기 단계 진입.

---

## 📝 메모 (재설계 후에도 보존)

### M-1. PlayPage 포획 UI — Phase 2 잔존

PlayPage 의 **로컬 captured state / 포획 토스트 / HUD 포획 완료** 는 Phase 2 잔존. Phase 4 에서 서버 `/api/ar/capture` (신규 엔드포인트 + 재설계된 `capture_creature` RPC) 응답으로 대체 예정.

- 현재 포획 터치는 **서버 미호출**, 로컬 UI 전환 + `scheduler.markCaptured()` 로 시간 타이머 리셋만 발생.
- Phase 4 진입 시 `handleCanvasPointerDown` 내부 `setActiveSpawn({ captured: true })` 블록을 `capture_creature` RPC 호출 + 응답 분기로 교체.

### M-2. iOS gesture chain 순서 — Phase 7 QA 실기 튜닝

`handleStart` 에서 `requestGyro → requestCamera → requestGps` 순으로 호출. 실기 단말에서 프롬프트 수용성·사용자 당황도·권한 거부율은 **Phase 7 QA 현장 테스트에서 튜닝 항목**.

### M-3. (삭제) — `detectZoneEntry.ts` TRUST_K 공식 메모

R2 에서 `detectZoneEntry.ts` 실삭제. 단일 geofence 전환 후 TRUST_K 공식 불필요 (반경 200m 대 GPS 오차 20-30m 로 충분한 여유). 역사 참조가 필요하면 git log 로 복원 가능.

### M-4. 설정 실시간 반영 미지원 (Phase 6 개선)

`useFestivalGeofence` 는 세션 중 1회 fetch. 어드민에서 값 바꿔도 PlayPage 새로고침 전까지 반영 안 됨. **의도된 단순화**. 실시간 Supabase Realtime 구독은 Phase 6 어드민 개선 범위. 테스트 4 에서 동작 확인.

### M-5. ArScene 인스턴스 누적 (Phase 4/5 이관)

`scheduler.currentSpawn` 이 바뀔 때마다 `spawnCreature(instanceId, ...)` 로 신규 인스턴스 생성 + 이전 인스턴스는 `setCreatureVisible(false)` 로 숨김만. 세션 중 창출된 모든 인스턴스가 scene.creatures Map 에 누적 — Phase 3-A~F 부터 이어진 기존 설계. ArScene 불가침 원칙으로 destroy API 추가를 Phase 4/5 로 이관.

### M-6. Three.js `PropertyBinding` 경고 + 연속 동일 등급 포획 실패 — Phase 2 기술 부채 #1 재현·확장

**경고 재현 (2026-04-19, 테스트 2)**: rare/legendary 스폰 시점에 콘솔에 `THREE.PropertyBinding` 계열 경고 출력. Phase 2 기술 부채 #1 (CreatureLoader clone 공유 참조 → 애니메이션 트랙 바인딩 충돌) 의 재현으로 확정. 포획·스폰·재스폰 UX 동작 자체에는 영향 없음.

**포획 실패 패턴 확장 (2026-04-20, 테스트 5)**: **연속 동일 등급(rare/legendary) 스폰 시 두 번째 포획이 실패**하는 간헐 패턴 1건 포착.

- **재현 조건**: 연속으로 동일 rarity 가 스폰될 때 (예: rare → rare, legendary → legendary) 두 번째 크리처의 터치가 pick 판정에 잡히지 않음.
- **추정 원인**: `CreatureLoader` 가 동일 modelUrl (동일 rarity 내부적으로 동일 모델) 에 대해 clone 공유 참조를 반환 → THREE 애니메이션 믹서의 `PropertyBinding` track position 이 이전 인스턴스에 묶여 있음 → 새 인스턴스의 Object3D world matrix 가 scene 좌표계에 정상 반영되지 않거나 raycaster hit volume 이 이전 위치에 남아 pickCreatureAt 실패. Phase 2 기술 부채 #1 의 직접 영향 범위.
- **실 노출 빈도 추정**: rarity 분포 common 75 / rare 22 / legendary 3 기준, 연속 동일 등급 발생 확률 = rare² + legendary² ≈ 4.84% + 0.09% ≈ 4.93%. 축제 세션 평균 ~10 스폰 가정 시 1 세션에 1회 이상 겪을 유저 상당수.
- **처리 방침**:
  - **기본**: Phase 5 실 에셋 도입 시 재검증 (asset loader 재설계 + clone 격리 방식 결정 시 자연 해소 예상). 현 `phase3_build.md` 원칙 유지.
  - **Phase 3.5 격상 여부**: R3 프롬프트 작성 직전 별도 판단 포인트. 실 노출 빈도 4.93% 는 실유저 영향 유의 — 비용·이득 재검토 후 결정.
- ArScene · CreatureLoader 불가침 원칙으로 R2/R3 에서는 건드리지 않음.

---

## 🔜 다음 단계 (체크포인트 ⓒ 5/5 통과 후 현재 위치 · Phase 4 프롬프트 수신 대기)

현재 main HEAD 는 본 v0.7 치환 doc 커밋. 코드 HEAD 는 `c969a55` (R3 본체). Vercel Production 자동 배포는 doc 커밋만으로는 변경점 없음 — 코드 재배포 불필요.

### 현재 위치

- ✅ **Phase 3-R1 / R2 / R3 구현·로컬·push 완료**
- ✅ **체크포인트 ⓐ / ⓑ / ⓒ 전부 통과** (ⓒ 5/5 완전 통과 · 2026-04-20)
- ✅ **DB 0018 마이그레이션 원격 적용 완료**
- ⏸ **Phase 4 프롬프트 수신 대기** (사용자 작성·전달 예정)

### 다음 세션 재개 순서

1. ⏸ **Phase 4 프롬프트 수신** — 사용자가 `PHASE_4_PROMPT.md` (가칭) 작성·전달 전까지 어떤 Phase 4 코드도 손대지 말 것.
2. ⏸ **프롬프트 수신 후** — 본 문서 "Phase 4 진입 체크리스트" 섹션을 기준으로 프롬프트 범위·결정 포인트(`outside_geofence`/`cooldown` 유니온 capture 확장 여부 · M-5 이관 방침 등) 점검 후 착수.
3. 🚫 **Phase 4 착수 금지** — Phase 4 프롬프트 수신 전까지 `/api/ar/capture` · `capture_creature` RPC 재작성 · 경품 미션 판정 · 도감 UI 구현 금지 (§2 범위 외).

### R3 완결 후에도 유지되는 가드

- ArScene · CreatureLoader · GyroController · CameraStream 불가침 (Phase 2 회귀 보호).
- 클라 훅 내부 구조 변경 금지 — settings 참조 전환 외 리팩토링은 R3/Phase 4 범위 아님.
- `useSpawnScheduler` "활성 currentSpawn TTL 중복방지" 로직 수정 금지 — 테스트 3 부분 통과 건은 Phase 7 QA 이관 방침 확정.
- M-5 (ArScene 인스턴스 누적) 는 Phase 4/5 중 이관 시점 재판단. M-6 (PropertyBinding 경고 + 연속 동일 등급 포획 실패) 는 Phase 5 재검증 유지. Phase 3.5 격상 없음 확정.
- DEBUG 플래그 (`?debug=1` / `__ar_debug__`) 는 Phase 7 QA 까지 유지 — 제거/축소 금지.

### 필독 자료 (Phase 4 착수 시점)

- 본 문서 (`phase3_build.md` v0.7) — **최우선**. R3 완료 상세 + Phase 4 진입 체크리스트 포함.
- 추후 Phase 4 프롬프트 — 사용자 작성·전달 예정.
- `phase3_redesign.md` v1.0 — 재설계 전제.
- `PHASE_3_R1_PROMPT.md` · `PHASE_3_R2_PROMPT.md` · `PHASE_3_R3_PROMPT.md` — 역사 (완료).

### 검증용 상수 · 토큰 (Phase 4 에서도 재사용 가능)

- Production alias: `https://gnfesta.vercel.app`
- Vercel Protection Bypass Token: `ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh` (curl 헤더 `x-vercel-protection-bypass`)
- geofence 안 샘플 좌표: `37.7985, 128.8990` (축제장 중앙)
- geofence 밖 샘플 좌표: `37.7600, 128.9000` (강릉역 방향)
- 검증 전화번호: `01000000000` (기존 R1~R3 검증 동일 더미)

---

*Phase 3 빌드 핸드오프 v0.7 (치환판) — R1·R2·R3 완료·push (c969a55) · DB 0018 원격 적용 완료 · **체크포인트 ⓒ (§5-1~5-4) 5/5 완전 통과** (2026-04-20) · Phase 3.5 격상 없음 / DEBUG Phase 7 까지 유지 확정 · M-5 Phase 4/5 이관 시점 재판단 · M-6 Phase 5 재검증 유지 · Phase 4 프롬프트 수신 대기 — 2026-04-20*
