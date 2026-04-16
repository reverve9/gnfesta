import { useLocation, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, Sparkles, Stamp } from 'lucide-react'
import { isDevMode } from '@/config/flags'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  { label: '홈', path: '/', icon: Home, dimmed: false },
  { label: '강릉봄푸드페스타', path: '/program/gnfesta', icon: CalendarDays, dimmed: false },
  { label: '푸드부스', path: '/program/food', icon: Sparkles, dimmed: !isDevMode },
  { label: '스탬프 랠리', path: '/stamp-rally', icon: Stamp, dimmed: false },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className={styles.wrapper}>
      <nav className={styles.nav}>
        <div className={styles.inner}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path)
            const Icon = item.icon

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`${styles.item} ${isActive ? styles.active : ''} ${
                  item.dimmed ? styles.dimmed : ''
                }`}
              >
                <Icon className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
