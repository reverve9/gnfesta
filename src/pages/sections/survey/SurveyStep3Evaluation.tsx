import LikertScale from '@/components/ui/LikertScale'
import type { SurveyFormData } from './SurveyForm'
import { IMAGE_ITEMS, Q10_ITEMS, Q11_ITEMS, Q12_ITEMS } from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function SurveyStep3Evaluation({ form, updateForm, onNext, onPrev }: Props) {
  const updateQ9 = (key: string, value: number) => {
    updateForm({ q9: { ...form.q9, [key]: value } })
  }
  const updateQ10 = (key: string, value: number) => {
    updateForm({ q10: { ...form.q10, [key]: value } })
  }
  const updateQ11 = (key: string, value: number) => {
    updateForm({ q11: { ...form.q11, [key]: value } })
  }
  const updateQ12 = (key: string, value: number) => {
    updateForm({ q12: { ...form.q12, [key]: value } })
  }

  const canNext =
    IMAGE_ITEMS.every((item) => form.q9[item.key] !== null) &&
    Object.values(form.q10).some((v) => v !== null) &&
    Q11_ITEMS.every((item) => form.q11[item.key] !== null) &&
    Q12_ITEMS.every((item) => form.q12[item.key] !== null)

  return (
    <div className={styles.step}>
      {/* Q9: 행사 이미지 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>9. 이번 행사에 대한 전반적인 이미지를 평가해 주세요</h3>
        <p className={styles.cardSubtitle}>
          1점(왼쪽)부터 7점(오른쪽)이며, 해당하는 숫자에 표시해 주세요
        </p>
        <div className={styles.fieldsDense}>
          {IMAGE_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.left}
              required
              value={form.q9[item.key]}
              onChange={(value) => updateQ9(item.key, value)}
              leftLabel={item.left}
              rightLabel={item.right}
            />
          ))}
        </div>
      </div>

      {/* Q10: 프로그램 평가 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>10. 다음은 각 프로그램에 대한 평가입니다</h3>
        <p className={styles.cardSubtitle}>
          참여하신 프로그램에 한해 응답해 주세요 (1: 전혀 그렇지 않다 ~ 7: 매우 그렇다)
        </p>
        <div className={styles.fieldsDense}>
          {Q10_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              value={form.q10[item.key]}
              onChange={(value) => updateQ10(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* Q11: 운영 평가 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>11. 다음은 행사 운영에 대한 평가입니다</h3>
        <p className={styles.cardSubtitle}>
          1: 전혀 그렇지 않다 ~ 7: 매우 그렇다
        </p>
        <div className={styles.fieldsDense}>
          {Q11_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q11[item.key]}
              onChange={(value) => updateQ11(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* Q12: 주관기관 평가 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>12. 다음은 주관기관(강릉문화재단)에 대한 평가입니다</h3>
        <div className={styles.fieldsDense}>
          {Q12_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q12[item.key]}
              onChange={(value) => updateQ12(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.btnSecondary} onClick={onPrev}>
          이전
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!canNext && !import.meta.env.DEV}
          onClick={onNext}
        >
          다음
        </button>
      </div>
    </div>
  )
}
