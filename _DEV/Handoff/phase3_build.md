# Phase 3 빌드 핸드오프 (R1 완료·push 완료 · R2 완료·ⓑ 검증 대기 · R3 프롬프트 대기)

> **상태**: Phase 3-R1 (스키마·RPC·API·어드민 UI) 구현·검증·push 완료. Phase 3-R2 (클라이언트 geofence + 스폰 스케줄러) 구현·로컬 검증·커밋 완료. push 는 체크포인트 ⓑ(사용자 E2E 검증) 통과 후. R3 프롬프트 수신 전 R3 착수 금지.
> **작성 기준**: `AR_MODULE_PROJECT_BRIEF.md` v0.3, `phase3_redesign.md` v1.0, `PHASE_3_R1_PROMPT.md` v1.0, `PHASE_3_R2_PROMPT.md` v1.0, `phase2_build.md` v1.2

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
| **Phase 3-R2** | 클라이언트 geofence + 스폰 스케줄러 | ✅ 구현·로컬 검증·커밋 완료 (2026-04-19). 체크포인트 ⓑ(사용자 E2E) 대기 |
| **Phase 3-R3** | 서버 스폰 정책 재정의 + 경품 미션 필드 + MOVEMENT_OUTLIER_CAP 설정화 | ⏸ R2 검증·승인 후 별도 프롬프트로 착수 |

**전달 방식**: R1 → R2 → R3 순차. 각 단계 완료 후 체크포인트 보고 → 사용자 승인 → 다음 단계 프롬프트 수신.

### 확정 파라미터 (초기값 · R1 에서 DB 반영 완료)

전부 어드민에서 조정 가능. DB 저장은 `ar_festival_settings` (R1 범위, 구현 완료). R2 에서 클라 훅이 실제 참조.

| 파라미터 | 초기값 | 비고 |
|---|---|---|
| geofence 중심 좌표 | `37.7985, 128.8990` | 축제장 중앙(경포해변) |
| geofence 반경 | `200m` | 축제장 50×150m + 주변 동선 여유 |
| 스폰 주기 | `45s` | 시간 트리거 — R2 `useSpawnScheduler` 참조 |
| 이동 보너스 임계 | `50m` | R2 `useSpawnScheduler` 이동 트리거 |
| rarity 분포 | `common 75 / rare 22 / legendary 3` (%) | DB 저장, R3 에서 `/api/ar/spawn` 로직 연동 |
| 포획 유효 | `60s` | 현재 `issue_spawn_token` 하드코딩. R3 에서 DB 값 연동 예정 |
| 쿨다운 | `0s` (없음) | DB 저장, R3 에서 로직 반영 |
| 이동 이상치 상한 | `100m` (하드코딩) | R2 `useSpawnScheduler` 내부 상수. **R3 에서 `ar_festival_settings.movement_outlier_cap_m` 로 이동 예정** |
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

## ✅ Phase 3-R2 완료 상세 (2026-04-19, 로컬 검증 완료)

### 커밋

| 해시 | 제목 | 상태 |
|---|---|---|
| `d4825df` | feat(ar): Phase 3-R2 — useFestivalGeofence + useSpawnScheduler 훅 + PlayPage 재통합 + 다중 zone 로직 삭제 | ✅ 로컬 · 체크포인트 ⓑ 통과 후 push |

### 산출물 (10 files changed, +712 / −520)

**신규 (3)**
- `src/features/ar/lib/geo.ts` — `haversineKm` / `haversineMeters`. `detectZoneEntry.ts` 삭제 후 공용.
- `src/features/ar/hooks/useFestivalGeofence.ts` — 설정 1회 fetch + inside/distance 판정. GPS 구독 금지 (PlayPage 가 `useGpsPosition` 단독 소유, 중복 watchPosition 회피).
- `src/features/ar/hooks/useSpawnScheduler.ts` — 시간·이동 기반 스폰 트리거. `MOVEMENT_OUTLIER_CAP_M = 100` 내부 상수 (R3 에서 설정 필드화 예정).

**수정 (5)**
- `src/features/ar/lib/api.ts` — `getArZones`/`ArZoneDto` 삭제, `getFestivalSettings`/`FestivalSettingsDto` 신규, `postArSpawn` body 에서 `zone_id` 제거, fail 유니온 정리 (`zone_not_active` 제거 → `no_creatures`).
- `src/features/ar/components/MiniMap.tsx` — `zones[]+currentZoneId` props → `geofence+userPosition+inside`. Leaflet 번들 분리 구조 보존. 3-useEffect 구조 유지.
- `src/features/ar/components/DevDiagnosticPanel.tsx` — `currentZoneId`/`lastPollingAt` 제거. `inside` · `distanceToCenter` · `nextSpawnEta` · `accumulatedDistanceM` · `lastSpawnAt` · `lastRejectedDelta` · settings (cooldown 등) 추가.
- `src/features/ar/pages/PlayPage.tsx` — zone enter/leave + 폴링 30s + tokenExpiryTimer 삭제. `useFestivalGeofence`+`useSpawnScheduler` 통합. `scheduler.currentSpawn` 변화 감지 effect 로 모델 로드/숨김/전환. geofence 밖 오버레이 UI ("축제장에서 만나요" + 거리).
- `src/features/ar/pages/PlayPage.module.css` — `.outsideOverlay`/`.outsideCard`/`.outsideTitle`/`.outsideDesc`/`.outsideDist` 추가.

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
```

### 로컬 검증

- `npx tsc --noEmit` — EXIT=0
- `npm run build` — `built in 369ms` (기존 chunk size warning 외 이슈 없음)

### 체크포인트 ⓑ — 사용자 E2E 검증 대기 (5건)

절차는 `PHASE_3_R2_PROMPT.md` §5 참조. Chrome DevTools Location 시뮬레이션 필수.

1. 지점 A (강릉역 `37.7632, 128.8996`, 축제장 밖) → inside=false, 오버레이 표시, ArScene mount 유지·스폰 비활성
2. 지점 B (경포해변 중앙 `37.7985, 128.8990`, 안) → inside=true, 45s 후 첫 스폰 발생, 미니맵 유저 marker 중심 근처
3. 지점 C (경계 `37.7985, 128.9014`, 중심에서 약 200m) → 한쪽으로 확정되면 정상
4. 이동 트리거 E2E (B → A 천천히 이동) → `accumulatedDistanceM` 50m 도달 시 스폰 + 시간 타이머와 중복 없음
5. 어드민 값 변경 반영 (세션 재시작 필수): `spawn_interval_sec=10` 저장 → PlayPage 새로고침 → 10s 주기 확인 → 45 원복

### Phase 2 회귀 검증 병행

- 자이로 초기화·카메라 스트림 기존과 동일 동작
- 포획 탭 → 토스트 + 로컬 captured state (Phase 2 잔존 유지)
- rare/legendary 자이로 이슈는 Phase 5 이월 (R2 무관)

---

## 🧩 R1 부수 처리 기록

### `capture_creature` RPC DROP (계획 외 — Q1-B 귀결)

**결정**: `0017_ar_drop_zones.sql` 에서 DROP. HTTP `/api/ar/capture` 엔드포인트 미존재 → 실사용 경로 영향 없음. Phase 4 에서 geofence 기반으로 신규 작성 예정.

**영향**: `zone_rate_limit` result 값은 `ar_capture_attempts.result` CHECK 제약에 enum 으로 남김 (불필요한 churn 회피, Phase 4 가 필요 시 정리).

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

## 📦 Phase 3 산출물 재분류 (R1·R2 반영 후)

### ✅ R1·R2 완료분

| 파일 / 자산 | 구현 위치 |
|---|---|
| DB `ar_festival_settings` + RPC 2종 + `issue_spawn_token` 2파라미터 + `ar_zones`/`zone_id` DROP + `capture_creature` DROP | R1 (0016·0017) |
| `api/ar/festival.ts` + `api/ar/spawn.ts` (zone_id 제거) | R1 |
| `/admin/ar/settings` 편집 폼 | R1 |
| 클라 `geo.ts` + `useFestivalGeofence` + `useSpawnScheduler` | R2 |
| `MiniMap` 단순화 + `PlayPage` 재통합 + outside 오버레이 | R2 |
| `DevDiagnosticPanel` 필드 교체 | R2 |
| `detectZoneEntry.ts` + `useZoneDetection.ts` 삭제 | R2 |
| `api.ts` `getArZones` 삭제 · `getFestivalSettings` 신규 · `postArSpawn` 시그니처 정리 | R2 |

### ⏸ R3 진입 체크리스트 (R2 검증·승인 후 착수)

**서버 스폰 정책 재정의**:
- `api/ar/spawn.ts` 서버 geofence 검증 (`client_lat/lng` + `ar_festival_settings.center_lat/lng/radius_m` 거리 판정, 밖이면 거절)
- 시간·이동 유효성 검증 (클라가 보낸 `last_spawn_at`/`accumulated_distance_m` 서버 재확인 — 또는 서버가 토큰 재사용 시그널로 갈음)
- `capture_cooldown_sec` 실제 적용 (재발급 간격 하한으로 작용)
- rarity 분포를 `ar_festival_settings` 에서 동적 로드 (현재 하드코딩 70/25/5 → DB 75/22/3)

**`issue_spawn_token` TTL 동적 로드**:
- 현재 하드코딩 60초 → `ar_festival_settings.capture_token_ttl_sec` 참조

**이동 이상치 상한의 설정 필드화** (R3 확정 TODO):
- `ar_festival_settings` 에 `movement_outlier_cap_m INTEGER NOT NULL DEFAULT 100` 필드 신규 (단위 m)
- 마이그레이션 신규 (예: `0018_ar_festival_movement_outlier.sql`)
- 어드민 UI `/admin/ar/settings` → **스폰 스케줄 섹션 내** 입력 필드 추가
- `update_festival_settings` RPC 의 partial-update 필드에 포함 + `get_festival_settings` 에 자동 포함됨
- `src/features/ar/lib/api.ts` `FestivalSettingsDto` · `src/types/database.ts` Row/Insert/Update 타입 확장
- `useSpawnScheduler` 옵션에 `movementOutlierCapM` 추가 + 내부 상수 → 옵션 참조로 교체
- `PlayPage` 에서 `geofence.settings.movement_outlier_cap_m` 주입
- 사유: 어드민 조정 가능 시스템이 이미 있는데 하드코딩 유지할 이유 약함. Phase 7 현장 실측 대응 유연성 확보.

**경품 미션 조건**: 저장 필드 R1 완료. 판정·발급은 Phase 4 (R3 무관).

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
| `d4825df` | feat(ar): Phase 3-R2 — useFestivalGeofence + useSpawnScheduler 훅 + PlayPage 재통합 + 다중 zone 로직 삭제 | ✅ 로컬 · ⓑ 통과 후 push |
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

**⓪' R2 로컬 (통과)** — `tsc` EXIT=0 · `vite build` 369ms

**ⓑ R2 사용자 E2E 검증 (⏸ 대기)** — 절차는 `PHASE_3_R2_PROMPT.md` §5 참조. Chrome DevTools Location 시뮬레이션 5건 (지점 A/B/C + 이동 트리거 + 어드민 값 변경 반영).

**ⓒ R3 (R2 승인 후)**

---

## 📝 메모 (재설계 후에도 보존)

### M-1. PlayPage 포획 UI — Phase 2 잔존

PlayPage 의 **로컬 captured state / 포획 토스트 / HUD 포획 완료** 는 Phase 2 잔존. Phase 4 에서 서버 `/api/ar/capture` (신규 엔드포인트 + 재설계된 `capture_creature` RPC) 응답으로 대체 예정.

- 현재 포획 터치는 **서버 미호출**, 로컬 UI 전환만 발생.
- Phase 4 진입 시 `handleCanvasPointerDown` 내부 `setActiveSpawn({ captured: true })` 블록을 `capture_creature` RPC 호출 + 응답 분기로 교체.

### M-2. iOS gesture chain 순서 — Phase 7 QA 실기 튜닝

`handleStart` 에서 `requestGyro → requestCamera → requestGps` 순으로 호출. 실기 단말에서 프롬프트 수용성·사용자 당황도·권한 거부율은 **Phase 7 QA 현장 테스트에서 튜닝 항목**.

### M-3. (삭제) — `detectZoneEntry.ts` TRUST_K 공식 메모

R2 에서 `detectZoneEntry.ts` 실삭제. 단일 geofence 전환 후 TRUST_K 공식 불필요 (반경 200m 대 GPS 오차 20-30m 로 충분한 여유). 역사 참조가 필요하면 git log 로 복원 가능.

### M-4. 설정 실시간 반영 미지원 (Phase 6 개선)

`useFestivalGeofence` 는 세션 중 1회 fetch. 어드민에서 값 바꿔도 PlayPage 새로고침 전까지 반영 안 됨. **의도된 단순화**. 실시간 Supabase Realtime 구독은 Phase 6 어드민 개선 범위.

### M-5. ArScene 인스턴스 누적 (Phase 4/5 이관)

`scheduler.currentSpawn` 이 바뀔 때마다 `spawnCreature(instanceId, ...)` 로 신규 인스턴스 생성 + 이전 인스턴스는 `setCreatureVisible(false)` 로 숨김만. 세션 중 창출된 모든 인스턴스가 scene.creatures Map 에 누적 — Phase 3-A~F 부터 이어진 기존 설계. ArScene 불가침 원칙으로 destroy API 추가를 Phase 4/5 로 이관.

---

## 🔜 다음 단계 (체크포인트 ⓑ 통과 후)

1. **체크포인트 ⓑ 통과 확인**: 사용자가 E2E 5건 검증 → 승인.
2. **push**: `git push origin main` — R2 코드 커밋 + v0.5 doc 커밋 일괄.
3. **R3 프롬프트 수신**: 사용자가 R3 착수 프롬프트 작성·전달 (서버 스폰 정책 재정의 + MOVEMENT_OUTLIER_CAP 설정화 등 포함).
4. **R3 착수 금지 원칙**: R3 프롬프트 수신 전 서버 `/api/ar/spawn` 로직 · `issue_spawn_token` · `ar_festival_settings` 신규 필드 작업 금지.

---

## 🔜 다음 세션 진입 절차 (혹시 세션 단절 시)

1. **필독**:
   - 본 문서 (phase3_build.md v0.5)
   - `phase3_redesign.md` v1.0
   - `PHASE_3_R1_PROMPT.md` / `PHASE_3_R2_PROMPT.md` v1.0 (완료됨 — 역사)
   - 향후 R3 프롬프트 (사용자 전달)
2. **코드 수정 금지**: R3 프롬프트 수신 전까지 서버 스폰 정책·DB 스키마·어드민 UI 신규 필드 작업 금지.
3. **Phase 2 회귀 보호 유지**: ArScene 자이로 이슈 / 기술 부채 #1 (CreatureLoader clone 공유 참조) 경계.

---

*Phase 3 빌드 핸드오프 v0.5 — R1·R2 완료 · 체크포인트 ⓑ 대기 · R3 체크리스트 확장 (MOVEMENT_OUTLIER_CAP 설정화 포함) — 2026-04-19*
