import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Text from '@/components/ui/Text'
import styles from './ArStub.module.css'

interface ArStubProps {
  title: string
  message: string
}

export default function ArStub({ title, message }: ArStubProps) {
  const navigate = useNavigate()
  return (
    <section className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)} aria-label="뒤로">
        <ArrowLeft size={20} />
      </button>
      <Text as="h1" variant="title" color="primary" align="center">
        {title}
      </Text>
      <Text variant="body" color="muted" align="center">
        {message}
      </Text>
    </section>
  )
}
