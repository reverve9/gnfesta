import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Compass, MapPin, Camera, Sparkles } from 'lucide-react'
import Text from '@/components/ui/Text'
import styles from './IntroPage.module.css'

// Phase 1 스텁 — 실제 ar_games.name · 권한 플로우는 Phase 2 에서 연동.
const TUTORIAL = [
  { icon: MapPin, title: '구역을 찾아가세요', desc: '축제장 곳곳에 숨어있는 구역에 다가가면 캐릭터가 나타납니다.' },
  { icon: Camera, title: '카메라를 켜세요',   desc: '카메라·위치 권한을 허용하면 화면에 AR 캐릭터가 등장합니다.' },
  { icon: Sparkles, title: '포획하고 수집하세요', desc: '캐릭터를 터치해 도감을 채우고, 수집 보상을 받으세요.' },
]

export default function IntroPage() {
  const navigate = useNavigate()
  return (
    <section className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)} aria-label="뒤로">
        <ArrowLeft size={20} />
      </button>

      <div className={styles.hero}>
        <Compass className={styles.heroIcon} strokeWidth={1.5} />
        <Text as="h1" variant="title" color="primary" align="center">
          AR 탐험
        </Text>
        <Text variant="body" color="muted" align="center">
          축제장을 돌며 AR 캐릭터를 찾고 수집해보세요.
        </Text>
      </div>

      <ol className={styles.steps}>
        {TUTORIAL.map(({ icon: Icon, title, desc }, i) => (
          <li key={i} className={styles.step}>
            <div className={styles.stepIcon}>
              <Icon size={22} strokeWidth={1.75} />
            </div>
            <div className={styles.stepBody}>
              <div className={styles.stepTitle}>{title}</div>
              <div className={styles.stepDesc}>{desc}</div>
            </div>
          </li>
        ))}
      </ol>

      <button className={styles.startBtn} onClick={() => navigate('/ar/play')}>
        시작하기
      </button>
    </section>
  )
}
