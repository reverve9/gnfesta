import RadioGroup from '@/components/ui/RadioGroup'
import Checkbox from '@/components/ui/Checkbox'
import type { SurveyFormData } from './SurveyForm'
import {
  YES_NO_OPTIONS,
  DECISION_MAKER_OPTIONS,
  INFO_SOURCE_OPTIONS,
  EXPECTATION_OPTIONS,
} from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function SurveyStep2Experience({ form, updateForm, onNext, onPrev }: Props) {
  const toggleInfoSource = (value: string) => {
    const next = form.q7.includes(value)
      ? form.q7.filter((v) => v !== value)
      : [...form.q7, value]
    updateForm({ q7: next })
  }

  const canNext =
    form.q5 !== '' &&
    form.q6 !== '' &&
    form.q7.length > 0 &&
    form.q8 !== ''

  return (
    <div className={styles.step}>
      {/* Q5~Q6 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Ⅱ. 참여 행태</h3>
        <div className={styles.fieldsDense}>
          <RadioGroup
            label="5. 올해를 제외하고 과거에 강릉 로컬푸드 관련 행사에 참여하신 경험이 있으십니까?"
            required
            options={YES_NO_OPTIONS}
            value={form.q5}
            onChange={(value) => updateForm({ q5: value })}
          />
          <RadioGroup
            label="6. 이번 행사 참여는 누가 결정하셨습니까?"
            required
            options={DECISION_MAKER_OPTIONS}
            value={form.q6}
            onChange={(value) => updateForm({ q6: value })}
          />
        </div>
      </div>

      {/* Q7: 복수선택 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          7. 이번 행사에 대한 정보를 어떻게 알게 되셨습니까?
        </h3>
        <p className={styles.cardSubtitle}>복수응답 가능</p>
        <div className={styles.fields}>
          {INFO_SOURCE_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              label={opt.label}
              checked={form.q7.includes(opt.value)}
              onChange={() => toggleInfoSource(opt.value)}
            />
          ))}
        </div>
      </div>

      {/* Q8 */}
      <div className={styles.card}>
        <RadioGroup
          label="8. 이번 행사에 참여하기 전 가장 기대하셨던 부분은 무엇입니까?"
          required
          options={EXPECTATION_OPTIONS}
          value={form.q8}
          onChange={(value) => updateForm({ q8: value })}
        />
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
