# Phase 0 — GNfesta 코드베이스 분석 리포트

> 목적: AR 모듈이 추가될 기존 GNfesta 코드베이스의 구조·패턴·제약을 **파일 경로 + 코드 인용** 근거로 파악.
> Phase 1~7 구현의 기반 문서. 추측 배제, 실제 코드만.

---

## 1. 빌드/런타임 스택

**파일**: `package.json`

```json
"type": "module",
"scripts": { "dev": "vite", "build": "tsc -b && vite build", ... }
"dependencies": {
  "react": "^19.2.4",
  "react-dom": "^19.2.4",
  "react-router-dom": "^7.13.1",
  "@supabase/supabase-js": "^2.99.2",
  "@tosspayments/payment-sdk": "^1.9.2",
  "lucide-react": "...",
  ...
}
"devDependencies": { "typescript": "~5.9.3", "vite": "^8.0.0", ... }
```

- 프레임워크: **Vite 8 + React 19 + TypeScript 5.9**
- 라우터: **react-router-dom 7**
- HTTP: 네이티브 `fetch` (Axios 등 없음)
- UI 아이콘: `lucide-react`
- ES Modules (`"type": "module"`)

---

## 2. 라우팅

**파일**: `src/App.tsx`

### 호스트명 기반 모드 분기 (App.tsx:40–57)

```typescript
type AppMode = 'booth' | 'admin' | 'customer'

function getAppMode(): AppMode {
  const host = window.location.hostname.toLowerCase()
  if (host.startsWith('booth.') || host.includes('-booth.')) return 'booth'
  if (host.startsWith('admin.') || host.includes('-admin.')) return 'admin'
  return 'customer'
}
```

### 모드별 라우트 트리 (App.tsx:61–122)

**Customer** (기본 도메인 / `gnfesta.com`):
- `/`, `/schedule`, `/survey`, `/location`, `/notice`, `/notice/:id`
- `/cart`, `/checkout`, `/checkout/success`, `/checkout/fail`, `/order/:id`
- `/program/gnfesta`, `/program/food`
- `/stamp-rally`, `/coupon/claim`

**Admin** (`admin.*`):
- `/notices`, `/coupons`, `/prize-claims`, `/stamp-rally`, `/revenue`, `/survey`
- `/monitor`, `/orders`, `/food`, `/booth-accounts`, `/qrcodes`, `/program-qrcodes`

**Booth** (`booth.*`):
- `/login`, `/dashboard`

> **AR 모듈 영향**: AR 유저 페이지는 Customer 라우트에, AR 어드민은 Admin 라우트에 추가. 호스트명 분기는 기존 함수 그대로 사용.

---

## 3. 상태 관리

**파일**: `src/store/cartStore.tsx`

```typescript
const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState)
  useEffect(() => { dispatch({ type: 'HYDRATE', items: loadFromStorage() }) }, [])
  useEffect(() => { if (!state.hydrated) return; saveToStorage(state.items) }, [state.items])
}
```

- **Redux/Zustand/React Query 없음**. Context + useReducer만 사용.
- 전역 상태는 장바구니뿐, 나머지는 페이지 로컬 `useState` + Supabase 직접 쿼리.
- 영속화: `localStorage` key `gnfesta-cart-v1`.

> **AR 모듈 영향**: AR 상태(현재 존, 발견 creature, 도감 등)도 같은 패턴(Context + useReducer + localStorage) 유지 권장. React Query 도입 시 의존성 추가 비용 발생.

---

## 4. API 호출 패턴

**파일**: `src/lib/coupons.ts:400–417`, `api/payments/confirm.ts:37–50`

### 공통 래퍼 없음 — 각 호출이 직접 `fetch`

```typescript
// coupons.ts - 클라이언트 검증 호출
const response = await fetch('/api/coupons/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: code.trim().toUpperCase(), subtotal }),
})
const json = await response.json().catch(() => ({}))
if (!response.ok) return { valid: false, error: json?.error || '쿠폰 검증 실패' }
```

### 에러 처리 관행
- HTTP status로 분기
- 에러 포맷: `{ error: string }` 또는 `{ message: string }`
- 래핑 없이 각 호출 사이트에서 try/catch 또는 `response.ok` 체크

### 인증 헤더
- **전화번호 기반**: phone은 **JSON body payload**로 전달 (URL path 아님)
- 쿠폰 발급: `api/coupons/issue-program.ts` body에 phone 전달
- Toss 결제: `Authorization: Basic base64(secretKey + ':')` (서버↔Toss만)

### Vercel Serverless 라우팅
- `api/` 디렉토리 구조 = 라우트 매핑 (예: `api/payments/confirm.ts` → `POST /api/payments/confirm`)
- `api/_lib/*` 는 라우트 엔드포인트 아닌 내부 헬퍼 (**단, 실제 import는 불가 — §11 참조**)

---

## 5. Supabase 연동

**파일**: `src/lib/supabase.ts:1–11`

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

### 환경변수 (`.env.example`)
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_TOSS_CLIENT_KEY=...
TOSS_SECRET_KEY=...
```

### RPC 호출 예시 (스탬프 조회) — `src/lib/stamps.ts:20–44`
```typescript
const { data: paymentRows } = await supabase
  .from('coupons')
  .select('id, booth_id, source_label, created_at')
  .eq('phone', normalized)
  .eq('issued_source', 'payment')
  .neq('status', 'cancelled')
  .order('created_at', { ascending: true })
```

### 경품 수령 예시 — `src/lib/prizeClaims.ts:67–75`
```typescript
const { error } = await supabase
  .from('stamp_prize_claims')
  .insert({ phone })
if (error) {
  if (error.code === '23505') throw new Error('이미 수령 처리된 번호입니다')
  throw new Error(`수령 처리 실패: ${error.message}`)
}
```
UNIQUE 충돌(23505) 코드를 이용한 "1인 1회" 처리 패턴 — **AR `ar_captures` / `ar_prize_claims`도 동일 패턴 적용**.

### Realtime 구독 예시 — `src/lib/boothMonitor.ts:143–161`
```typescript
export function subscribeMonitor(onChange: () => void, channelPrefix = 'admin-monitor') {
  const ordersChannel = supabase
    .channel(`${channelPrefix}-orders`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => onChange())
    .subscribe()
  return () => { void supabase.removeChannel(ordersChannel) }
}
```
어드민 모니터·부스 대시보드에서 사용. AR 어드민 대시보드에도 같은 패턴 적용 가능.

---

## 6. 인증/식별 (전화번호 기반)

**파일**: `src/lib/phone.ts`, `src/lib/clientId.ts`, `src/lib/boothAuth.ts`

### 전화번호 유틸 (`phone.ts:15–26`)
```typescript
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '').slice(0, 11)
}
```

### 전화번호 저장/조회 (`phone.ts:48–71`)
```typescript
const LAST_PHONE_KEY = 'gnfesta-last-phone-v1'

export function saveLastPhone(phone: string): void {
  if (isValidPhone(phone)) window.localStorage.setItem(LAST_PHONE_KEY, phone)
}

export function loadLastPhone(): string | null {
  const raw = window.localStorage.getItem(LAST_PHONE_KEY)
  return raw && isValidPhone(raw) ? raw : null
}
```

### 세션 저장 방식
- 고객앱: `localStorage` key `gnfesta-last-phone-v1`, `gnfesta.clientId`
- 부스앱: `localStorage` key `gnfesta-booth-session-v1`
- 어드민: `sessionStorage` keys `admin_auth`, `admin_role`

### 전역 조회
- 유저: `loadLastPhone()` 헬퍼 호출 (Context 아닌 함수 호출)
- 각 페이지가 독립적으로 phone 로드 → form input으로 재확인 가능

> **AR 모듈 영향**: 동일하게 `loadLastPhone()` 재사용. 신규 Context 불필요.

---

## 7. 디자인 시스템

**파일**: `src/styles/theme/tokens.css:7–62`

```css
:root {
  /* Brand */
  --color-primary: #387594;
  --color-primary-light: #4486A7;
  --color-accent: #D95028;

  /* Text / Surface */
  --color-bg: #FDFBF7;
  --color-surface: #FFFFFF;
  --color-text: #2C2C2C;
  --color-text-secondary: #6A6A6A;

  /* Status */
  --color-success: #2E7D32;
  --color-error: #C62828;
  --color-warning: #F9A825;

  /* Typography — CQW 기반 모바일 반응형 */
  --text-base: 3.421cqw;   /* 13px @380 */
  --text-lg:   3.947cqw;
  --text-2xl:  5.263cqw;

  /* Layout */
  --max-width: 600px;
  --header-height:     12.632cqw;
  --bottom-nav-height: 17.895cqw;

  /* Radius */
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}
```

### CSS 방식
- **CSS Modules (`*.module.css`) + CSS Variables** — Tailwind/styled-components 미사용
- CQW(Container Query Width) 기반 모바일 반응형 — 380px 기준 자동 스케일

### 공용 컴포넌트
- `src/components/ui/` — `Button`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Toast`
- `src/components/layout/` — `Header`, `Footer`, `Layout`, `BottomNav`, `PageTitle`
- `src/components/admin/` — `AdminLayout`, `ExcelButtons`, `Pagination`, `AdminAlertContext`

### Button 변형 (`Button.tsx:5–6`)
```typescript
type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg' | 'form'
```

> **AR 모듈 영향**: AR UI는 **CSS Modules + 기존 토큰** 재사용. Three.js는 별도 `<canvas>` — CSS 영향 없음. 다만 AR 화면은 전체화면 카메라라 `--max-width: 600px` 제약을 벗어나야 함(전용 Layout 만들거나 기존 Layout 예외 처리).

---

## 8. 기존 스탬프랠리 구현

### 파일 트리
```
src/
├── lib/
│   ├── stamps.ts          ← 내 스탬프 조회 (phone + clientId 병합)
│   ├── prizeClaims.ts     ← 경품 수령 관리 (stamp_prize_claims)
│   ├── phone.ts           ← 전화번호 유틸
│   └── clientId.ts        ← 익명 클라이언트 ID
└── pages/
    ├── StampRallyPage.tsx ← 고객용 스탬프 도감 UI
    └── admin/
        ├── AdminStampRally.tsx  ← 어드민 QR 관리
        └── AdminPrizeClaims.tsx ← 경품 수령 처리
```

### 스탬프 조회 (`stamps.ts:20–44`)
```typescript
export async function fetchMyStamps(phone: string): Promise<StampEntry[]> {
  const clientId = getClientId()
  const normalized = normalizePhone(phone)

  // 결제 기반 스탬프
  const { data: paymentRows } = await supabase
    .from('coupons')
    .select('id, booth_id, source_label, created_at')
    .eq('phone', normalized)
    .eq('issued_source', 'payment')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  // 프로그램 기반 스탬프
  let programRows = []
  if (clientId) {
    const { data } = await supabase
      .from('coupons')
      .select('...')
      .eq('client_id', clientId)
      .eq('issued_source', 'program')
      .neq('status', 'cancelled')
    programRows = data
  }
  // 병합 후 반환
}
```

### 도감 UI (`StampRallyPage.tsx:51–121`)
- 6개 슬롯 2열 그리드
- 각 슬롯: 부스 썸네일 이미지 or `Stamp` 아이콘
- 완주 시 "운영 부스에서 화면을 보여주세요" 메시지

### `stamp_prize_claims` 테이블 사용처
- `prizeClaims.ts:67–75` — `insert({ phone })` 원자 시도, 23505 중복 시 "이미 수령" 에러
- `AdminPrizeClaims.tsx` — 어드민이 완주자 확인 후 수령 처리

### **유저 식별 방식 (AR의 `/collection/:phone` 결정 근거)**
- URL path: `/stamp-rally` — **phone 포함 안 됨**
- 입력 UI: "전화번호로 내 스탬프 조회" form input
- localStorage의 `loadLastPhone()`으로 pre-fill
- DB 조회: `normalizePhone` 후 `phone` 컬럼 매칭

> **AR 결정**: `/collection/:phone` 경로 **사용 금지**. `/ar/collection` 경로에서 form input + `loadLastPhone()` 패턴 따름.

---

## 9. 기존 쿠폰 시스템 구현

**파일**: `api/coupons/validate.ts`, `api/coupons/issue-program.ts`, `src/lib/coupons.ts`

### Source 가드 (`api/coupons/validate.ts:65–66`)
```typescript
if (coupon.issued_source !== 'survey' && coupon.issued_source !== 'manual') {
  return res.status(400).json({ valid: false, error: '할인에 사용할 수 없는 쿠폰입니다' })
}
```
**`survey` 또는 `manual`만 할인 사용 가능**. `payment`/`program`은 스탬프 용도.

### 쿠폰 코드 생성 (`src/lib/coupons.ts:21`, `api/coupons/issue-program.ts:29–36`)
```typescript
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'  // 0/1/O/I 제외

function randomCode(): string {
  let s = ''
  for (let i = 0; i < 6; i += 1) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return `MS-${s}`
}
```

### 자동 적용 (`src/lib/coupons.ts:73–89`)
```typescript
export async function fetchAvailableCouponByPhone(phone: string): Promise<Coupon | null> {
  const { data } = await supabase
    .from('coupons')
    .select()
    .eq('phone', normalizePhone(phone))
    .in('issued_source', ['survey', 'manual'])
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}
```
체크아웃에서 phone 입력 시 자동 조회 → pre-fill.

### 상태 전이
- `active → used`: 결제 confirm 시점
- `used → active`: 전액 환불 + 만료 전

### 복원 로직 (`api/_lib/coupons.ts:37–54`, 실제 인라인 중복됨)
```typescript
await supabase.from('coupons').update({
  status: 'active', used_at: null, used_payment_id: null
}).eq('id', couponId).eq('status', 'used').gt('expires_at', new Date().toISOString())
```

> **AR 모듈 영향**: AR 보상(`ar_rewards`)은 이 로직 **전부 건드리지 않음**. `AR-XXXXXX` 코드 생성 함수와 검증 API는 **신규 별도 작성**. 기존 `CODE_ALPHABET` 상수만 참조/재사용 가능.

---

## 10. 어드민 구조

**파일**: `src/components/admin/AdminLayout.tsx`

### NAV_GROUPS (`AdminLayout.tsx:25–63`)
```typescript
const NAV_GROUPS: NavGroup[] = [
  { title: '운영',       items: [공지사항, 쿠폰, 매출, 만족도조사] },
  { title: '콘텐츠',     items: [강릉봄푸드페스타, 푸드부스] },
  { title: '매장 관리',  items: [실시간모니터, 주문결제, 참여매장, 계정, 부스QR] },
  { title: '스탬프 랠리', items: [프로그램관리, 경품수령] },
  { title: '설정',       items: [] },
]
```

### 역할 분리 (`AdminLayout.tsx:65–100`)
```typescript
const ACCOUNTS = [
  { id: 'gnfesta', pw: '123456', role: 'superadmin' },
  { id: 'admin',   pw: 'GN2026!', role: 'admin' },
]

const ADMIN_ALLOWED_PATHS = ['/monitor', '/orders', '/prize-claims']

function isPathAllowed(role: AdminRole, pathname: string): boolean {
  if (role === 'superadmin') return true
  return ADMIN_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
```

### 세션
- `sessionStorage` keys: `admin_auth`, `admin_role`
- 로그아웃 시 둘 다 제거

### 어드민 페이지 디렉토리
```
src/pages/admin/
├── AdminRevenue / AdminSurvey / AdminNotices / AdminCoupons
├── AdminPrizeClaims / AdminStampRally (스탬프 프로그램 관리)
├── AdminFood / AdminBoothAccounts / AdminMonitor / AdminOrders
├── AdminQrCodes / AdminProgramQrCodes / AdminContentDetail
└── stats/{StatsRevenueTab, StatsSurveyTab}.tsx
```

> **AR 모듈 영향**: AR 어드민 섹션은 `NAV_GROUPS`에 "AR 게임 관리" 그룹 신규 추가 (스탬프 랠리 옆). superadmin 전용 전제 — `ADMIN_ALLOWED_PATHS`에 AR 경로 추가 안 함.

---

## 11. Vercel 제약 실체

**파일**: `api/payments/cancel.ts`, `api/orders/cancel.ts`, `api/_lib/coupons.ts`

### 상대 임포트 불가 — 함수 **복사** 방식으로 우회

`api/_lib/coupons.ts`에 헬퍼 정의되어 있지만 실제로는 **사용되지 않음**. 각 라우트가 동일 함수를 **인라인 재작성**:

```typescript
// api/payments/cancel.ts:4–22 (인라인 복사)
async function cancelCouponsForOrders(supabase: SupabaseClient, orderIds: string[]) {
  if (orderIds.length === 0) return
  const { error } = await supabase
    .from('coupons').update({ status: 'cancelled' })
    .in('issued_from_order_id', orderIds).eq('status', 'active')
  if (error) console.warn('[cancelCouponsForOrders]', error)
}

async function restoreAppliedCouponIfPossible(supabase: SupabaseClient, couponId: string) {
  const { error } = await supabase
    .from('coupons').update({ status: 'active', used_at: null, used_payment_id: null })
    .eq('id', couponId).eq('status', 'used').gt('expires_at', new Date().toISOString())
  if (error) console.warn('[restoreAppliedCouponIfPossible]', error)
}
```

### 응답 선반환 + best-effort 후처리 (`api/payments/cancel.ts:198–207`)
```typescript
res.status(200).json({ ok: true, paymentId, tossResult: tossJson })

// 응답 후 best-effort 로 쿠폰 후처리 (실패해도 무시)
await Promise.allSettled([
  cancelCouponsForOrders(supabase, allOrderIds),
  payment.coupon_id
    ? restoreAppliedCouponIfPossible(supabase, payment.coupon_id)
    : Promise.resolve(),
])
```

### API 디렉토리
```
api/
├── _lib/coupons.ts         ← 참조용 헬퍼 (실제 import 안 됨)
├── payments/{confirm,cancel}.ts
├── coupons/{validate,issue-program}.ts
└── orders/cancel.ts
```

> **AR 모듈 영향**: AR API 함수(`api/ar/spawn.ts`, `api/ar/capture.ts` 등)가 공유 헬퍼(예: token 발급, spawn 결정)를 사용할 때 **각 파일에 함수 복사** 필요. 대안: `src/lib/` 에 순수 함수 작성 → 클라이언트만 import. 서버는 복사.

---

## ⚠️ Phase 1~7 구현 시 필수 유의사항

### 1. 전화번호는 전역 PII — URL Path 노출 금지
기존 스탬프 랠리도 `/stamp-rally` 경로만 쓰고 phone은 form input으로만 받음. AR의 `/collection/:phone` 같은 경로는 **설계 금지**.

### 2. Supabase snake_case 일관성
DB 컬럼·RPC 인자 모두 snake_case. TypeScript 타입은 camelCase로 자동 매핑. RLS 정책도 snake_case 기준.

### 3. Vercel Serverless — 함수 복사 필수
`api/` 파일 간 상대 임포트 불가 → 헬퍼 복사 관행. AR API에 공통 로직 넣을 때 동일 패턴.

### 4. localStorage 기반 phone 식별 — 크로스 디바이스 미지원
기기/브라우저 변경 시 phone 입력 재필요. AR 도감도 동일 전제.

### 5. Realtime 강제 재연결 로직
`src/lib/realtimeHealth.ts`: degraded 4초 이상 → 강제 disconnect+connect. AR 어드민 Realtime 구독 시 같은 헬퍼 재사용.

### 6. 어드민 비밀번호 하드코딩 상태
`AdminLayout.tsx:65–68`에 평문 비밀번호. 프로덕션 전 환경변수화 권장(별도 이슈).

### 7. 모바일 CQW 반응형
픽셀 하드코딩 금지, `cqw` 단위 사용. AR 전체화면 뷰는 `--max-width: 600px` 제약 벗어나야 함 — 전용 Layout 필요.

### 8. 23505 UNIQUE 충돌 패턴이 표준
`ar_captures`, `ar_prize_claims` 1인 1회 처리 시 동일 패턴 재사용.

---

*Phase 0 분석 리포트 v1.0 — 2026-04-17*
