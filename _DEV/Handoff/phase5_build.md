# Phase 5 빌드 로그 — ArScene dispose + 2D placeholder + idle 효과

> **상태**: 코드 일괄 커밋 + 자체 빌드 PASS (2026-04-29). 사용자 선행 조치 (seed UPDATE SQL 원격 적용) + 체크포인트 ⓔ 4영역 검증 잔여.
> **작성 기준**: `PHASE_5_PROMPT.md` v1.1, `phase4_build.md` v0.2, `phase4_fix01_build.md` v0.3

---

## §1 Phase 5 목표 — 항목별 상태

| 영역 | 상태 |
|---|---|
| §1-1 ArScene `dispose()` API + 모듈 스코프 `instanceCount` + DevPanel 카운터 | ✅ 구현 |
| §1-1 useArSceneLifecycle `disposedRef` idempotency 가드 + loader 통합 | ✅ 구현 |
| §1-2 CreatureLoader 내부 재구현 (GLB → 2D plane primitive) | ✅ 구현 |
| §1-3 효과 시스템 (Y축 회전 3초/회전 + idle 바운스 ±5cm 2초 sin) | ✅ 구현 |
| §1-4 seed SQL `ar_creatures_phase5_placeholder.sql` (마이그 X) | ✅ 작성 |
| §1-5 CollectionPage primitive 분기 + 공유 모듈 `creatureColors.ts` | ✅ 구현 |
| 자체 빌드 (tsc -b + vite build) | ✅ EXIT=0 / vite 520ms |
| §1-4 사용자 선행 조치 (seed UPDATE 원격 적용) | ⏸ 사용자 대기 |
| §1-6 M-6 재현 확인 (체크포인트 ⓔ 일부) | ⏸ ⓔ 검증 턴에서 진행 |
| 체크포인트 ⓔ 4영역 검증 | ⏸ 별도 턴 발행 예정 |

---

## §2 커밋 요약

| 해시 | 제목 | 범위 |
|---|---|---|
| `40dc33f` | feat(ar): Phase 5 ArScene dispose + 2D placeholder + idle effects | 코드 8 파일 (수정 6, 신규 2) |
| `(본 커밋)` | docs(ar): phase5_build.md v0.1 | 본 doc |

push 는 두 커밋 모두 완료 후 main 일괄.

---

## §3 착수 전 확정 사항 (PHASE_5_PROMPT.md §3 인용)

| Q | 주제 | 결정 |
|---|---|---|
| Q1 | 실 에셋 범위 | A — 등급별 1종 = 3개. 본 Phase 는 placeholder 유지 |
| Q2 | 자산 호스팅 + 사이즈 가이드 | 보류 (실 에셋 도입 Phase) |
| Q3 | CreatureLoader 시그니처 | A — 시그니처 보존, 내부만 교체 |
| Q4 | M-5 (ArScene 인스턴스 누적) | A — `dispose()` API + React unmount 호출 |
| Q5 | M-6 처리 시점 | B' — placeholder 상에서 재현 확인. 재현 안 되면 PASS, 노트 명시 |
| Q6 | `ar_creatures.model_url` / `thumbnail_url` 컬럼 | 이미 존재 → 마이그 0021 X. seed UPDATE 만 |
| Q7 | N-1 정책 (거절 후 재탭) | C — Phase 5 범위 밖 |
| Q8 | placeholder 처리 방식 | A' — `PlaneGeometry` + `MeshBasicMaterial(DoubleSide)` 단색 |
| Q9 | 효과 최소 세트 | B — Y축 회전 (3초/회전) + idle 바운스 (±5cm, 2초 sin) |
| Q10 | 등급별 차별화 | 단색만. 크기·외곽선 동일 |
| 등급별 색 | — | common `#A0825A` / rare `#D4A574` / legendary `#FFE9A8` |
| Phase 명칭 | — | Phase 5. 실 에셋 도입은 Phase 6+ 별도 슬롯 |
| 커밋 방식 | — | 일괄 1커밋 + doc 별도 |

§7 발동 (판단 요청) — **없음**.

---

## §4 산출물

**신규 (2)**
- `src/features/ar/lib/creatureColors.ts` (37 lines) — `CREATURE_COLORS` (등급별 hex) + `parsePrimitiveUrl(url)`. CreatureLoader · CollectionPage 양쪽이 import 하는 단일 source of truth.
- `supabase/seeds/ar_creatures_phase5_placeholder.sql` (24 lines) — `ar_creatures.model_url` · `thumbnail_url` 을 `primitive:plane:<grade>` 로 갱신. 스키마 변경 없음, **사용자 원격 적용 선행**.

**수정 (6)**
- `src/features/ar/three/ArScene.ts` (+200 / −105) — dispose 강화 · 모듈 스코프 instanceCount · `attachCreatureLoader()` · `update loop` 회전·바운스 추가 · `despawnCreature` 가 root mesh dispose 안 하도록 변경 (캐시 보호).
- `src/features/ar/three/CreatureLoader.ts` (+131 / −116, 사실상 전면 교체) — GLTFLoader/DRACOLoader 제거. primitive 파싱 + 등급별 단색 plane mesh 생성. `Map<grade, {geometry, material}>` 캐시. `disposeObject` 헬퍼 export 시그니처 보존.
- `src/features/ar/hooks/useArSceneLifecycle.ts` (+34 / −7) — `creatureLoaderRef` 옵션 추가. `disposedRef` idempotency 가드 (StrictMode 이중 마운트 시 ref reset 으로 복구). cleanup 본문에 loader.dispose() 추가.
- `src/features/ar/components/DevDiagnosticPanel.tsx` (+20 / −0) — `ArScene instances` 행 + 1초마다 `getArSceneInstanceCount()` 폴링. 1 초과 시 에러 색.
- `src/features/ar/pages/PlayPage.tsx` (+6 / −2) — useArSceneLifecycle 에 `creatureLoaderRef` 전달. 씬 부트 useEffect 에서 `scene.attachCreatureLoader(loader)` 호출.
- `src/features/ar/pages/CollectionPage.tsx` (+27 / −15) — `parsePrimitiveUrl` 분기. primitive 면 단색 `<div>` (background = `CREATURE_COLORS[grade]`), 아니면 기존 `<img>`.

**합계**: 신규 2 + 수정 6 = 8 파일. 368 insertions / 171 deletions.

---

## §5 변경 상세

### §5-1 ArScene `dispose()` 구현

**모듈 스코프 카운터**:
```ts
let instanceCount = 0
export function getArSceneInstanceCount(): number { return instanceCount }
```
생성자에서 +1, dispose() 정상 종료 시 `Math.max(0, -1)` 으로 -1 (음수 방어).

**dispose 순서** (idempotent — `if (this.disposed) return`):
1. `pause()` — RAF cancel
2. resize / orientationchange 리스너 unbind
3. `clearCreatures()` — scene 에서 wrapper/root 분리. **per-creature dispose 안 함** (CreatureLoader 캐시가 등급별 geo/mat 을 인스턴스간 공유하므로 캐시 원본 보호)
4. `creatureLoader?.clearCache()` — 등급별 PlaneGeometry/MeshBasicMaterial 1회 일괄 dispose
5. scene traverse → 잔여 객체 (lights 등) geometry/material dispose, `scene.clear()`
6. `renderer.dispose()` + `renderer.forceContextLoss()` (try-catch — 일부 컨텍스트 미지원)
7. `instanceCount -= 1`

**`attachCreatureLoader(loader | null)` 추가** — PlayPage 씬 부트 직후 호출. ArScene 가 loader 의 라이프사이클을 책임지지는 않고 (loader 인스턴스 dispose 는 useArSceneLifecycle 가 책임), dispose 시점에 캐시만 비우는 단방향 reference.

**`despawnCreature` 변경**:
```ts
// Phase 4 까지: disposeObject(c.root) 호출 → 캐시 공유 자원 dispose 위험
// Phase 5: scene 에서 분리만. geo/mat 은 loader 캐시 소유.
this.scene.remove(c.wrapper)
c.wrapper.remove(c.root)
this.creatures.delete(id)
```

기존 TODO(Phase 7) 주석 (참조 카운트 미구현) 자연 해소.

### §5-2 useArSceneLifecycle `disposedRef` 가드

```ts
const disposedRef = useRef(false)

useEffect(() => {
  disposedRef.current = false  // setup 시점마다 reset
  return () => {
    if (disposedRef.current) return
    disposedRef.current = true
    clearSessionTimer()
    sceneRef.current?.dispose()
    sceneRef.current = null
    if (creatureLoaderRef) {
      creatureLoaderRef.current?.dispose()
      creatureLoaderRef.current = null
    }
    cameraStreamRef?.current?.dispose()
    if (cameraStreamRef) cameraStreamRef.current = null
  }
}, [])
```

**StrictMode 이중 마운트 시나리오**:
- 1차 mount: `disposedRef.current = false` (setup)
- 1차 sim cleanup: false → dispose 실행, true 마킹
- 2차 sim mount: setup 재실행 → `disposedRef.current = false` 로 **리셋**
- 2차 (실제) cleanup: false → dispose 정상 실행

이로써 prompt 의 "ArScene 가 1 초과 누적 안 됨" 보장 + 사용자 navigate 후 재진입 시 신규 ArScene 의 정상 dispose 까지 모두 커버.

`cleanup` (manual) 콜백도 동일 가드 적용.

### §5-3 CreatureLoader 내부 재구현

**public 시그니처 보존** (Q3=A): `load(url)` / `clearCache()` / `dispose()` / export `disposeObject(...)` 모두 동일.

**내부**:
- GLTFLoader / DRACOLoader / DRACO_DECODER_PATH / `cache: Map<string, GLTF>` 전면 제거
- `parsePrimitiveUrl(url)` (`creatureColors.ts`) 으로 `primitive:plane:<grade>` 매칭
  - 매칭 실패 시: `console.warn` + common fallback (메쉬는 정상 반환, `isFallback: true`)
- `getOrCreateEntry(grade)`: lazy 캐시 hit/miss → `PlaneGeometry(0.7, 0.7)` + `MeshBasicMaterial({ color: CREATURE_COLORS[grade], side: DoubleSide, transparent: false })`
- 매 load 마다 `new THREE.Mesh(cachedGeo, cachedMat)` 신규 인스턴스. transform 충돌 없음.
- `mesh.userData`:
  ```ts
  isCreature: true
  grade: 'common' | 'rare' | 'legendary'
  spawnedAt: performance.now()
  ```
- 빌보드 처리 안 함 (Q9=B 의도된 시각 효과 — Y축 회전 시 옆모습 사라짐)
- `clearCache()`: 캐시 entry 의 geometry · material 모두 dispose 후 Map clear

`disposeObject(root)` 헬퍼는 외부 (ArScene 또는 향후 호출부) 가 import 가능. ArScene 내 사용처는 제거됐지만 API 보존을 위해 export 유지.

### §5-4 효과 시스템 (회전 + 바운스)

ArScene `tick()` 내 매 creature 순회 블록:

```ts
const root = c.root
if (root.userData.isCreature === true) {
  root.rotation.y += delta * ROTATION_SPEED            // 2π/3 rad/s
  const baseY = (root.userData.baseY as number | undefined) ?? 0
  const spawnedAt = (root.userData.spawnedAt as number | undefined) ?? nowMs
  const elapsedSec = (nowMs - spawnedAt) / 1000
  root.position.y = baseY + Math.sin(elapsedSec * BOUNCE_OMEGA) * BOUNCE_AMPLITUDE
}
```

상수:
- `ROTATION_SPEED = (Math.PI * 2) / 3` rad/s — 3초당 1회전
- `BOUNCE_AMPLITUDE = 0.05` m
- `BOUNCE_OMEGA = Math.PI` — 주기 2초 (sin 인자 = 2π/T = π)

**baseY 저장 시점**: `spawnCreature(id, root, animations, position?)` 진입에서 wrapper 에 root 추가 직후 → `root.userData.baseY = root.position.y` (보통 0). wrapper 가 절대 위치, root 가 sin 바운스를 표현하는 분리 구조.

**deltaTime 처리**: `THREE.Clock.getDelta()` 사용 → frame rate 무관.

**자이로 lerp 와 충돌 없음**: 자이로는 wrapper 에, 바운스는 root 에 적용. 양쪽 독립.

### §5-5 seed SQL — `ar_creatures_phase5_placeholder.sql`

```sql
UPDATE ar_creatures SET model_url = 'primitive:plane:common',
  thumbnail_url = 'primitive:plane:common'
  WHERE active = true AND rarity = 'common';
-- rare, legendary 동일
```

스키마 변경 없음. 사용자 원격 적용 선행 조치 (§11 참조).

### §5-6 CollectionPage primitive 분기

```tsx
const primitive = c.thumbnail_url ? parsePrimitiveUrl(c.thumbnail_url) : null
{primitive ? (
  <div className={styles.captureThumb}
       style={{ background: CREATURE_COLORS[primitive.grade] }}
       aria-label={c.creature_name} role="img" />
) : c.thumbnail_url ? (
  <img className={styles.captureThumb} src={c.thumbnail_url} ... />
) : (
  <div className={styles.captureFallback}>{c.creature_name.slice(0,1)}</div>
)}
```

기존 CSS (`captureThumb`) 클래스 재사용 — div 도 동일 사이즈. role="img" + aria-label 로 a11y 보존.

### §5-7 공유 모듈 `creatureColors.ts`

```ts
export const CREATURE_COLORS: Record<ArRarity, string> = {
  common: '#A0825A', rare: '#D4A574', legendary: '#FFE9A8',
} as const
export function parsePrimitiveUrl(url: string): { kind:'plane'; grade: ArRarity } | null
```

CreatureLoader · CollectionPage 양쪽 import. 향후 등급별 색 변경 시 이 파일 1군데만 수정.

---

## §6 로컬 검증 결과

```
$ npx tsc -b
$ echo $?
0

$ npx vite build
... (18 chunks 빌드)
✓ built in 520ms
$ echo $?
0
```

청크 변동:
- `ArScene-uB405Yw5.js` 5.83 kB (Phase 4 와 비슷, dispose 강화 분 추가됐으나 GLTFLoader 의존성 분리로 상쇄)
- `creatureColors-BxPC0nyQ.js` 1.71 kB (신규 청크)
- `three.module-Bjv5Ag6Z.js` 527 kB — GLTFLoader/DRACOLoader 미사용으로 tree-shake 기대했으나 실제 chunk 변동 미세 (other Three 코어 의존성 영향)

청크 크기 경고 (>500 kB) 는 기존 베이스라인 (PlayPage / xlsx / index / three) 그대로.

---

## §7 금지 사항 준수 표 (PHASE_5_PROMPT.md §2)

| 항목 | 상태 |
|---|---|
| **N-1 (거절 후 재탭 정책)** | ✅ 무변경 — `handleCanvasPointerDown` 의 거절 분기 동작 그대로 |
| **M-6 fix 시도** | ✅ fix 시도 X (재현 확인은 ⓔ 검증 턴에서 진행) |
| **M-7 (`ar_capture_attempts` 로깅 enum 확장)** | ✅ 미진행 |
| **N-2 (`as unknown as CaptureRow[]` 캐스팅)** | ✅ 무변경 |
| **N-3 (capture_creature duplicate UNIQUE 의존성)** | ✅ 무변경 |
| **DB 스키마 변경 (마이그 0021 발행)** | ✅ 미진행 — seed UPDATE 만 |
| **`generate_ar_reward_code()` 시그니처** | ✅ 재사용만, 변경 X |
| **`ar_capture_attempts` 작성** | ✅ 미진행 |
| **어드민 인증 체계** | ✅ 무변경 |
| **실 에셋 (GLB·텍스처·이미지) 도입** | ✅ placeholder 만 |
| **`useSpawnScheduler` "활성 currentSpawn TTL 중복방지"** | ✅ 무변경 |
| **`GyroController` / `CameraStream`** | ✅ 무변경 |
| **API 엔드포인트 (`/api/ar/*`)** | ✅ 무변경 |
| **DEBUG 플래그 (`readDebugFlag()`)** | ✅ 무변경 |
| **CreatureLoader public API 시그니처** | ✅ 보존 — `load`/`clearCache`/`dispose`/`disposeObject` export 모두 동일 |

---

## §8 M-6 재현 확인 결과

**상태**: ⏸ 본 빌드 시점에서는 자체 실행 환경 (CLI 빌드 only) 으로 브라우저 콘솔 관찰 불가. 체크포인트 ⓔ 검증 턴 (사용자 디바이스 또는 dev server) 에서 §1-6 절차 실행 예정.

**예상 결과 메모** (사전 추정 — ⓔ 결과로 갱신):
- Phase 4 까지 PropertyBinding 경고는 GLTF skinned mesh + AnimationMixer 의 대상 노드 미스매치에서 발생. Phase 5 에서 GLTFLoader 경로 + AnimationMixer 사용 (애니메이션 0개) 자체가 사라지므로 **재현 안 됨이 기본 예측**.
- 단, 실 에셋 (스킨/스프라이트 애니메이션) 도입 시 재재현 가능성 잔존. 별도 검증 필요.

ⓔ 검증 턴에서 등급별 5회 spawn-capture 반복 후 콘솔 raw 첨부 → 본 §8 갱신.

---

## §9 DevDiagnosticPanel 변경

**신규 행**: `ArScene instances`
- 표시값: `getArSceneInstanceCount()` 1초 폴링.
- 1 이하: 정상색 (`styles.val`)
- 2 이상: 에러색 (`styles.valError`) + tooltip (`title` 속성) 으로 "정상 작동 시 동시 표시 1 초과 금지" 안내.

기존 행 (Level / FPS / Memory / Camera / Gyro / Spawned / ...) 모두 보존. 패널 폭/배치 영향 미세.

---

## §10 사용자 선행 조치 — seed UPDATE SQL

체크포인트 ⓔ 검증 시작 전 **반드시** 다음 SQL 을 운영 Supabase 에 적용해야 한다. (Phase 4 까지 `ar_creatures.model_url` 이 외부 GLB URL 이었던 row 가 `primitive:plane:<grade>` 형식으로 갱신되어야 클라가 정상 인식)

```sql
-- supabase/seeds/ar_creatures_phase5_placeholder.sql

UPDATE ar_creatures
SET model_url = 'primitive:plane:common',
    thumbnail_url = 'primitive:plane:common'
WHERE active = true AND rarity = 'common';

UPDATE ar_creatures
SET model_url = 'primitive:plane:rare',
    thumbnail_url = 'primitive:plane:rare'
WHERE active = true AND rarity = 'rare';

UPDATE ar_creatures
SET model_url = 'primitive:plane:legendary',
    thumbnail_url = 'primitive:plane:legendary'
WHERE active = true AND rarity = 'legendary';
```

**적용 후 검증 SELECT** (회신 시 첨부 권장):
```sql
SELECT id, rarity, name, model_url, thumbnail_url, active
FROM ar_creatures
WHERE active = true
ORDER BY rarity;
```
기대: 3 row, 모두 model_url / thumbnail_url 이 `primitive:plane:<해당 등급>` 으로 갱신.

---

## §11 체크포인트 ⓔ 검증 계획 초안 (별도 턴 발행 예정)

ⓔ 영역 잠정 4개 (Phase 5 범위 + Phase 4 회귀 보호):

1. **§ⓔ-1 인스턴스 카운터** — `?debug=1` PlayPage 진입/이탈 반복. DevPanel `ArScene instances` 가 1 (활성) / 0 (이탈 후) 사이에서만 토글되는지. 2 이상 누적 시 FAIL.
2. **§ⓔ-2 placeholder 시각 검증** — 등급별 색 (common 갈색 · rare 연갈 · legendary 베이지) + Y축 회전 (3초/회전, 옆모습에서 사라짐) + idle 바운스 (작은 위아래 흔들림) 모두 가시.
3. **§ⓔ-3 CollectionPage 단색 썸네일** — 도감 진입 시 thumbnail 위치에 등급별 단색 div. 깨진 이미지 아이콘 없음.
4. **§ⓔ-4 M-6 재현 확인 + Phase 4 회귀** — common/rare/legendary 5회씩 spawn-capture. PropertyBinding 경고 발생 여부. capture API 응답 (`already_captured` / `duplicate` 등) 정상.

검증 프롬프트는 별도 턴에서 발행. 본 빌드로그는 v0.1 → ⓔ PASS 후 v0.2 로 치환.

---

## §12 메모

### M-1 ~ M-7 / N-1 ~ N-3 상태 갱신

| ID | 영역 | 상태 (Phase 5 후) |
|---|---|---|
| M-1 | iOS gesture chain | Phase 4 까지 정상. 변동 없음 |
| M-2 | DPR clamp (`min(dpr, 2)`) | 유지 |
| M-3 | watchPosition 5 s maxAge | 유지 |
| M-4 | Phase 2 spawn-dump DEV 로깅 | **제거** — Phase 5 에서 spawnCreature 의 GLTF 트리 dump 블록 삭제 (animations=0 로 대부분 무의미). 필요 시 Phase 7 에서 재도입 |
| **M-5** | ArScene 인스턴스 누적 | **해소** — Q4=A 적용. dispose() + disposedRef + 카운터 |
| **M-6** | PropertyBinding 경고 | ⏸ ⓔ 검증 결과 대기. 재현 안 되면 자연 해소, 재현 시 별도 fix 턴 |
| M-7 | `ar_capture_attempts` enum 확장 | 변동 없음 (Phase 6+) |
| N-1 | 거절 후 재탭 정책 | Phase 5 범위 밖. Phase 6+ 또는 별도 fix |
| N-2 | `as unknown as CaptureRow[]` 캐스팅 | 변동 없음 (Supabase 타입 자동 생성 후 정리) |
| N-3 | capture_creature duplicate UNIQUE | 변동 없음. 본 Phase 에서도 schema 무변경이라 재발 위험 없음 |

### 신규 메모 (M-8 / N-4 후보)

**M-8**: ArScene `despawnCreature` 가 root mesh 의 geometry/material 을 dispose 안 함. Phase 5 placeholder 에서는 캐시 공유 자원 보호로 의도. 실 에셋 (per-creature 고유 텍스처) 도입 Phase 에서는 인스턴스별 소유권 또는 참조 카운트 도입 필요. 빌드로그 §5-1 메모.

**N-4**: `disposeObject(root)` export 는 현재 외부 사용처 없음 (ArScene 가 자체 traverse 로 대체). public API 시그니처 보존 (Q3=A) 위해 유지. Phase 7 미사용 확인 후 export 제거 검토.

### Phase 5 후 Phase 6 또는 실 에셋 도입 Phase 진입 시 검토 사항

1. CreatureLoader 의 외부 fetch 경로 재도입 (실 텍스처 atlas 또는 sprite sheet)
2. M-8 — per-creature 자원 소유권 모델 (참조 카운트 / 인스턴스 소유)
3. N-1 거절 후 재탭 정책 fix
4. M-7 `ar_capture_attempts` enum 확장 + 로깅 재도입
5. 어드민 인증 강화 (Phase 6+)
6. 실 에셋 도입 시 M-6 재재현 모니터링

---

## §13 다음 세션 진입 체크리스트

1. ✅ **Claude Code Phase 5**: 코드 일괄 + 빌드로그 v0.1 + 커밋 2건 (현 시점 코드 커밋 `40dc33f` 완료)
2. ⏸ **Claude Code Phase 5 마무리**: 본 빌드로그 커밋 + main push
3. ⏸ **사용자 §10**: seed UPDATE SQL 원격 적용 + 검증 SELECT 회신
4. ⏸ **체크포인트 ⓔ 프롬프트 발행**: 별도 턴에서 (§11 4영역 잠정안 기반)
5. ⏸ **사용자 ⓔ 4영역 검증**: §11 케이스별 회신
6. ⏸ **Claude Code 마무리**: 본 빌드로그 v0.1 → v0.2 치환 (ⓔ 결과 채움) + 커밋 + push
7. ⏸ **Phase 6 또는 실 에셋 Phase 발행 검토**: ⓔ 결과 + 우선순위 회의 후 별도 턴

### 검증용 상수 (phase4_fix01_build.md 에서 승계)

- Production alias: `https://gnfesta.vercel.app`
- Vercel Protection Bypass header: `x-vercel-protection-bypass: ia5gBnX1MN3cP6AmxZfp36mwwaTkNzdh`
- geofence 안 샘플 좌표: `37.7985, 128.8990`
- geofence 밖 샘플 좌표: `37.7600, 128.9000`

### 다음 세션 시작 시 읽을 것

- 본 파일 (`phase5_build.md` v0.1)
- `PHASE_5_PROMPT.md` v1.1
- (선택) `phase4_build.md` v0.2 + `phase4_fix01_build.md` v0.3 (Phase 4 컨텍스트)

---

*Phase 5 빌드 로그 v0.1 — ArScene dispose + 2D placeholder + idle 효과, 코드 커밋 40dc33f, 빌드 PASS, 사용자 seed UPDATE 적용 + 체크포인트 ⓔ 4영역 검증 대기 — 2026-04-29*
