import BrandLogo from '@/components/layout/BrandLogo'
import styles from './HeroSection.module.css'

/**
 * 메인 페이지 히어로. 추후 확정 이미지(key visual)가 나오면 배경만 교체.
 * 현재는 Moosan 시절의 home_bg.png 를 플레이스홀더로 사용.
 * 마커(행사 지점) 는 제거 — 단일 축제 구조라 필요 없음.
 */
export default function HeroSection() {
  return (
    <section className={styles.hero}>
      <img src="/images/home_bg.png" alt="" className={styles.bg} aria-hidden="true" />
      <div className={styles.overlay}>
        <BrandLogo size="lg" inverse />
        <p className={styles.tagline}>
          한 입 베어물면, 강릉의 봄 바다가 눈앞에 펼쳐집니다
        </p>
      </div>
    </section>
  )
}
