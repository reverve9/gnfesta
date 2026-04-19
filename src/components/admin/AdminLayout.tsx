import { Sparkles, Cake, Megaphone, Store, Key, Signal, ChartColumn, ClipboardList, ReceiptText, Ticket, QrCode, Gift, Stamp, LogOut, Compass, Settings, BarChart3, Trophy, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import ConnectionBanner from '@/components/ui/ConnectionBanner'
import { AdminAlertProvider, useAdminAlert } from './AdminAlertContext'
import styles from './AdminLayout.module.css'

const MONITOR_PATH = '/monitor'

type AdminRole = 'superadmin' | 'admin'

interface NavItem {
  label: string
  path: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  end?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '운영',
    items: [
      { label: '공지사항 관리', path: '/notices', icon: Megaphone },
      { label: '쿠폰 관리', path: '/coupons', icon: Ticket },
      { label: '매출 관리', path: '/revenue', icon: ChartColumn },
      { label: '만족도조사 관리', path: '/survey', icon: ClipboardList },
    ],
  },
  {
    title: '콘텐츠',
    items: [
      { label: '강릉봄푸드페스타', path: '/content/gnfesta', icon: Sparkles },
      { label: '푸드부스 콘텐츠', path: '/content/food', icon: Cake },
    ],
  },
  {
    title: 'AR 게임 관리',
    items: [
      { label: '게임 설정', path: '/ar/settings', icon: Settings },
      { label: '캐릭터 관리', path: '/ar/creatures', icon: Compass },
      { label: 'AR 통계', path: '/ar/stats', icon: BarChart3 },
      { label: 'AR 보상 관리', path: '/ar/rewards', icon: Ticket },
      { label: '경품 수령 관리', path: '/ar/prize-claims', icon: Trophy },
      { label: '부정 시도 분석', path: '/ar/attempts', icon: ShieldAlert },
    ],
  },
  {
    title: '매장 관리',
    items: [
      { label: '실시간 모니터', path: MONITOR_PATH, icon: Signal },
      { label: '주문/결제 관리', path: '/orders', icon: ReceiptText },
      { label: '참여 매장 관리', path: '/food', icon: Store },
      { label: '매장 계정 관리', path: '/booth-accounts', icon: Key },
      { label: '부스 QR 코드', path: '/qrcodes', icon: QrCode },
    ],
  },
  {
    title: '스탬프 랠리',
    items: [
      { label: '프로그램 관리', path: '/stamp-rally', icon: Stamp },
      { label: '경품 수령 관리', path: '/prize-claims', icon: Gift },
    ],
  },
  {
    title: '설정',
    items: [],
  },
]

const ACCOUNTS: { id: string; pw: string; role: AdminRole }[] = [
  { id: 'gnfesta', pw: '123456', role: 'superadmin' },
  { id: 'admin', pw: 'GN2026!', role: 'admin' },
]

/** admin 역할이 접근 가능한 경로 목록 */
const ADMIN_ALLOWED_PATHS = ['/monitor', '/orders', '/prize-claims']

function getStoredRole(): AdminRole | null {
  const v = sessionStorage.getItem('admin_role')
  if (v === 'superadmin' || v === 'admin') return v
  return null
}

function isAuthenticated() {
  return sessionStorage.getItem('admin_auth') === 'true' && getStoredRole() !== null
}

function getVisibleGroups(role: AdminRole): NavGroup[] {
  if (role === 'superadmin') return NAV_GROUPS
  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => ADMIN_ALLOWED_PATHS.includes(item.path)),
    }))
    .filter((g) => g.items.length > 0)
}

function getDefaultPath(role: AdminRole): string {
  return role === 'superadmin' ? '/notices' : '/monitor'
}

function isPathAllowed(role: AdminRole, pathname: string): boolean {
  if (role === 'superadmin') return true
  return ADMIN_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(isAuthenticated)
  const [role, setRole] = useState<AdminRole | null>(getStoredRole)
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)

  const handleLogin = () => {
    const account = ACCOUNTS.find((a) => a.id === id && a.pw === pw)
    if (account) {
      sessionStorage.setItem('admin_auth', 'true')
      sessionStorage.setItem('admin_role', account.role)
      setRole(account.role)
      setAuthed(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth')
    sessionStorage.removeItem('admin_role')
    setAuthed(false)
    setRole(null)
    setId('')
    setPw('')
  }

  if (!authed) {
    return (
      <div className={styles.loginOverlay}>
        <div className={styles.loginModal}>
          <h2 className={styles.loginTitle}>관리자 로그인</h2>
          <p className={styles.loginSub}>강릉봄푸드페스타 관리 페이지</p>
          <form
            className={styles.loginForm}
            onSubmit={(e) => { e.preventDefault(); handleLogin() }}
          >
            <input
              className={styles.loginInput}
              type="text"
              placeholder="아이디"
              value={id}
              onChange={(e) => { setId(e.target.value); setError(false) }}
              autoFocus
            />
            <input
              className={styles.loginInput}
              type="password"
              placeholder="비밀번호"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError(false) }}
            />
            {error && <p className={styles.loginError}>아이디 또는 비밀번호가 일치하지 않습니다.</p>}
            <button className={styles.loginBtn} type="submit">로그인</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <AdminAlertProvider>
      <AdminLayoutInner navigate={navigate} onLogout={handleLogout} role={role!} />
    </AdminAlertProvider>
  )
}

interface AdminLayoutInnerProps {
  navigate: ReturnType<typeof useNavigate>
  onLogout: () => void
  role: AdminRole
}

function AdminLayoutInner({ navigate, onLogout, role }: AdminLayoutInnerProps) {
  const { alertCount, warnCount, totalPending, overdueCount } = useAdminAlert()
  const location = useLocation()
  const visibleGroups = getVisibleGroups(role)
  const defaultPath = getDefaultPath(role)

  // document.title 동적 변경 — 미확인 주문 있으면 prefix `(N) `
  useEffect(() => {
    const BASE = '강릉봄푸드페스타 어드민'
    if (totalPending > 0) {
      document.title = `(${totalPending}) 실시간 모니터 · ${BASE}`
    } else {
      document.title = BASE
    }
    return () => {
      document.title = BASE
    }
  }, [totalPending])

  // 권한 없는 경로 접근 시 리다이렉트
  if (!isPathAllowed(role, location.pathname)) {
    return <Navigate to={defaultPath} replace />
  }

  return (
    <div className={styles.layout}>
      <ConnectionBanner />
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate(defaultPath)}>
          강릉봄푸드페스타
          <span className={styles.badge}>{role === 'superadmin' ? 'Super Admin' : 'Admin'}</span>
        </div>
        <nav className={styles.nav}>
          {visibleGroups.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon
                const isMonitor = item.path === MONITOR_PATH
                const badgeCount = isMonitor ? totalPending + overdueCount : 0
                const badgeTone = isMonitor
                  ? alertCount > 0
                    ? 'alert'
                    : warnCount > 0
                      ? 'warn'
                      : overdueCount > 0
                        ? 'overdue'
                        : 'pending'
                  : 'pending'
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                    }
                  >
                    <Icon className={styles.navIcon} />
                    <span>{item.label}</span>
                    {isMonitor && badgeCount > 0 && (
                      <span
                        className={`${styles.navBadge} ${
                          badgeTone === 'alert'
                            ? styles.navBadgeAlert
                            : badgeTone === 'warn'
                              ? styles.navBadgeWarn
                              : badgeTone === 'overdue'
                                ? styles.navBadgeOverdue
                                : styles.navBadgePending
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={onLogout}>
            <LogOut className={styles.navIcon} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
