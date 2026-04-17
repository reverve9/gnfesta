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
import BoothLoginPage from '@/pages/booth/BoothLoginPage'
import BoothDashboardPage from '@/pages/booth/BoothDashboardPage'
import FloatingInstallButton from '@/components/pwa/FloatingInstallButton'
import { CartProvider } from '@/store/cartStore'
import { ToastProvider } from '@/components/ui/Toast'

// Phase 0 — AR 기술 검증 페이지 (URL 은폐 기반, dynamic import)
// 내부 팀만 URL(/ar-tech-test)을 아는 전제로 프로덕션에도 포함.
// Lazy import 라 방문 시에만 Three.js 청크 다운로드 — 일반 페이지 영향 없음.
// Phase 1 이후 정식 AR 라우트 생기면 이 페이지는 제거.
const ArTechTestPage = lazy(() => import('@/features/ar/pages/TechTestPage'))

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

      <Route
        path="/ar-tech-test"
        element={
          <Suspense fallback={null}>
            <ArTechTestPage />
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
