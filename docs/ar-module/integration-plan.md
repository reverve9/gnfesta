# Phase 0 — AR 모듈 통합 지점 설계

> 목적: Phase 0 분석 리포트를 바탕으로 AR 모듈이 기존 코드에 어떻게 합쳐질지 **후보와 근거** 제시.
> **최종 결정은 사용자가 한다** — 여기서는 판단 금지, 선택지와 장단점만.

---

## 1. 메뉴 진입점 (유저앱)

### 현재 Customer 메뉴 구조
```
BottomNav (추정 — src/components/layout/BottomNav.tsx 확인 필요)
├─ 홈 (/)
├─ 일정 (/schedule)
├─ 만족도조사 (/survey)
├─ 위치 (/location)
├─ 공지 (/notice)
└─ ...
```
+ 홈페이지(`HomePage.tsx`)의 히어로/카드 섹션에 스탬프 랠리·프로그램 등 진입 카드 배치

### 후보 A: 하단 네비게이션 추가
- 경로: `/ar`
- **장점**: 접근성 최고 — 앱 열자마자 보임. "새 기능" 임팩트 극대화.
- **단점**: 하단 네비 슬롯 추가 시 기존 레이아웃 재조정 필요 (5개→6개). 작은 화면에서 아이콘 밀집.

### 후보 B: 홈페이지 전용 카드 (가장 눈에 띄는 상단)
- 홈 히어로 바로 아래 "🎯 AR 수집 게임" 풀-width 카드
- 경로: `/ar`
- **장점**: 구조 변경 없음. 카드 디자인으로 "새 기능" 시각적 강조. 축제 끝나면 카드만 치우면 됨.
- **단점**: 홈 안 거치고 바로 AR로 진입하는 동선 없음 (딥링크로만).

### 후보 C: 스탬프 랠리 페이지 내부에서 진입
- `/stamp-rally` 하단에 "🎯 AR 포획 게임도 즐겨보세요" 배너
- 경로: `/ar`
- **장점**: 스탬프와의 연관성 강조. 두 보상 체계 모두 인지하게 함.
- **단점**: 스탬프 안 하는 유저는 못 봄. 진입 장벽 최고.

### 복합 권장
- **후보 B + 후보 C 병행**이 가장 자연스러움 (후보 A는 변경 범위 큼)
- 최종 결정: 사용자가 UX 우선순위에 따라 선택

---

## 2. 라우팅 경로 제안

### 유저 라우트 (Customer 모드 하위)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/ar` | 인트로·튜토리얼·권한 요청 | 메뉴 진입점 |
| `/ar/play` | 게임 본편 (카메라+3D+미니맵) | 권한 허용 후 이동 |
| `/ar/collection` | 내 도감 (폰 번호 form input) | **`/ar/collection/:phone` 금지** (§분석 8) |
| `/ar/rewards` | AR 보상 코드 조회·현장 사용 | 폰 번호 입력 |
| `/ar/fallback` | Level 4 대체 경로 (미지원 단말) | iOS 16.4 미만 등 |
| `/ar-tech-test` | Phase 0 실기 검증 페이지 | `import.meta.env.DEV` 조건부 등록 |

### 어드민 라우트 (Admin 모드 하위)

| 경로 | 화면 | 비고 |
|---|---|---|
| `/ar/settings` | 게임 설정 (단일 row 편집) | 멀티테넌트 없음 |
| `/ar/zones` | 구역 지도 편집 | Leaflet/MapLibre 후보 |
| `/ar/creatures` | 캐릭터 등록·3D 모델 업로드 | R2 Worker 프록시 |
| `/ar/stats` | 통계 대시보드 | Realtime 포획 현황 |
| `/ar/rewards` | AR 보상 관리 | `ar_rewards` 발급·조정 |
| `/ar/prize-claims` | 완주 경품 수령 | `ar_prize_claims` 별도 탭 |
| `/ar/attempts` | 부정 시도 분석 | `ar_capture_attempts` |

### 경로 충돌 주의
현재 Admin 라우트에 `/stamp-rally`, `/prize-claims`가 있음. AR도 유사 이름 쓰면 혼동 가능 → **AR 접두 유지 필수**.

---

## 3. 폴더 구조 제안

### 기존 구조 (참고)
```
src/
├── components/{ui,layout,admin}/
├── lib/{supabase, phone, coupons, stamps, prizeClaims, boothMonitor, ...}.ts
├── pages/
│   ├── {HomePage, StampRallyPage, CouponClaimPage, ...}.tsx
│   └── admin/{AdminStampRally, AdminCoupons, ...}.tsx
├── store/cartStore.tsx
├── styles/theme/tokens.css
└── types/database.ts
api/
├── _lib/
├── coupons/, payments/, orders/
```

### 후보 1: 플랫 (기존 컨벤션 답습)
```
src/
├── lib/
│   ├── ar.ts                ← AR 공통 (phone 기반 조회 등)
│   ├── arSpawn.ts           ← 스폰 요청·토큰 관리
│   ├── arCapture.ts         ← 포획 시도
│   ├── arCollection.ts      ← 도감 조회
│   └── arRewards.ts         ← AR 보상 검증·사용
├── pages/
│   ├── ArIntroPage.tsx
│   ├── ArPlayPage.tsx
│   ├── ArCollectionPage.tsx
│   ├── ArRewardsPage.tsx
│   ├── ArFallbackPage.tsx
│   ├── ArTechTestPage.tsx
│   └── admin/
│       ├── AdminArSettings.tsx
│       ├── AdminArZones.tsx
│       ├── AdminArCreatures.tsx
│       ├── AdminArStats.tsx
│       ├── AdminArRewards.tsx
│       ├── AdminArPrizeClaims.tsx
│       └── AdminArAttempts.tsx
api/
├── ar/
│   ├── spawn.ts, capture.ts, collection.ts, claim-prize.ts
│   └── rewards/validate.ts
└── admin/ar/{game, zones, creatures, stats, rewards, attempts}.ts
```
- **장점**: 기존 폴더 관행 100% 따름. 파일 탐색 쉬움.
- **단점**: `pages/` 폴더 파일 수 급증 (기존 15+ → 22+). 모듈 경계 흐려짐.

### 후보 2: `src/features/ar/` 모듈화
```
src/
├── features/ar/
│   ├── lib/              ← AR 전용 로직 (ar.ts, arSpawn, arCapture, ...)
│   ├── pages/            ← AR 페이지 (Intro, Play, Collection, ...)
│   ├── pages/admin/      ← AR 어드민 페이지
│   ├── components/       ← ArMiniMap, ArCreatureCard, ArDex 등 AR 전용 UI
│   ├── three/            ← Three.js 씬·로더 (dynamic import 타깃)
│   ├── hooks/            ← useGeolocation, useCameraStream, useDeviceOrientation
│   └── types.ts          ← AR 도메인 타입
api/
├── ar/ (동일)
```
- **장점**: AR 모듈이 독립 경계로 분리. 축제 끝나고 제거·포팅 쉬움. 번들 분리 힌트.
- **단점**: 기존 코드베이스에 `features/` 관행 없음 → 첫 사례가 됨. 향후 일관성 위해 다른 기능도 동일 구조로 전환 필요할 수 있음.

### 후보 3: 하이브리드 (lib는 플랫, pages/components는 폴더)
```
src/
├── lib/ar*.ts                 ← 기존 관행 따름 (ar.ts, arSpawn.ts, ...)
├── pages/ar/
│   ├── IntroPage.tsx
│   ├── PlayPage.tsx
│   ├── CollectionPage.tsx
│   └── admin/*.tsx
├── components/ar/             ← AR 전용 UI
└── three/                     ← dynamic import용 격리 폴더
```
- **장점**: lib 컨벤션 유지 + 페이지/컴포넌트만 폴더링. 절충안.
- **단점**: 한 모듈 코드가 두 레벨에 분산.

### 권장: **후보 2** — "코드 포크 방식 배포"(§브리프 1) 철학과 정합. 축제 끝나면 `src/features/ar/` 폴더만 들어내면 됨.

---

## 4. 재사용 컴포넌트 매핑

| 기존 자산 | AR 활용 | 파일 경로 |
|---|---|---|
| `Button`, `Input`, `Select` | 폰 번호 입력, 튜토리얼 버튼 | `src/components/ui/` |
| `Layout`, `Header`, `BottomNav` | `/ar/collection`, `/ar/rewards` 등 일반 페이지 | `src/components/layout/` |
| `Toast` | 포획 성공/실패 피드백 | `src/components/ui/Toast*` |
| `AdminLayout`, `AdminAlertContext` | AR 어드민 페이지 공통 | `src/components/admin/AdminLayout.tsx` |
| `ExcelButtons`, `Pagination` | 어드민 데이터 테이블 | `src/components/admin/` |
| `Modal` 패턴 | 권한 요청, 세션 타임아웃 복귀 | 기존 패턴 참조 |
| `tokens.css` 변수 | 색·타이포·간격 통일 | `src/styles/theme/tokens.css` |
| `normalizePhone`, `loadLastPhone` | 폰 번호 처리 | `src/lib/phone.ts` |
| `supabase` 인스턴스 | 모든 DB 접근 | `src/lib/supabase.ts` |
| `subscribeMonitor` 패턴 | AR 어드민 Realtime 포획 모니터링 | `src/lib/boothMonitor.ts` (참조) |
| `realtimeHealth` 재연결 로직 | AR Realtime 채널 건강성 | `src/lib/realtimeHealth.ts` |
| `CODE_ALPHABET` (0/1/O/I 제외) | AR 보상 코드 `AR-XXXXXX` 생성 | `src/lib/coupons.ts:21` |
| 23505 UNIQUE 충돌 처리 패턴 | 1인 1종 1회, 1인 1경품 | `src/lib/prizeClaims.ts:67–75` |

### 재사용 **불가** (침범 금지)
- `coupons` 테이블 / `/api/coupons/*` / `issued_source` enum / `MS-XXXXXX` 코드
- `stamp_prize_claims` 테이블 (AR은 `ar_prize_claims` 신규)
- `fetchAvailableCouponByPhone` 자동 적용 로직 (AR 보상은 별도 API)

---

## 5. API 파일 배치 + Vercel 제약 대응

### 유저 API
```
api/ar/
├── game.ts                    → GET /api/ar/game (단일 설정 조회)
├── zones.ts                   → GET /api/ar/zones
├── spawn.ts                   → POST /api/ar/spawn (token 발급)
├── capture.ts                 → POST /api/ar/capture (RPC 호출)
├── collection.ts              → POST /api/ar/collection (body: phone)
├── claim-prize.ts             → POST /api/ar/claim-prize
└── rewards/
    └── validate.ts            → POST /api/ar/rewards/validate
```

### 어드민 API
```
api/admin/ar/
├── game.ts                    → CRUD /api/admin/ar/game
├── zones.ts
├── creatures.ts
├── stats.ts
├── capture-attempts.ts
├── rewards.ts
└── prize-claims.ts
```

### Vercel 제약 대응 (§분석 11)
각 API 파일이 공유 헬퍼를 쓸 때 3가지 방식 중 택 1:

**방식 (a) — 함수 복사 (현재 GNfesta 관행)**
```typescript
// api/ar/capture.ts 내부에 spawn token 검증 함수 복사
async function consumeSpawnToken(supabase, token, phone) { ... }
```
장점: 관행 일치. 단점: 코드 중복.

**방식 (b) — `src/lib/` 순수 함수 사용**
```typescript
// src/lib/arSpawn.ts 에 pure function 작성
// api/ar/capture.ts 에서 import (Vite/Vercel이 번들 시 포함)
```
장점: 중복 제거. 단점: Vercel serverless 번들 크기 증가·런타임 이슈 가능성 (기존 관행이 복사인 이유).

**방식 (c) — Supabase RPC로 집중**
`capture_creature` RPC 안에서 토큰 검증·포획·보상 발급 전부 수행. API는 단순 프록시.
```typescript
// api/ar/capture.ts
const { data, error } = await supabase.rpc('capture_creature', { ... })
```
장점: 비즈니스 로직 DB 집중 → 원자성 보장, API 간 중복 최소. 단점: RPC 길어짐, 디버깅 난이도.

### **권장**: 방식 (c) 우선 + 필요한 경우 (a)
- 부정 방지·포획·보상 발급은 **RPC에서 원자 처리** (§브리프 6-1 명시)
- RPC로 해결 안 되는 얇은 공통 코드만 함수 복사

---

## 6. 신규 의존성

| 패키지 | 버전 예상 | 용도 | gzip 번들 영향 |
|---|---|---|---|
| `three` | ^0.170 | 3D 렌더링 | ~170KB |
| `three-stdlib` 또는 `GLTFLoader` | ^2.x | glTF 로더 | ~30KB |
| `meshopt_decoder` 또는 `draco_decoder` | — (WASM CDN) | 모델 압축 해제 | WASM 동적 로드 |
| `leaflet` 또는 `maplibre-gl` | 어드민만 | 존 편집 지도 | ~40KB (Leaflet) / ~200KB (MapLibre) |
| `@turf/turf` 또는 지오메트리 작은 서브셋 | — | 존 내부 판정 | ~30KB (서브셋 import) |

### 번들 전략
- **Three.js + 관련 모두 Dynamic Import** — `/ar/play` 진입 시에만 로딩
- **메인 번들 영향 0에 가깝게** (코드 스플리팅 경계 엄격)
- 어드민 지도는 `/admin/ar/zones` 페이지에서만 로딩

### Vite 설정 조정 예상
```typescript
// vite.config.ts — manualChunks로 three 분리
manualChunks: {
  three: ['three'],
  // ...
}
```
Phase 2에서 확정.

### 3D 에셋 서빙
- Cloudflare R2 버킷: `assets.gnfesta.kr` 같은 커스텀 도메인 권장
- DB `ar_creatures.model_url` 에 절대 URL 저장
- 브라우저 캐시: `Cache-Control: public, max-age=31536000, immutable` + 파일명 해시

---

## 7. 실기 테스트 페이지 (`/ar-tech-test`) 배치

- **파일**: `src/features/ar/pages/TechTestPage.tsx` (후보 2 기준) 또는 `src/pages/ArTechTestPage.tsx` (후보 1)
- **라우트 등록**: `src/App.tsx` Customer 라우트에 `import.meta.env.DEV` 조건부
  ```tsx
  {import.meta.env.DEV && <Route path="/ar-tech-test" element={<ArTechTestPage />} />}
  ```
- **의존성**: Three.js dynamic import. 진단 패널은 기존 tokens.css 변수만 사용.
- **CSS**: 전체화면 뷰 — `Layout` 컴포넌트 사용 안 함.

---

## 확정된 결정사항 (2026-04-17)

| 번호 | 항목 | 결정 |
|---|---|---|
| 1 | 메뉴 진입점 | **BottomNav 5번째 독립 슬롯** 추가 — 기존 메뉴 공간 미공유 |
| 1-a | 진입 명칭 | **"탐험"** (축제 탐험) — "게임" 등 직설적 표현 배제 |
| 1-b | 아이콘 | `Compass` (lucide-react) |
| 2 | 폴더 구조 | **후보 2 `src/features/ar/`** 모듈화 — 축제 종료 시 폴더 통째 제거 가능 |
| 3 | API 공유 로직 | **방식 (c) Supabase RPC 집중** — `capture_creature` 등 RPC가 검증·포획·보상 원자 처리 |

### Phase 1 적용 사항

- `BottomNav.tsx` 의 `NAV_ITEMS` 에 `{ label: '탐험', path: '/ar', icon: Compass, dimmed: false }` 추가
- `src/features/ar/` 디렉토리에 `lib/`, `pages/`, `three/`, `components/`, `hooks/` 서브 폴더 생성
- `capture_creature`, `claim_prize` 등 RPC 에서 비즈니스 로직 실행, API 파일은 RPC 프록시 역할만

---

*Phase 0 통합 설계 v1.0 — 2026-04-17*
