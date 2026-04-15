import PageTitle from '@/components/layout/PageTitle'
import styles from './LocationSection.module.css'

export default function LocationSection() {
  return (
    <section id="location" className={styles.location}>
      <PageTitle
        title="오시는 길"
        description="장소 정보 준비 중입니다."
      />
      <div className={styles.container}>
        <div className={styles.mapPlaceholder}>
          <p>지도와 장소 상세는 준비 중입니다.</p>
        </div>
      </div>
    </section>
  )
}
