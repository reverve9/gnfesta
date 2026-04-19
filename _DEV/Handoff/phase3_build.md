# Phase 3 빌드 핸드오프 (⏸ 재설계 대기)

> **상태**: Phase 3-A~F + D+E 구현·커밋·push 완료, E2E 검증 **중단**. 사용자가 재설계 결정 (2026-04-19). `phase3_redesign.md` 확정 후 Phase 3 수정 프롬프트 수신 필요.
> **작성 기준**: `AR_MODULE_PROJECT_BRIEF.md` v0.3, `PHASE_3_PROMPT.md` v1.0, `phase2_build.md` v1.2

---

## 🚨 재설계 사유 (2026-04-19, 사용자 결정)

### 배경

현재 설계(다중 zone + 엄격 GPS 판정 + 히스테리시스) 는 **도시 스케일 AR** 가정. 실제 타겟은 **축제장 스케일(50×150m)**. zone radius 를 축제장 스케일로 축소하면 GPS 오차(실외 5~30m) 가 반경과 겹쳐 판정 불가.

> Phase 3 엔지니어링 품질은 문제 없음. 사용 맥락과 어긋남. — 사용자

### 재설계 방향 (합의된 큰 방향, 세부는 `phase3_redesign.md`)

1. Zone 을 **다중 포인트에서 축제장 geofence 1개**로 재정의.
2. 스폰 트리거를 **zone 진입 → 시간·이동량 기반**으로 전환.
3. 축제장 밖에서는 AR 비활성 (안내 UI 만).
4. **쿨다운 메카닉 도입** (경품 풀 연동).

### 작업 분리 (확정)

Phase 3 재설계는 **3단계 블록 구조**로 순차 전달:

| 단계 | 주제 | 산출 범위 (개괄) |
|---|---|---|
| **Phase 3-R1** | 설정 · 스키마 · 어드민 | `ar_festival_settings` 테이블 + `get/update_festival_settings` RPC + 어드민 설정 페이지 (geofence·파라미터 CRUD). Phase 1 `ar_zones` 삭제 마이그. |
| **Phase 3-R2** | 클라이언트 geofence + 스폰 스케줄러 | `useFestivalGeofence` · `useSpawnScheduler` · PlayPage 재통합. `detectZoneEntry` / `useZoneDetection` 폐기. MiniMap 단일 geofence 표시로 용도 변경. |
| **Phase 3-R3** | 서버 스폰 정책 재정의 + 경품 미션 연동 | `/api/ar/spawn` 입력·응답 재정의 (geofence 검증 + 시간·이동 유효성 + 쿨다운 파라미터 반영). 경품 미션 기반 보상 연동. 기존 `capture_creature` RPC 는 Phase 1 시그니처 유지. |

**전달 방식**: R1 → R2 → R3 순차. 각 단계 완료 후 체크포인트 보고 → 사용자 승인 → 다음 단계 프롬프트 수신.
**금지**: 현 세션에서는 이 3단계를 **미리** 착수하지 않음. 수정 프롬프트(R1) 수신 전 코드 변경 금지.

### 확정 파라미터 (초기값)

전부 어드민에서 조정 가능. DB 저장은 `ar_festival_settings` (R1 범위).
세부 해석·근거·변경 이력은 `phase3_redesign.md` 참조.

| 파라미터 | 초기값 | 비고 |
|---|---|---|
| geofence 중심 좌표 | `37.7985, 128.8990` | 축제장 중앙 |
| geofence 반경 | `200m` | 축제장 50×150m 를 충분히 감싸는 여유 반경 |
| 스폰 주기 | `45s` | 기본 간격 — 시간 트리거 |
| 이동 보너스 임계 | `50m` | 이동 누적 거리 충족 시 추가 스폰 기회 |
| rarity 분포 | `common 75 / rare 22 / legendary 3` (%) | Phase 3 초기값 · 어드민 조정 |
| 포획 유효 | `60s` | Phase 1 `TOKEN_TTL_SEC` 와 동일 개념 |
| 쿨다운 | 없음 | 포획 후 별도 쿨다운 시간 없음 |
| 경품 | 미션 기반 | 시간·이동 누적 조건 기반, 쿨다운 없음 |

### 다음 세션 시작 전 확인

1. `_DEV/Handoff/phase3_redesign.md` (사용자 작성 중) — 확정된 상세 설계.
2. Phase 3 **수정** 프롬프트 수신 필수. 수신 전 코드 수정 금지.
3. 본 문서 §재활용/폐기 분류 먼저 확인 후 수정 프롬프트의 요구사항에 대응.

---

## 📦 Phase 3 현재 산출물 — 재활용/폐기 분류

**중요**: 전부 `main` 에 커밋·push 완료. 폐기 예정도 git history 에 남아 있어 필요 시 cherry-pick 가능.

### ✅ 재활용 예상 (재설계 후에도 유지)

| 파일 | 역할 | 재설계 후 역할 |
|---|---|---|
| `api/ar/spawn.ts` | POST 스폰 엔드포인트. zone_id 검증 → creature 선택 → `issue_spawn_token` RPC | 축제장 geofence 1개 전제로 입력 구조 조정 (zone_id 의미 재정의). creature 선택·token 재사용 로직은 유지 |
| `api/ar/zones.ts` | GET 구역 목록 | 단일 geofence 반환으로 단순화 가능. 엔드포인트 자체 유지 |
| `src/features/ar/lib/api.ts` | fetch 래퍼 (`postArSpawn` / `getArZones`) | 시그니처 소폭 조정, fetch 관행 그대로 |
| `src/features/ar/hooks/useArPermissions.ts` | GPS 권한 확장 (`requestGps`) | 그대로 유지 |
| `src/features/ar/hooks/useGpsPosition.ts` | `watchPosition` 래퍼 | 그대로 유지 |
| `src/features/ar/components/MiniMap.tsx` / `.module.css` | Leaflet 미니맵 | geofence 1개 표시로 용도 변경. `zones[]` 를 `geofence: {center, radius}` 로 좁혀도 최소 변경 |
| `src/features/ar/three/ArScene.ts` `setCreatureVisible` | 가시성 토글 API | 그대로 유지 |
| `src/features/ar/components/DevDiagnosticPanel.tsx` | GPS/Zone/Token/Polled@ 필드 | 그대로 유지, 의미만 재해석 |
| Phase 1 DB 스키마 (`ar_*` 7 테이블 — `ar_zones` 제외) + RPC 5종 | 운영 Supabase 적용 완료 | `ar_zones` 는 **삭제 확정** (§폐기 예정 참조). 나머지 7 테이블 + 5 RPC 는 유지. 시간·이동량 스폰 + 축제장 geofence + 파라미터 관리는 **신규 `ar_festival_settings` 테이블**로 Phase 3-R1 에서 도입 (§신규 추가 예정 참조) |

### ❌ 폐기 예정 (재설계 후 제거 또는 완전 교체)

| 파일 / 자산 | 폐기 사유 |
|---|---|
| **`ar_zones` 테이블 (DB)** | 다중 zone 모델 자체를 버림 → 테이블 **drop 확정** (Phase 3-R1 마이그). FK 참조 (`ar_spawn_tokens.zone_id` · `ar_captures.zone_id` · `ar_capture_attempts.zone_id`) 처리 방향은 R1 프롬프트에서 확정 (nullable 전환 vs 컬럼 제거). geofence · 파라미터는 신규 `ar_festival_settings` 로 이관 |
| `src/features/ar/lib/detectZoneEntry.ts` | 다중 zone 히스테리시스 판정 — 축제장 geofence 1개 전제로 불필요 |
| `src/features/ar/hooks/useZoneDetection.ts` | enter/leave 이벤트 콜백 — geofence 진입/이탈은 단순 "inside/outside" 로 축소 |
| `supabase/seeds/ar_test_zones.sql` zone 3행 | 축제장 1개 geofence 로 대체. creature 3행은 유지 가능 |

### 🔄 대폭 수정 예정

| 파일 | 수정 범위 |
|---|---|
| `src/features/ar/pages/PlayPage.tsx` | zone enter/leave 콜백 → geofence inside 체크로 단순화. 시간·이동량 기반 스폰 스케줄러 연동. 축제장 밖 안내 UI. 폴링 로직 재정의 |
| `api/ar/spawn.ts` | zone_id 의미 제거 → geofence 검증 + 시간·이동 유효성 + 쿨다운 파라미터 반영 (Phase 3-R3) |
| `api/ar/zones.ts` | 단일 geofence 반환으로 단순화. 엔드포인트 유지 여부는 R1/R2 에서 확정 |
| `src/features/ar/lib/api.ts` | `postArSpawn` 시그니처 조정. `getArZones` 는 `getFestivalSettings` 류로 대체 또는 단순화 |
| `src/features/ar/components/MiniMap.tsx` | `zones[]` → 단일 `geofence` prop 으로 좁힘. CircleMarker·attribution 유지 |
| `supabase/README.md` Phase 3 seed 섹션 | 축제장 좌표 + 단일 geofence 기준 재작성 |
| `_DEV/Handoff/phase3_build.md` (이 문서) | R1/R2/R3 완료 시마다 재작성 |

### ➕ 신규 추가 예정

재설계로 **새로 도입되는 자산**. Phase 3-R1/R2 범위에서 프롬프트 수신 후 구현.

| 자산 | 역할 | 도입 단계 |
|---|---|---|
| **`ar_festival_settings`** 테이블 (DB) | geofence 중심 좌표·반경 + 스폰 주기·이동 보너스·rarity 분포·포획 유효·쿨다운·경품 미션 조건 등 전 파라미터 단일 row 관리 (`ar_games` 와 유사 singleton 패턴 유력) | R1 |
| **`get_festival_settings()` RPC** | 공개 조회 — 클라이언트가 geofence + 스폰 파라미터 일괄 로드 | R1 |
| **`update_festival_settings(...)` RPC** | 어드민 수정 — 파라미터 검증 + atomic 업데이트 | R1 |
| **어드민 설정 페이지** (기존 `/ar/settings` 스텁 실구현) | geofence 중심·반경 편집 (MapTiler/Leaflet), 스폰 파라미터 폼, rarity 분포 슬라이더, 경품 미션 규칙 편집 | R1 |
| **`useFestivalGeofence`** 훅 (`src/features/ar/hooks/`) | `get_festival_settings` 로드 + 현재 GPS 위치의 `inside` / `outside` 단순 판정 (`detectZoneEntry` 대체). Haversine + `radius` 한 번 비교로 단순화 | R2 |
| **`useSpawnScheduler`** 훅 (`src/features/ar/hooks/`) | `useFestivalGeofence`+ `useGpsPosition` 기반. 시간 주기(45s 기본) + 이동량(50m 기본) 트리거로 `postArSpawn` 호출. 쿨다운·경품 미션 조건도 내부 state 로 관리 | R2 |

---

## 🗂 커밋 이력 (Phase 3 진행)

| 해시 | 제목 | 상태 |
|---|---|---|
| `4e21a34` | feat(ar): Phase 3-D+E — Leaflet 미니맵 + PlayPage 서버 스폰 통합 | 재설계로 대폭 수정 예정 |
| `eade0b1` | docs: Vercel preview SSO curl 우회 절차 문서화 | 유지 (환경 유틸, 재설계와 무관) |
| `1e01e8f` | feat(ar): Phase 3-A~F — GPS 훅 + 구역 판정 + 스폰 API + seed SQL | A~B 폐기 + C~F 재활용/수정 혼합 |
| `39d1088` | docs(ar): Phase 2 자이로 이슈 로그 수집 보류 + Phase 3 진입 방침 | 유지 |
| `8bbc803` | docs(ar): HANDOFF + phase2_build — 자이로 2차 진단 상태 기록 | 유지 |

---

## 🔍 체크포인트 통과 내역

### ⓐ — GPS 훅 + 구역 판정 단위 구현 (통과)

사용자 승인 사항:
- `useArPermissions.requestGps` = 1회성 `getCurrentPosition` + 지속 추적은 `useGpsPosition` 분리
- 히스테리시스 공식: 진입 `≤ radius`, 퇴장 `> radius × 1.1`
- (c) `useZoneDetection` = 단일 콜백 슬롯 (Phase 3 구독자 = PlayPage 1곳)
- (d) accuracy 판정: zone 개별 `accuracy ≤ radius × TRUST_K`, K = 1.5

### ⓑ — 서버 스폰 API + seed SQL + curl 5건 (통과, 사용자 확인)

- `GET /api/ar/zones` 정상 반환
- `POST /api/ar/spawn` 정상 token 발급 + 재호출 시 동일 token reused (expires_at 동일)
- `zone_not_active` / `invalid_phone` 거절 정상
- Phase 1 `issue_spawn_token` RPC 첫 실전 호출 이슈 없음

### ⓒ — DevTools 위치 시뮬 E2E 11건 (🚨 **중단**)

커밋 + push 직후 사용자가 재설계 결정. 11 케이스 실행되지 않음.

---

## 📝 메모 (재설계 후에도 보존)

### M-1. PlayPage 포획 UI — Phase 2 잔존

PlayPage 의 **로컬 captured state / 포획 토스트 / HUD 포획 완료** 는 Phase 2 잔존 로직. Phase 4 에서 서버 `/api/ar/capture` RPC 응답으로 대체 예정.

- 현재 포획 터치는 **서버 미호출**, 로컬 UI 전환만 발생.
- Phase 3 범위 준수 (서버 연결 금지).
- Phase 4 진입 시 `handleCanvasPointerDown` 내부 `setActiveSpawn({ captured: true })` 블록을 `capture_creature` RPC 호출 + 응답 분기로 교체.
- 관련 파일: `src/features/ar/pages/PlayPage.tsx` `handleCanvasPointerDown`.

### M-2. iOS gesture chain 순서 — Phase 7 QA 실기 튜닝

현재 `handleStart` 에서 `requestGyro → requestCamera → requestGps` 순으로 호출. 실기 단말에서 프롬프트 수용성·사용자 당황도·권한 거부율은 **Phase 7 QA 현장 테스트에서 튜닝 항목**.

- 대안 순서 후보: gyro → gps → camera / camera → gyro → gps.
- 현재 순서 근거: Phase 2 이미 gyro → camera 검증 완료. Phase 3 는 gps 만 끝에 추가.
- 관련 파일: `src/features/ar/pages/PlayPage.tsx` `handleStart`.

### M-3. `detectZoneEntry.ts` TRUST_K=1.5 + 히스테리시스 공식 결정 내역

폐기 예정이나 **재설계 판정 로직이 동일하게 시간·이동량 신뢰 임계치를 필요로 하면 공식 재활용 가능**:
- `accuracy ≤ radius × 1.5` 만 판정 후보
- 진입 `d ≤ radius`, 퇴장 `d > radius × 1.1`
- Haversine 은 PostGIS 금지 원칙 (브리프·프롬프트 반복) 그대로.

---

## 🔜 다음 세션 진입 절차

1. **필독**: 본 문서 (phase3_build.md) → `phase3_redesign.md` (사용자 작성) → Phase 3 **수정** 프롬프트 (사용자 전달).
2. **코드 수정 금지**: 수정 프롬프트 수신 전까지 재설계 방향성 추측 기반 코드 작성 금지 (`AR_MODULE_PROJECT_BRIEF.md` §13 원칙).
3. **확인 질문 자리**: 수정 프롬프트가 불명확하면 즉시 중단하고 사용자 확인 요청.
4. **Phase 2 회귀 보호 유지**: ArScene 자이로 이슈 / 기술 부채 #1 (CreatureLoader clone 공유 참조) — 재설계가 ArScene 내부를 다시 건드리게 되지 않는지 경계.
5. **재활용/폐기 분류** (본 문서 §산출물) 를 기준으로 수정 커밋 범위 최소화.

---

*Phase 3 빌드 핸드오프 v0.3 (재설계 방향 확정 · R1~R3 3단계 구조 · 파라미터 초기값 고정) — 2026-04-19*
