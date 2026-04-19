# Phase 2 완료 · 빌드 핸드오프 (2026-04-18 · 방침 갱신 2026-04-19)

> WebAR 기반 (카메라 + Three.js + 자이로 + 폴백 계단 + 더미 스폰·포획) 구현 완료.
> 서버 통신 0회 — `/api/ar/*` 및 capture_creature RPC 연동은 Phase 3+ 범위.
> 알려진 이슈 2건 — 플레이스홀더 한정 추정, 실 에셋 재검증 대기 (§알려진 이슈).

---

## 🚨 새 세션 시작 시 필독 순서

Phase 3 를 이어서 진행하려면 아래 문서 순서로 확인:

1. **`_DEV/Handoff/AR_MODULE_PROJECT_BRIEF.md`** (v0.3) — §6 방어 정책, §8 진입 플로우, §5 API 엔드포인트
2. **`HANDOFF.md`** (프로젝트 루트) — Phase 상태·최신 커밋·변경 파일
3. **본 문서** — Phase 2 산출물·확정 결정사항·기술 부채·Phase 3 운영 정보

부가 참고 (필요할 때만):
- `_DEV/Handoff/페이즈0_빌드.md` — Phase 0 결정·실기 검증 (iOS UA Frozen 등)
- `_DEV/Handoff/phase1_build.md` — DB 8 테이블 · RPC 5종 · capture_creature 임계치
- `_DEV/Handoff/phase2_ef_checkpoint.md` — E/F 세부 산출 체크리스트 (본 문서의 서브셋)
- `_DEV/Handoff/PHASE_2_PROMPT.md` — Phase 2 착수 프롬프트 원본 (H 체크리스트 포함)
- `_DEV/Handoff/archive/PHASE_{0,1}_PROMPT.md` — 완료된 프롬프트 아카이브

---

## 🎯 Phase 2 범위 — WebAR 기반 · 카메라 + 3D + 라이프사이클

실제 축제 운영 데이터 연동(`/api/ar/spawn`, `capture_creature` RPC, GPS 구역 판정, 도감 UI, 완주 경품)은 **Phase 3~5 범위**. 이번 Phase 는:

1. **에셋 리졸버** — R2 배포 전제의 베이스 URL 해석 + 개발 시 Khronos 샘플 폴백
2. **Three.js 씬 모듈 분리** — TechTestPage 에 인라인됐던 단일 파일을 재사용 가능한 5 모듈로
3. **라이프사이클 훅** — Page Visibility pause/resume + unmount dispose + 세션 타임아웃 인터페이스
4. **폴백 레벨 감지** — Level 1~4 스위칭 (UA 파싱 금지, feature detection only)
5. **`/ar/play` End-to-End** — 권한 → 카메라 → 3D → 더미 스폰 → 터치 포획 (서버 통신 0)
6. **DEV 진단 패널** — 프로덕션 번들 제외 (dynamic import + 2중 DEV 가드)

---

## ✅ Phase 2 확정 결정사항

| 번호 | 항목 | 결정값 | 반영 위치 |
|---|---|---|---|
| ① | 에셋 베이스 URL 해석 | `VITE_AR_ASSETS_BASE_URL` env (끝 `/` 자동 정규화). 미설정 시 Khronos glTF-Sample-Assets CDN 폴백 | `lib/assets.ts` `getAssetBaseUrl` |
| ② | 플레이스홀더 creature 선정 | rarity 당 1종, 전부 **CC-BY 4.0** (사용자 승인: 옵션 A = 단일 라이선스) | `lib/assets.ts` `PLACEHOLDER_CREATURES` |
| ③ | Duck / Avocado 등 SCEA 계열 배제 | 라이선스 상용 회색지대 — CC-BY 4.0 만 허용하여 일관성 확보 | (선정 시 제외) |
| ④ | Level 4 초기 감지 기준 | `navigator.mediaDevices.getUserMedia` 존재 여부 (iOS 16.4 미만 = 미지원) | `lib/detectFallbackLevel.ts` `detectInitialFallbackLevel` |
| ⑤ | Level 4 UI 정책 | `/ar/fallback` 라우트로 redirect (PlayPage 내부에서 화면 그리지 않음) | `pages/PlayPage.tsx` `useEffect` |
| ⑥ | 권한 요청 순서 (iOS gesture chain) | 자이로 `requestPermission()` → 카메라 `getUserMedia()` 순 (사용자 터치 onClick 내부) | `PlayPage.handleStart` |
| ⑦ | 라이프사이클 관장 분리 | 권한(터치 필요) = `useArPermissions`, 씬 수명(자동 정리) = `useArSceneLifecycle` 로 분리 | `hooks/*` |
| ⑧ | 자이로 damping | `GYRO_DAMPING = 0.1` (Phase 0 실기 검증 값 유지) | `three/GyroController.ts` |
| ⑨ | CameraStream 기본 해상도 | `{ width:{ideal:1280}, height:{ideal:720} }` · `facingMode: environment` | `three/CameraStream.ts` (Phase 0 VGA 폴백 이슈 대응) |
| ⑩ | DEV 진단 패널 번들 분리 | `import.meta.env.DEV && lazy(() => import(...))` + 컴포넌트 런타임 `if (!DEV) return null` 2중 가드 | `pages/PlayPage.tsx` |
| ⑪ | 더미 스폰·포획 범위 | 로컬 state 만. `/api/ar/*` · `capture_creature` · `issue_spawn_token` 호출 전면 금지 | `PlayPage.handleSpawn` / `handleCanvasPointerDown` |
| ⑫ | 포획 터치 판정 | NDC 변환 + `THREE.Raycaster.intersectObject(root, true)` 로 공용 메서드 제공 | `three/ArScene.ts` `pickCreatureAt` |

---

## 📦 산출물

### A. 에셋 리졸버 + 플레이스홀더 (`lib/assets.ts`, 3160 bytes)

- `getAssetBaseUrl()` — env 우선, 공백·미설정 시 Khronos CDN 폴백. 항상 `/` 로 정규화.
- `resolveCreatureModelUrl({ model_url })` — 절대 URL 은 그대로, 상대 경로는 base + path
- `PLACEHOLDER_CREATURES` (3종, 전부 CC-BY 4.0):

| id | rarity | Khronos 샘플 | 원본 크기 | 애니메이션 |
|---|---|---|---|---|
| `placeholder-box-animated` | common | `BoxAnimated/glTF-Binary/BoxAnimated.glb` | 11.7 KB | 1 클립 (단일 채널) |
| `placeholder-cesium-man` | rare | `CesiumMan/glTF-Binary/CesiumMan.glb` | 438 KB | 1 클립 (스킨드) |
| `placeholder-fox` | legendary | `Fox/glTF-Binary/Fox.glb` | 159 KB | 3 클립 (Survey/Walk/Run) |

- `pickPlaceholderByRarity(rarity)` — rarity 별 첫 매칭 반환 (단일 단순화).
- **Duck·Avocado 등 배제**: SCEA 라이선스 상용 회색지대. 프로덕션 에셋 교체 전까지 CC-BY 4.0 만 허용.

### B. Three.js 씬 모듈 5종 (`three/*.ts`)

| 파일 | 라인 | 책임 |
|---|---|---|
| `CameraStream.ts` | ~120 | `getUserMedia` 래퍼. `start/attachTo/pause/resume/dispose`. 3종 실패 분류 (`denied`/`unsupported`/`hardware-error`) |
| `GyroController.ts` | ~112 | DeviceOrientation 리스너 + iOS 16+ `requestPermission()` + damping 상수 + `getOffset()` polling |
| `CreatureLoader.ts` | ~150 | GLTFLoader + DRACOLoader (gstatic 1.5.6 고정) + URL 메모리 캐시 + 실패 시 BoxGeometry 폴백 + `disposeObject` 공용 유틸 |
| `ArScene.ts` | ~250 | 통합 씬. `init/start/pause/resume/spawnCreature/despawnCreature/pickCreatureAt/dispose`. AnimationMixer 지원, 자이로 position lerp, FPS 리포트, 리사이즈 핸들러 |
| `FallbackRenderer.ts` | ~165 | Level 3 2D Canvas 스켈레톤. `init/start/spawnSprite/despawnSprite/dispose`. rarity 색 원만 그림 (Phase 7 에서 실제 스프라이트 교체) |

**TestScene.ts 는 보존**: Phase 0 기술 검증 아티팩트로 `/ar-tech-test` (DEV 전용) 에서 사용. Phase 2 작업에는 무관.

### C. 라이프사이클 훅 2종 (`hooks/*.ts`)

| 훅 | 책임 |
|---|---|
| `useArSceneLifecycle` | Page Visibility `hidden → scene.pause() + camera.pause()`. 복귀 시 resume. Unmount 시 자동 `scene.dispose()` + `camera.dispose()`. `sessionTimeoutMs` 인터페이스만 — Phase 2 미지정 → 타이머 비활성. Phase 4 에서 5분 정책 주입 예정 |
| `useArPermissions` | 카메라/자이로 인스턴스 lazy 생성·보유. `requestCamera` / `requestGyro` 는 **반드시 사용자 터치 onClick 에서만 호출**. Mount 직후 자동 호출 금지 (iOS `NotAllowedError` 회피). GPS 는 Phase 3 에서 추가 예정 — 타입 자리 예약만 |

### D. 폴백 레벨 감지 (`lib/detectFallbackLevel.ts`)

```
Level 1 — 카메라 O + 자이로 O              → ArScene + GyroController
Level 2 — 카메라 O + 자이로 X              → ArScene (정적 중앙)
Level 3 — 카메라 O + WebGL X / FPS ≤ 20    → FallbackRenderer
Level 4 — 카메라 X / iOS 16.4 미만         → /ar/fallback redirect
```

- `detectInitialFallbackLevel()` — 라우트 진입 즉시 호출. Level 4 만 조기 판정.
- `detectFallbackLevel(inputs)` — 런타임 순차 강등. FPS 기반 강등은 `averageFps` 주입 시만.
- `detectWebGLSupport()` — canvas `webgl2 || webgl` context 생성 시도. throw 없이 boolean.
- `rendererForLevel(level)` → `'ar-scene' | 'fallback-2d' | 'redirect-fallback-route'`.
- **UA 파싱 금지** (Phase 0 발견: iOS UA Frozen) — 전부 feature detection.

### E. `/ar/play` 실구현 (`pages/PlayPage.tsx`, `pages/PlayPage.module.css`)

**플로우**:
```
Mount → detectInitialFallbackLevel
  ├─ L4 → navigate('/ar/fallback', replace)
  └─ 인트로 화면
시작 버튼 onClick (gesture chain)
  → requestGyro() → requestCamera()
  ├─ denied/unsupported → /ar/fallback redirect
  └─ started = true
Effect: video.srcObject = stream + ArScene.init/start (또는 FallbackRenderer L3)
Effect: 권한·WebGL·FPS 변화마다 detectFallbackLevel 재평가
스폰 버튼 onClick
  → rarity 필터 → 랜덤 1 → CreatureLoader.load
  → ArScene.spawnCreature(id, root, animations, randomPos)
  → spawned state push
canvas onPointerDown
  → NDC 변환 → ArScene.pickCreatureAt
  → SpawnedCreature.captured=true (일방통행) + 토스트 1.5s + HUD 카운트 +1
```

**UI 구성**:
- 배경 `<video>` (z:0) · three `<canvas>` (z:1)
- 좌상단: 백 버튼 (z:10) · DEV 진단 패널 (z:8, DEV 만)
- 우상단: `포획 N/M` HUD 칩 (z:3)
- 중앙 상단: 폴백 배너 `Level N` (L>1 시)
- 하단 중앙: rarity 세그먼트 (3-way) + 스폰 버튼 (z:6, safe-area-bottom)
- 중앙: 토스트 (z:9, 포획 성공 시)

**스케일 보정**: Fox 원본이 과대 → `scaleForCreature('placeholder-fox') = 0.01` 하드코딩. CesiumMan 은 0.8. 실 에셋 교체 시 표준화 필요.

### F. DEV 진단 패널 (`components/DevDiagnosticPanel.tsx`, `.module.css`)

**표시 항목**: Fallback Level / FPS / Memory (`performance.memory.usedJSHeapSize`, Chromium 전용) / Camera 권한 / Gyro 권한 / Spawned / Captured@ / Cam res / Error (있을 때).

**번들 분리 검증**:
```
$ VITE_DEV_MODE=false npm run build
dist/assets/PlayPage-Bq1d27Yz.js     631.57 kB (three 번들 포함, /ar/play lazy)
dist/assets/PlayPage-D7M1D3QP.css      4.36 kB
dist/assets/DevDiagnosticPanel-*.js   ❌ 생성되지 않음 (dead code elimination)
dist/assets/TechTestPage-*.js         ❌ 생성되지 않음 (Phase 1 검증 유지)
dist/assets/TestScene-*.js            ❌ 생성되지 않음 (Phase 1 검증 유지)
```

---

## 📝 최근 변경 파일

| 종류 | 파일 | Phase | 비고 |
|---|---|---|---|
| 신규 | `src/features/ar/lib/assets.ts` | 2-A | 에셋 리졸버 + PLACEHOLDER_CREATURES 3종 |
| 신규 | `src/features/ar/three/CameraStream.ts` | 2-B | getUserMedia 래퍼 |
| 신규 | `src/features/ar/three/GyroController.ts` | 2-B | DeviceOrientation + iOS 권한 |
| 신규 | `src/features/ar/three/CreatureLoader.ts` | 2-B | glTF + Draco + 캐시 |
| 신규 | `src/features/ar/three/ArScene.ts` | 2-B / 2-E | 통합 씬. 2-E 에서 `pickCreatureAt` 추가 |
| 신규 | `src/features/ar/three/FallbackRenderer.ts` | 2-B | Level 3 스켈레톤 |
| 신규 | `src/features/ar/hooks/useArSceneLifecycle.ts` | 2-C | Page Visibility + unmount dispose |
| 신규 | `src/features/ar/hooks/useArPermissions.ts` | 2-C | 카메라/자이로 권한 통합 |
| 신규 | `src/features/ar/lib/detectFallbackLevel.ts` | 2-D | Level 1~4 스위칭 |
| 수정 | `src/features/ar/pages/PlayPage.tsx` | 2-E | 스텁 → 실구현 |
| 신규 | `src/features/ar/pages/PlayPage.module.css` | 2-E | HUD · 세그먼트 · 스폰 독 · 토스트 |
| 신규 | `src/features/ar/components/DevDiagnosticPanel.tsx` | 2-F | DEV 전용 (lazy + 가드) |
| 신규 | `src/features/ar/components/DevDiagnosticPanel.module.css` | 2-F | |
| 수정 | `src/App.tsx` | 2-(pre) | `/ar-tech-test` VITE_DEV_MODE 가드 (이미 커밋) |
| 수정 | `HANDOFF.md` | 2-F / 2-postverify | Phase 2 상태 업데이트 · 2차 진단 기록 |
| 수정 | `src/features/ar/three/ArScene.ts` | 2-postverify | wrapper 분리 (`6ee1d28`) + DEV 덤프 훅 (`646b4b9`) |

커밋 분할 (시간 역순):
- `646b4b9 chore(ar): Phase 2 자이로 버그 2차 진단용 DEV 덤프 추가`
- `6ee1d28 fix(ar): Phase 2 — AR creature wrapper 분리로 자이로 시차 복구` (1차 수정 · 부분 성공)
- `98a0b8e feat(ar): Phase 2-E+F — /ar/play End-to-End + DEV 진단 패널`
- `2568343 feat(ar): Phase 2-C+D — 라이프사이클 훅 2종 + 폴백 레벨 감지`
- `9bd802b feat(ar): Phase 2-B — Three.js 씬 모듈 5종 분리`
- `59002e7 feat(ar): Phase 2-A — 에셋 리졸버 + 플레이스홀더 도입`
- `6390eb3 fix(ar): Phase 1 이슈 #1 해결 — /ar-tech-test orphan chunk 완전 제거`
- `fd26607 chore(ar): Phase 2 중단 체크포인트 — /ar-tech-test 가드 isDevMode 전환`

---

## ⚠️ 기술 부채 (Phase 7 이월)

### 1. `CreatureLoader.clone(true)` + `disposeObject` 공유 참조 리스크

- **현상**: `CreatureLoader.load` 는 `gltf.scene.clone(true)` 로 복제본을 반환하지만, geometry/material/texture 는 원본과 참조 공유 상태.
- **위험**: `ArScene.despawnCreature(id)` 가 내부적으로 `disposeObject(c.root)` 를 호출 — 공유 리소스까지 dispose 되어 같은 URL 을 재로드 하는 후속 인스턴스가 **깨진 메쉬로 렌더**.
- **Phase 2 영향**: 0. 현재 PlayPage 는 포획 후에도 despawn 을 호출하지 않음 (모델을 씬에 남겨둠). 더미 3종 모두 한 세션에 각 1회 이상 반복 스폰돼도 문제 없음 — 로드 후 파기 경로가 아예 없기 때문.
- **TODO 주석 위치**: `src/features/ar/three/ArScene.ts:161-164` · `src/features/ar/three/CreatureLoader.ts:57-61`
- **Phase 4~7 대응 방안**:
  - (A) 복제본별 owned geometry/material 소유권 (CreatureLoader 에서 clone 후 immediate duplicate)
  - (B) URL 별 참조 카운트 + refCount === 0 일 때만 실제 dispose
  - (C) 장면별 pool (세션 종료 시 일괄 dispose)

### 2. `FallbackRenderer` 스켈레톤 상태

- **현상**: `init/start/spawnSprite/dispose` API 와 rAF 루프는 구동되지만, draw 는 rarity 별 색 원 하나만.
- **제약**: Phase 2 범위는 "감지 지점과 스위치 구조만" (브리프 §4 명시). 실 스프라이트 이미지 로딩·애니메이션·tap 판정·placeholder PNG 세트는 **Phase 7 저사양 단말 대응** 작업.
- **파일 헤더 주석**: `src/features/ar/three/FallbackRenderer.ts:1-12` 에 명시.

---

## 🐛 알려진 이슈 (실 에셋 재검증 대기)

> 플레이스홀더 한정 가능성이 높아 2026-04-19 방침 변경으로 조치 보류. Phase 5 실 에셋 도입 직후 재검증 → 재현 시 옵션 A 적용.

### 1. rare/legendary 자이로 미동작

- **증상**: common (BoxAnimated) 은 자이로 시차 정상, rare (CesiumMan) / legendary (Fox) 는 미동작.
- **원인 추정**: 루트 본 position 트랙 (root motion) 이 wrapper 내부에 존재하여 `AnimationMixer` 가 매 프레임 덮어쓰는 것으로 분석.
- **플레이스홀더 한정 가능성**: 높음 (CesiumMan = 사람 걸음, Fox = Walk/Run 애니메이션 포함).
- **재검증 시점**: Phase 5 실 에셋 도입 직후.
- **조치 옵션**: 옵션 A (`clip.tracks` 중 루트 노드/본 `.position` 트랙 필터링) 준비됨, 실 에셋에서도 재현되면 적용.
- **진단 도구**: `ArScene.spawnCreature` 의 DEV 덤프 훅 (커밋 `646b4b9`) 잔존 — 재검증 시 즉시 활용 가능.

### 2. rare "움직이면 사라짐 + 포획 영역 좁음"

- **증상**: CesiumMan 이 일정 시간 후 카메라 밖으로 이동 후 재출현, raycast 포획 판정 영역이 육안 메시 대비 좁음.
- **원인 추정**: root motion 으로 메시가 bind-pose 밖으로 이동 → `THREE.SkinnedMesh.raycast` 의 bind-pose bounding sphere 판정과 괴리.
- **이슈 #1 과 동일 근본 원인** (루트 본 position 트랙).
- **옵션 A 적용 시 동시 해소 예상**.

---

## 📐 3D 에셋 제작 가이드라인 (Phase 5 외주 발주 시 반영)

플레이스홀더 검증에서 발견된 이슈 반영. Phase 5 실 에셋 제작 사양서에 포함.

### 애니메이션 요구사항

- **루트 본 position 트랙 포함 금지** (root motion 없음).
- 애니메이션은 제자리 동작 (Idle, 둘러보기, 호흡 등) 권장.
- 캐릭터가 공간 이동하는 애니메이션 (Walk, Run 등) 불가.
- rotation / scale 트랙은 자유롭게 사용 가능.

### 메시 요구사항

- bind-pose bounding sphere 가 애니메이션 시 예상 메시 범위를 모두 감싸도록 설정 (raycast 정확도).
- SkinnedMesh 사용 시 위 제약 특히 중요.

### 에셋 포맷

- glTF 2.0 + Draco 압축 (확정).
- 모델당 목표 사이즈 500 KB ~ 2 MB.
- 텍스처는 별도 관리 가능 (glTF 외부 참조).

### 참고

- Phase 2 플레이스홀더 (BoxAnimated / CesiumMan / Fox) 는 실 에셋 교체 전까지 테스트용으로 유지.
- 실 에셋 교체는 `VITE_AR_ASSETS_BASE_URL` 환경변수 + `ar_creatures.model_url` DB 데이터 변경만으로 처리.

---

## 🔍 실기 검증 대기 항목 (사용자 수동)

로컬 개발 서버·배포 프리뷰에서 실 단말로만 검증 가능. Phase 2 완료 기준의 체크포인트 ⓒ:

1. **iOS Safari (iPhone 12+, 16.4+) 권한 플로우 End-to-End**
   - 시작 버튼 탭 → 자이로 팝업 → 카메라 팝업 순차 표시 여부
   - 두 권한 모두 허용 후 `<video>` 스트림 정상 재생
2. **Safari 상단 카메라 인디케이터 off 검증 (중요)**
   - 백 버튼 탭 즉시 인디케이터 사라지는지 (CameraStream.dispose 의 `track.stop()` 실제 동작 증명)
3. **자이로 시차 효과 육안 확인**
   - 단말 기울일 때 creature 가 역방향으로 `tx/ty` lerp 반영되는지 (Level 1 전제)
4. **각 rarity 모델 시각 차이**
   - common (노랑 상자) / rare (사람 메쉬) / legendary (여우) — 원본 픽셀 차이 확인
5. **Fox 애니메이션 재생**
   - 전설 스폰 후 3 클립 (Survey/Walk/Run) 중 하나 이상 재생 (현재 모두 `play()` 호출 상태)
6. **Raycaster 터치 판정 정확도**
   - 모델 위 터치 → 포획 / 모델 빗나간 터치 → 무응답
7. **Android Chrome (중급 단말) 동일 시나리오**
8. **메모리 누수 간이 테스트**
   - `/ar/play` 진입 → 10~20 회 스폰·포획 반복 → 백 버튼 이탈 → 재진입을 3~5 회 반복
   - DEV 진단 패널 Memory 수치가 누적 상승 없이 안정 이면 OK
9. **Page Visibility pause/resume**
   - 앱 백그라운드 전환 → FPS 0 → 복귀 시 재개
10. **iOS 16.4 미만 단말 (가능하면 1대)**
    - `/ar/play` 진입 즉시 `/ar/fallback` 으로 redirect 되는지

**결과 기록 위치**: 검증 완료 후 본 문서 하단 또는 별도 `phase2_verification.md` 로 증거(스크린샷·콘솔 로그) 수집.

---

## 🧪 실기 검증 결과 (2026-04-19 · 1차 자이로 수정)

### 테스트 환경
- iPhone Safari, 사용자 수동 실기 테스트
- 대상 커밋: `6ee1d28 fix(ar): Phase 2 — AR creature wrapper 분리로 자이로 시차 복구`

### 1차 수정 개요
- `ArScene.spawnCreature` 가 gltf root 를 `Object3D` wrapper 로 감싸고, 자이로 position lerp 는 **wrapper** 에, `AnimationMixer` 는 **root** 에 작용하도록 분리.
- 가설: mixer 가 root 의 position 트랙을 덮어써 gyro lerp (factor 0.1) 가 90% 상쇄되는 문제 해결.

### 실기 결과

| rarity | 모델 | 자이로 | 추가 증상 |
|---|---|---|---|
| common | BoxAnimated | ✅ 정상 | 없음 |
| rare | CesiumMan | ❌ 미동작 | 움직이면 사라졌다 재출현 / 포획 영역 대단히 좁음 (**신규 발생**) |
| legendary | Fox | ❌ 미동작 (변화 없음) | 없음 |

### 재가설 (수정 전 대비 부분 성공 + 신규 증상)

- wrapper 는 "mixer 가 gltf 최상위 root 노드(`gltf.scene`) 자체의 position 트랙을 쓰는 경우" 만 격리 가능. BoxAnimated 가 이에 해당하는 것으로 추정 (정상 유지).
- CesiumMan / Fox 는 mixer 가 **wrapper 내부 자식 (Armature / Hips 등 루트 본)** 의 `.position` 트랙을 덮어씀 → wrapper 의 격리 효과가 자식 레이어까지 미치지 못해 gyro 상쇄 지속.
- **신규 증상 원인**: wrapper 도입 후 root motion (캐릭터 루트 본의 전진 translation) 이 gyro lerp 의 원위치 복귀 효과마저 잃어 자유 이동 → 카메라 frustum 이탈 시 "사라짐", 루프 복귀 시 "재출현". 동시에 `THREE.SkinnedMesh.raycast` 가 **bind-pose geometry bounding sphere** 로 판정하는 기본 구현상, 본 애니메이션이 메시를 이동시키면 "보이는 위치" 와 "raycaster 판정 영역" 괴리 → 포획 영역 좁음.
- 두 증상 모두 **루트 본 position 트랙 (root motion)** 한 가지 원인으로 수렴 가능성 높음.

### 2차 진단 — DEV 덤프 훅 (커밋 `646b4b9`)

- 위치: `ArScene.spawnCreature` 내부, `scene.add(wrapper)` 직후 `import.meta.env.DEV` 가드.
- 로그 구성:
  - `[AR][spawn-dump]` 그룹: gltf tree (재귀 traverse) + 각 AnimationClip 의 tracks (name + constructor + times 길이) + playing clips 목록 + t=0 position 스냅샷.
  - `[AR][spawn-dump-t1s]` 라인: 스폰 1초 후 wrapper / root / firstChild position — mixer 가 실제로 이동시키는 대상 노드 특정용.
- 프로덕션 영향 없음: `VITE_DEV_MODE=false` 빌드에서 PlayPage 청크 사이즈 불변 (631.66 kB gzip 162.04 kB) — tree shake 검증 완료.
- 상시 유지: 옵션 A 수정 후에도 제거하지 않음 (향후 모델 추가 시 재사용).

### 로그 수집 절차 (Phase 5 실 에셋 도입 시 재검증용)

> **⚠️ 지금 실행 대상 아님.** 2026-04-19 방침 변경으로 로그 수집은 Phase 5 근처 재검증 시점까지 보류. 실 에셋이 root motion 없는 제자리 애니메이션으로 제작될 가능성이 높아 이슈가 재현 안 될 수도 있음. 덤프 훅 `646b4b9` 는 DEV 가드로 코드에 그대로 잔존.

상세 절차는 `HANDOFF.md` §"Phase 5 실 에셋 도입 시 자이로 재검증 절차" 참조. 요약:

1. Vercel 프리뷰 배포 완료 확인 (덤프 훅은 모든 이후 빌드에 포함).
2. iPhone Safari → 프리뷰 URL → Mac Safari Web Inspector 연결.
3. `/ar/play` → 권한 허용 → rare 1회 → 1초 대기 → legendary 1회 → 1초 대기.
4. `[AR][spawn-dump]` 2 그룹 + `[AR][spawn-dump-t1s]` 2 라인 복사 → 공유.
5. 탭 순서 = rarity 매핑 (rare 먼저, legendary 나중).

### 조건부 조치 (옵션 A · Phase 5 재검증 후 판단)

**실 에셋으로 교체한 후에도 동일 증상 재현 시 적용. 재현되지 않으면 옵션 A 불필요.**

옵션 A 개요: `ArScene.spawnCreature` 또는 `CreatureLoader.load` 에서 `clip.tracks` 를 순회해 **최상위 본/노드의 `.position` 트랙만 제거**, rotation / scale / 하위 본 트랙은 유지.

- 스킨 변형·팔다리 애니메이션 유지 → 시각 품질 보존.
- 공간 이동만 제거 → wrapper 의 gyro lerp 가 유일한 위치 제어자.
- SkinnedMesh raycast 어긋남도 동시 해소 (메시가 bind-pose 근처에 머무름).
- 덤프 로그로 타겟 노드 이름 확정 후 필터 조건 구체화.

---

## 🛠 Phase 3 착수 전 운영 정보

> Phase 2 완료 상태 — 자이로 이슈는 §알려진 이슈로 기록 후 Phase 3 즉시 진입 가능.

Phase 3 주제: **GPS 구역 판정 + 서버 스폰 + spawn token** — `/api/ar/spawn`, 구역 진입 감지, 미니맵.

### Phase 3 에서 확정 필요

| 항목 | 영향 범위 |
|---|---|
| Cloudflare R2 버킷 이름 + 커스텀 도메인 (예: `ar-assets.gnfesta.com`) | `VITE_AR_ASSETS_BASE_URL` 값, `ar_creatures.model_url` 저장 형식 |
| 실 축제 존 좌표 세트 | `ar_zones` seed, 지도 편집 UI |
| 미니맵 라이브러리 | Leaflet / MapLibre / 자체 canvas 구현 중 택 |
| 스폰 API 호출 주기 | 구역 진입 시 한 번 vs polling vs realtime |
| `ar_rewards.status = 'active' / 'used' / 'expired'` 전이 책임 주체 | `/api/ar/rewards/validate` vs RPC vs 배치 |

### Phase 2 에서 재활용할 자산

- `pages/PlayPage.tsx` 의 rarity 세그먼트 UI → DEV 옵션으로 유지하거나 제거 (Phase 3 부턴 서버 스폰)
- `PLACEHOLDER_CREATURES` → 실 `ar_creatures` 테이블 데이터로 대체. 개발 시 env 스위치로 flip.
- `ArScene.pickCreatureAt` → 그대로 사용 (터치 판정)
- `CreatureLoader` → 그대로 (단 기술 부채 #1 해결 필요, Phase 4~7)

### 기존 GNfesta 컨벤션 재확인 (Phase 3 API 작업 시)

- **phone 전달 = JSON body / header** (URL path 금지)
- **UNIQUE 충돌 처리** = Postgres error code `23505` 감지 → `already_exists` 매핑
- **Vercel serverless 상대 임포트 불가** → `/api/` 함수 파일 내 인라인 복사 또는 RPC 집중
- **Supabase RPC 우선** — 재고·발급·전이는 race-safe 원자 트랜잭션
- **낙관적 UI** — Realtime 구독 화면은 `await refetch()` 지양
- **ID 형식** — `AR-XXXXXX` (보상), `P-YYYYMMDDHHmmss-NNNN` (기존 패턴 필요시)

### Phase 1 방어 RPC 임계치 (Phase 3 에서 호출 시)

| 상수 | 값 | 의미 |
|---|---|---|
| `RATE_LIMIT_SEC` | 5 | 직전 포획과의 최소 간격 |
| `VELOCITY_KMH_MAX` | 30 | 이동속도 상한 |
| `ZONE_WINDOW_MIN` | 10 | 존별 시도 카운트 윈도우 (분) |
| `ZONE_WINDOW_MAX_TRY` | 5 | 윈도우 내 최대 시도 |
| `TOKEN_TTL_SEC` | 60 | `issue_spawn_token` 유효 기간 |

---

*Phase 2 빌드 핸드오프 v1.2 — 2026-04-19 · 1차 실기 결과 + 2차 진단 덤프 + 로그 수집 보류 방침 기록*
