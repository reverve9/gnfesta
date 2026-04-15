import { AtSign, Mail, Phone } from 'lucide-react'
import Text from '@/components/ui/Text'
import BrandLogo from './BrandLogo'
import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.info}>
          <BrandLogo size="sm" />
          <Text variant="caption" color="secondary">
            강원특별자치도 강릉시 일원 (TBD)
          </Text>
        </div>
        <div className={styles.contact}>
          <Text variant="caption" weight="semibold" className={styles.sectionLabel}>
            문의처
          </Text>
          <div className={styles.contactList}>
            <div className={styles.contactRow}>
              <a href="tel:01000000000" className={styles.contactItem}>
                <Phone className={styles.contactIcon} aria-hidden="true" />
                <Text variant="caption" color="secondary" className={styles.contactText}>
                  010-0000-0000
                </Text>
              </a>
              <a href="mailto:hello@gnfesta.kr" className={styles.contactItem}>
                <Mail className={styles.contactIcon} aria-hidden="true" />
                <Text variant="caption" color="secondary" className={styles.contactTextEn}>
                  hello@gnfesta.kr
                </Text>
              </a>
            </div>
            <a
              href="https://instagram.com/gnfesta"
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.contactItem} ${styles.contactItemInsta}`}
            >
              <AtSign className={styles.contactIcon} aria-hidden="true" />
              <Text variant="caption" color="secondary" className={styles.contactTextEn}>
                @gnfesta
              </Text>
            </a>
          </div>
        </div>
        {/* TODO: 주최/주관/후원 로고 이미지 확정되면 복원. 현재는 Moosan 에셋이라 제거. */}
        <div className={styles.copyright}>
          <Text variant="caption" color="muted" className={styles.copyrightText}>
            &copy; 강릉봄푸드페스타 2026 All Rights Reserved
          </Text>
          <Text variant="caption" color="muted" className={styles.copyrightText}>
            Produced by MGTNC 2026
          </Text>
        </div>
      </div>
    </footer>
  )
}
