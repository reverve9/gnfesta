import styles from './BrandLogo.module.css'

type Size = 'sm' | 'md' | 'lg'

interface Props {
  size?: Size
  inverse?: boolean
  className?: string
}

/**
 * GNfesta 텍스트 로고 — 무산 시절 이미지 로고(header_logo/home_title)를 대체.
 * 국문 '강릉, 봄을 빚다' + 영문 'Gangneung Spring Food FESTA'.
 * 실제 로고 이미지 준비되면 이 컴포넌트만 이미지 버전으로 교체.
 */
export default function BrandLogo({ size = 'md', inverse = false, className }: Props) {
  return (
    <span
      className={[
        styles.logo,
        styles[size],
        inverse ? styles.inverse : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.korean}>강릉, 봄을 빚다</span>
      <span className={styles.english}>Gangneung Spring Food FESTA</span>
    </span>
  )
}
