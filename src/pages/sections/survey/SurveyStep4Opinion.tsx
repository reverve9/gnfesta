import RadioGroup from '@/components/ui/RadioGroup'
import Checkbox from '@/components/ui/Checkbox'
import LikertScale from '@/components/ui/LikertScale'
import Textarea from '@/components/ui/Textarea'
import type { SurveyFormData } from './SurveyForm'
import {
  SATISFACTION_5_OPTIONS,
  APPROPRIATE_5_OPTIONS,
  Q15_ITEMS,
  Q16_ITEMS,
  FUTURE_PROGRAM_OPTIONS,
} from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onPrev: () => void
  onSubmit: () => void
  submitting: boolean
  submitError: string | null
}

export default function SurveyStep4Opinion({
  form,
  updateForm,
  onPrev,
  onSubmit,
  submitting,
  submitError,
}: Props) {
  const updateQ15 = (key: string, value: number) => {
    updateForm({ q15: { ...form.q15, [key]: value } })
  }
  const updateQ16 = (key: string, value: number) => {
    updateForm({ q16: { ...form.q16, [key]: value } })
  }
  const toggleFutureProgram = (value: string) => {
    const next = form.q17.includes(value)
      ? form.q17.filter((v) => v !== value)
      : [...form.q17, value]
    updateForm({ q17: next })
  }

  const q13Value = form.q13
  const showDissatisfied = q13Value !== null && q13Value <= 2
  const showSatisfied = q13Value !== null && q13Value >= 4

  const canSubmit =
    form.q13 !== null &&
    (!showDissatisfied || form.q13_1.trim() !== '') &&
    (!showSatisfied || form.q13_2.trim() !== '') &&
    form.q14 !== '' &&
    Q15_ITEMS.every((item) => form.q15[item.key] !== null) &&
    Q16_ITEMS.every((item) => form.q16[item.key] !== null) &&
    form.q17.length > 0 &&
    !submitting

  return (
    <div className={styles.step}>
      {/* Q13: 종합 만족도 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Ⅳ. 종합 만족도</h3>
        <div className={styles.fieldsDense}>
          <RadioGroup
            label="13. 지금까지의 평가를 종합적으로 고려할 때, 이번 행사에 대해 전반적으로 얼마나 만족하십니까?"
            required
            options={SATISFACTION_5_OPTIONS}
            value={form.q13 !== null ? String(form.q13) : ''}
            onChange={(value) => updateForm({ q13: Number(value) })}
          />

          {showDissatisfied && (
            <div className={styles.subField}>
              <Textarea
                label="13-1. 행사에 만족하지 않으셨다면 그 이유는 무엇입니까?"
                required
                placeholder="의견을 자유롭게 작성해 주세요"
                value={form.q13_1}
                onChange={(e) => updateForm({ q13_1: e.target.value })}
              />
            </div>
          )}

          {showSatisfied && (
            <div className={styles.subField}>
              <Textarea
                label="13-2. 행사에 만족하셨다면 가장 좋았던 점은 무엇입니까?"
                required
                placeholder="의견을 자유롭게 작성해 주세요"
                value={form.q13_2}
                onChange={(e) => updateForm({ q13_2: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Q14: 운영시간 */}
      <div className={styles.card}>
        <RadioGroup
          label="14. 이번 행사의 전체 운영 시간(10:00~18:00)은 적절하였습니까?"
          required
          options={APPROPRIATE_5_OPTIONS}
          value={form.q14}
          onChange={(value) => updateForm({ q14: value })}
        />
      </div>

      {/* Q15: 재방문/추천 의향 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Ⅴ. 재방문 의향 및 행사 성과</h3>
        <p className={styles.cardSubtitle}>
          15. 다음은 행사 참여 및 추천 의향에 대한 문항입니다 (1~7점)
        </p>
        <div className={styles.fieldsDense}>
          {Q15_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q15[item.key]}
              onChange={(value) => updateQ15(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* Q16: 행사 성과 */}
      <div className={styles.card}>
        <p className={styles.cardSubtitle}>
          16. 다음은 행사의 성과에 대한 문항입니다 (1~7점)
        </p>
        <div className={styles.fieldsDense}>
          {Q16_ITEMS.map((item) => (
            <LikertScale
              key={item.key}
              label={item.label}
              required
              value={form.q16[item.key]}
              onChange={(value) => updateQ16(item.key, value)}
              leftLabel="전혀 그렇지 않다"
              rightLabel="매우 그렇다"
            />
          ))}
        </div>
      </div>

      {/* Q17: 향후 프로그램 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          17. 향후 참여를 원하시는 프로그램 유형을 선택해 주세요
        </h3>
        <p className={styles.cardSubtitle}>복수응답 가능</p>
        <div className={styles.fields}>
          {FUTURE_PROGRAM_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              label={opt.label}
              checked={form.q17.includes(opt.value)}
              onChange={() => toggleFutureProgram(opt.value)}
            />
          ))}
        </div>
      </div>

      {/* Q18: 자유 의견 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Ⅵ. 자유 의견</h3>
        <Textarea
          label="18. 행사에 대한 개선사항이나 하고 싶으신 말씀을 자유롭게 적어주세요"
          placeholder="행사 전반에 대한 의견, 불편사항, 건의사항 등을 자유롭게 작성해 주세요 (선택)"
          rows={5}
          value={form.q18}
          onChange={(e) => updateForm({ q18: e.target.value })}
        />
      </div>

      {submitError && <div className={styles.submitError}>{submitError}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.btnSecondary} onClick={onPrev}>
          이전
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!canSubmit && !import.meta.env.DEV}
          onClick={onSubmit}
        >
          {submitting ? '제출 중…' : '제출'}
        </button>
      </div>
    </div>
  )
}
