import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import AdminLayout from '@/components/admin/AdminLayout'
import HomePage from '@/pages/HomePage'
import SchedulePage from '@/pages/SchedulePage'
import LocationPage from '@/pages/LocationPage'
import NoticePage from '@/pages/NoticePage'
import NoticeDetailPage from '@/pages/NoticeDetailPage'
import SurveyPage from '@/pages/SurveyPage'
import CartPage from '@/pages/CartPage'
import CheckoutPage from '@/pages/CheckoutPage'
import CheckoutSuccessPage from '@/pages/CheckoutSuccessPage'
import CheckoutFailPage from '@/pages/CheckoutFailPage'
import OrderStatusPage from '@/pages/OrderStatusPage'
import CouponClaimPage from '@/pages/CouponClaimPage'
import StampRallyPage from '@/pages/StampRallyPage'
import ComingSoonPage from '@/pages/ComingSoonPage'
import { isDevMode } from '@/config/flags'
import FestivalPage from '@/pages/program/FestivalPage'
import AdminRevenue from '@/pages/admin/AdminRevenue'
import AdminSurvey from '@/pages/admin/AdminSurvey'
import AdminContentDetail from '@/pages/admin/AdminContentDetail'
import AdminFood from '@/pages/admin/AdminFood'
import AdminBoothAccounts from '@/pages/admin/AdminBoothAccounts'
import AdminMonitor from '@/pages/admin/AdminMonitor'
import AdminOrders from '@/pages/admin/AdminOrders'
import AdminCoupons from '@/pages/admin/AdminCoupons'
import AdminNotices from '@/pages/admin/AdminNotices'
import AdminQrCodes from '@/pages/admin/AdminQrCodes'
import AdminProgramQrCodes from '@/pages/admin/AdminProgramQrCodes'
import AdminPrizeClaims from '@/pages/admin/AdminPrizeClaims'
import AdminStampRally from '@/pages/admin/AdminStampRally'
import AdminArSettings from '@/features/ar/pages/admin/AdminArSettings'
import AdminArZones from '@/features/ar/pages/admin/AdminArZones'
import AdminArCreatures from '@/features/ar/pages/admin/AdminArCreatures'
import AdminArStats from '@/features/ar/pages/admin/AdminArStats'
import AdminArRewards from '@/features/ar/pages/admin/AdminArRewards'
import AdminArPrizeClaims from '@/features/ar/pages/admin/AdminArPrizeClaims'
import AdminArAttempts from '@/features/ar/pages/admin/AdminArAttempts'
import BoothLoginPage from '@/pages/booth/BoothLoginPage'
import BoothDashboardPage from '@/pages/booth/BoothDashboardPage'
import FloatingInstallButton from '@/components/pwa/FloatingInstallButton'
import { CartProvider } from '@/store/cartStore'
import { ToastProvider } from '@/components/ui/Toast'

// Phase 1 — AR 정식 라우트 (전부 lazy import, Three.js 청크 격리)
const ArIntroPage = lazy(() => import('@/features/ar/pages/IntroPage'))
const ArPlayPage = lazy(() => import('@/features/ar/pages/PlayPage'))
const ArCollectionPage = lazy(() => import('@/features/ar/pages/CollectionPage'))
const ArRewardsPage = lazy(() => import('@/features/ar/pages/RewardsPage'))
const ArFallbackPage = lazy(() => import('@/features/ar/pages/FallbackPage'))

// Phase 0 — AR 기술 검증 페이지. Phase 2 에서 isDevMode 가드로 전환.
// - 로컬 dev + gnfesta-dev 배포에서 접근 가능, 프로덕션 배포는 VITE_DEV_MODE 미설정으로 차단
// - 가드를 inline 으로 작성해 Vite 의 define 치환 → Rolldown DCE 가 orphan chunk 까지 제거하도록 유도
//   (`isDevMode` 변수 경유 시 Rolldown 이 import() 를 별도 청크로 먼저 확정하여 DCE 후에도 잔존)
const ArTechTestPage = import.meta.env.VITE_DEV_MODE === 'true'
  ? lazy(() => import('@/features/ar/pages/TechTestPage'))
  : null

/**
 * Hostname 기반 앱 모드 분기.
 * - booth.* or *-booth.* → 가맹점 운영용 (태블릿)
 * - admin.* or *-admin.* → 운영자 어드민
 * - 그 외 → 손님용 (PWA)
 *
 * dev  : booth.localhost:5173 / admin.localhost:5173 / localhost:5173
 * prod : booth.gnfesta.com / admin.gnfesta.com / gnfesta.com (추후 커스텀 도메인)
 * vercel: gnfesta.vercel.app (Vercel 기본 도메인 — 손님 모드만 매칭)
 */
type AppMode = 'booth' | 'admin' | 'customer'

function getAppMode(): AppMode {
  if (typeof window === 'undefined') return 'customer'
  const host = window.location.hostname.toLowerCase()
  if (host.startsWith('booth.') || host.includes('-booth.')) return 'booth'
  if (host.startsWith('admin.') || host.includes('-admin.')) return 'admin'
  return 'customer'
}

const APP_MODE: AppMode = getAppMode()

function BoothRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<BoothLoginPage />} />
      <Route path="/dashboard" element={<BoothDashboardPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to="/notices" replace />} />
        <Route path="notices" element={<AdminNotices />} />
        <Route path="coupons" element={<AdminCoupons />} />
        <Route path="prize-claims" element={<AdminPrizeClaims />} />
        <Route path="stamp-rally" element={<AdminStampRally />} />
        <Route path="revenue" element={<AdminRevenue />} />
        <Route path="survey" element={<AdminSurvey />} />
        <Route path="content/gnfesta" element={<AdminContentDetail slug="gnfesta" />} />
        <Route path="content/food" element={<AdminContentDetail slug="food" />} />
        <Route path="food" element={<AdminFood />} />
        <Route path="booth-accounts" element={<AdminBoothAccounts />} />
        <Route path="monitor" element={<AdminMonitor />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="qrcodes" element={<AdminQrCodes />} />
        <Route path="program-qrcodes" element={<AdminProgramQrCodes />} />
        {/* AR 게임 관리 — Phase 1 스텁. 실제 UI 는 Phase 6 */}
        <Route path="ar/settings" element={<AdminArSettings />} />
        <Route path="ar/zones" element={<AdminArZones />} />
        <Route path="ar/creatures" element={<AdminArCreatures />} />
        <Route path="ar/stats" element={<AdminArStats />} />
        <Route path="ar/rewards" element={<AdminArRewards />} />
        <Route path="ar/prize-claims" element={<AdminArPrizeClaims />} />
        <Route path="ar/attempts" element={<AdminArAttempts />} />
      </Route>
      <Route path="*" element={<Navigate to="/notices" replace />} />
    </Routes>
  )
}

function CustomerRoutes() {
  return (
    <Routes>
      {/* Home (standalone: hero + footer) */}
      <Route path="/" element={<HomePage />} />

      {/* AR tech test — isDevMode 전용 (프로덕션 번들·라우트 모두 제외) */}
      {isDevMode && ArTechTestPage && (
        <Route
          path="/ar-tech-test"
          element={
            <Suspense fallback={null}>
              <ArTechTestPage />
            </Suspense>
          }
        />
      )}

      {/* AR 정식 라우트 — 인트로 · 게임 · 도감 · 보상 · 폴백 */}
      <Route
        path="/ar"
        element={
          <Suspense fallback={null}>
            <ArIntroPage />
          </Suspense>
        }
      />
      <Route
        path="/ar/play"
        element={
          <Suspense fallback={null}>
            <ArPlayPage />
          </Suspense>
        }
      />
      <Route
        path="/ar/collection"
        element={
          <Suspense fallback={null}>
            <ArCollectionPage />
          </Suspense>
        }
      />
      <Route
        path="/ar/rewards"
        element={
          <Suspense fallback={null}>
            <ArRewardsPage />
          </Suspense>
        }
      />
      <Route
        path="/ar/fallback"
        element={
          <Suspense fallback={null}>
            <ArFallbackPage />
          </Suspense>
        }
      />

      {/* User */}
      <Route element={<Layout />}>
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/survey" element={<SurveyPage />} />
        <Route path="/location" element={isDevMode ? <LocationPage /> : <ComingSoonPage />} />
        <Route path="/notice" element={<NoticePage />} />
        <Route path="/notice/:id" element={<NoticeDetailPage />} />
        <Route path="/cart" element={isDevMode ? <CartPage /> : <ComingSoonPage />} />
        <Route path="/checkout" element={isDevMode ? <CheckoutPage /> : <ComingSoonPage />} />
        <Route path="/checkout/success" element={isDevMode ? <CheckoutSuccessPage /> : <ComingSoonPage />} />
        <Route path="/checkout/fail" element={isDevMode ? <CheckoutFailPage /> : <ComingSoonPage />} />
        <Route path="/order/:id" element={isDevMode ? <OrderStatusPage /> : <ComingSoonPage />} />
        {/* Festival 페이지: gnfesta(메인) / food(내부 섹션) — 같은 컴포넌트 공유 */}
        <Route path="/program/gnfesta" element={<FestivalPage slug="gnfesta" />} />
        <Route path="/program/food" element={isDevMode ? <FestivalPage slug="food" /> : <ComingSoonPage />} />
        <Route path="/stamp-rally" element={<StampRallyPage />} />
        <Route path="/coupon/claim" element={isDevMode ? <CouponClaimPage /> : <ComingSoonPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <CartProvider>
        <BrowserRouter>
          {APP_MODE === 'customer' && <FloatingInstallButton />}
          {APP_MODE === 'booth' && <BoothRoutes />}
          {APP_MODE === 'admin' && <AdminRoutes />}
          {APP_MODE === 'customer' && <CustomerRoutes />}
        </BrowserRouter>
      </CartProvider>
    </ToastProvider>
  )
}
