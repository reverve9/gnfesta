import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepIndicator from './StepIndicator'
import SurveyStep1Basic from './SurveyStep1Basic'
import SurveyStep2Experience from './SurveyStep2Experience'
import SurveyStep3Evaluation from './SurveyStep3Evaluation'
import SurveyStep4Opinion from './SurveyStep4Opinion'
import { submitSurvey, hasSurveyDoneLocally, markSurveyDoneLocally } from '@/lib/survey'
import { DuplicateSurveyCouponError } from '@/lib/coupons'
import { normalizePhone } from '@/lib/phone'
import { AGE_GROUP_REPRESENTATIVE, IMAGE_ITEMS, Q10_ITEMS, Q11_ITEMS, Q12_ITEMS, Q15_ITEMS, Q16_ITEMS } from './questions'
import styles from './SurveyForm.module.css'

const TOTAL_STEPS = 4

export interface SurveyFormData {
  // Step 1 — 기본 정보
  gender: '' | 'male' | 'female' | 'other'
  ageGroup: string
  region: string
  companion: string
  name: string
  phone: string
  privacyConsented: boolean

  // Step 2 — 참여 행태 (Q5~Q8)
  q5: string
  q6: string
  q7: string[]
  q8: string

  // Step 3 — 프로그램 평가 (Q9~Q12)
  q9: Record<string, number | null>
  q10: Record<string, number | null>
  q11: Record<string, number | null>
  q12: Record<string, number | null>

  // Step 4 — 종합 + 재방문 + 의견 (Q13~Q18)
  q13: number | null
  q13_1: string
  q13_2: string
  q14: string
  q15: Record<string, number | null>
  q16: Record<string, number | null>
  q17: string[]
  q18: string
}

function initRecord(items: { key: string }[]): Record<string, number | null> {
  const rec: Record<string, number | null> = {}
  for (const it of items) rec[it.key] = null
  return rec
}

const INITIAL_FORM: SurveyFormData = {
  gender: '',
  ageGroup: '',
  region: '',
  companion: '',
  name: '',
  phone: '',
  privacyConsented: false,
  q5: '',
  q6: '',
  q7: [],
  q8: '',
  q9: initRecord(IMAGE_ITEMS),
  q10: initRecord(Q10_ITEMS),
  q11: initRecord(Q11_ITEMS),
  q12: initRecord(Q12_ITEMS),
  q13: null,
  q13_1: '',
  q13_2: '',
  q14: '',
  q15: initRecord(Q15_ITEMS),
  q16: initRecord(Q16_ITEMS),
  q17: [],
  q18: '',
}

export default function SurveyForm() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<SurveyFormData>(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [duplicateCoupon, setDuplicateCoupon] = useState(false)
  const [alreadyDone] = useState(() => hasSurveyDoneLocally())

  const updateForm = (updates: Partial<SurveyFormData>) => {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const answers: Record<string, unknown> = {
        ageGroup: form.ageGroup,
        companion: form.companion,
        q5: form.q5,
        q6: form.q6,
        q7: form.q7,
        q8: form.q8,
        q9: form.q9,
        q10: form.q10,
        q11: form.q11,
        q12: form.q12,
        q13: form.q13,
        q13_1: form.q13_1 || null,
        q13_2: form.q13_2 || null,
        q14: form.q14,
        q15: form.q15,
        q16: form.q16,
        q17: form.q17,
        q18: form.q18 || null,
      }

      await submitSurvey({
        festivalId: null,
        gender: form.gender as 'male' | 'female' | 'other',
        age: AGE_GROUP_REPRESENTATIVE[form.ageGroup] ?? 30,
        region: form.region,
        name: form.name,
        phone: normalizePhone(form.phone),
        privacyConsented: form.privacyConsented,
        answers,
      })

      markSurveyDoneLocally()
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err instanceof DuplicateSurveyCouponError) {
        setDuplicateCoupon(true)
      } else {
        const message = err instanceof Error ? err.message : '설문 제출에 실패했습니다.'
        setSubmitError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (alreadyDone) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}>&#10003;</div>
        <h3 className={styles.successTitle}>이미 설문에 참여하셨습니다</h3>
        <p className={styles.successDesc}>
          소중한 의견 감사합니다. 음식 주문 시 쿠폰이 자동 적용됩니다.
        </p>
        <button
          type="button"
          className={styles.successBtn}
          onClick={() => navigate('/program/food')}
        >
          음식 주문하러 가기
        </button>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}>&#10003;</div>
        <h3 className={styles.successTitle}>설문조사에 참여해 주셔서 감사합니다</h3>
        <p className={styles.successDesc}>
          귀하의 소중한 의견은 더 나은 행사를 만드는 데 소중하게 활용됩니다.
        </p>
        <div className={styles.couponNotice}>
          <div className={styles.couponNoticeTitle}>
            🎟 2,000원 할인 쿠폰이 발급되었습니다
          </div>
          <p className={styles.couponNoticeDesc}>
            음식 결제 시 입력하신 전화번호를 그대로 사용하면
            <br />
            쿠폰이 자동으로 적용됩니다.
          </p>
        </div>
        <button
          type="button"
          className={styles.successBtn}
          onClick={() => navigate('/program/food')}
        >
          음식 주문하러 가기
        </button>
      </div>
    )
  }

  return (
    <div className={styles.form}>
      {duplicateCoupon && (
        <div
          className={styles.modalOverlay}
          onClick={() => setDuplicateCoupon(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalIcon}>!</div>
            <h3 className={styles.modalTitle}>이미 쿠폰이 발급된 번호입니다</h3>
            <p className={styles.modalDesc}>
              입력하신 전화번호로 이미 설문조사 참여 쿠폰이 발급되어
              <br />
              추가 발급이 불가능합니다.
              <br />
              <br />
              음식 결제 시 해당 번호를 입력하면
              <br />
              쿠폰이 자동으로 적용됩니다.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalBtnSecondary}
                onClick={() => setDuplicateCoupon(false)}
              >
                닫기
              </button>
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={() => navigate('/program/food')}
              >
                음식 주문하러 가기
              </button>
            </div>
          </div>
        </div>
      )}
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 1 && (
        <SurveyStep1Basic
          form={form}
          updateForm={updateForm}
          onNext={handleNext}
        />
      )}
      {step === 2 && (
        <SurveyStep2Experience
          form={form}
          updateForm={updateForm}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
      {step === 3 && (
        <SurveyStep3Evaluation
          form={form}
          updateForm={updateForm}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      )}
      {step === 4 && (
        <SurveyStep4Opinion
          form={form}
          updateForm={updateForm}
          onPrev={handlePrev}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      )}
    </div>
  )
}
