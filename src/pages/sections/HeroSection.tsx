import { Link } from 'react-router-dom'
import { isDevMode } from '@/config/flags'
import styles from './HeroSection.module.css'

type Align = 'left' | 'right'

interface Marker {
  top: string
  align: Align
  /** 좌/우 가장자리에서의 offset (예: '5%'). 미지정 시 .left/.right 클래스 기본값 사용 */
  inset?: string
  date: string
  title: string[]
  to: string
}

// TODO(dummy): 강릉봄푸드페스타 실제 일정/섹션 확정 전까지 더미 콘텐츠로 유지.
// 원본 무산 프로젝트의 4-마커 레이아웃(개막식 / 음식페스티벌 / 청소년축전 / 폐막식)을 그대로 계승.
const markers: Marker[] = [
  {
    top: '33.8%',
    align: 'left',
    inset: '7%',
    date: '일정 미정',
    title: ['개막식'],
    to: '/program/gnfesta',
  },
  {
    top: '60.8%',
    align: 'left',
    date: '일정 미정',
    title: ['푸드부스', '참여매장'],
    to: '/program/food',
  },
  {
    top: '47.3%',
    align: 'right',
    date: '일정 미정',
    title: ['강릉봄', '푸드페스타'],
    to: '/program/gnfesta',
  },
  {
    top: '74.3%',
    align: 'right',
    inset: '7%',
    date: '일정 미정',
    title: ['폐막식'],
    to: '/program/gnfesta',
  },
]

export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <img src="/images/home_bg.png" alt="" className={styles.bg} />
      <img
        src="/images/home_title.png"
        alt="2026 강릉봄푸드페스타"
        className={styles.title}
      />
      <img src="/images/home_logo.png" alt="" className={styles.logo} />
      <div className={styles.info}>
        <span className={styles.infoLine}>
          강릉, 봄을 빚다 — 한 입 베어물면, 강릉의 봄 바다가 눈앞에 펼쳐집니다
        </span>
      </div>
      <div className={styles.markers}>
        {markers.map((m, i) => {
          const dimmed = !isDevMode && m.to === '/program/food'
          return (
            <Link
              key={i}
              to={m.to}
              className={`${styles.marker} ${styles[m.align]} ${
                dimmed ? styles.markerDimmed : ''
              }`}
              style={{
                top: m.top,
                ...(m.inset ? { [m.align]: m.inset } : null),
              }}
            >
              <span className={styles.date}>{m.date}</span>
              {m.title.map((line, i) => (
                <span key={i} className={styles.name}>
                  {line}
                </span>
              ))}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
