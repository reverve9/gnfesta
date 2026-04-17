import styles from './AdminArStub.module.css'

interface AdminArStubProps {
  title: string
  phase: string
}

export default function AdminArStub({ title, phase }: AdminArStubProps) {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>{phase} 에서 구현 예정.</p>
    </section>
  )
}
