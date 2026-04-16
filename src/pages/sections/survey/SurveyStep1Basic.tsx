import Input from '@/components/ui/Input'
import RadioGroup from '@/components/ui/RadioGroup'
import Checkbox from '@/components/ui/Checkbox'
import type { SurveyFormData } from './SurveyForm'
import {
  GENDER_OPTIONS,
  AGE_GROUP_OPTIONS,
  REGION_OPTIONS,
  COMPANION_OPTIONS,
} from './questions'
import styles from './SurveyForm.module.css'

interface Props {
  form: SurveyFormData
  updateForm: (updates: Partial<SurveyFormData>) => void
  onNext: () => void
}

export default function SurveyStep1Basic({ form, updateForm, onNext }: Props) {
  const canNext =
    form.gender !== '' &&
    form.ageGroup !== '' &&
    form.region !== '' &&
    form.companion !== '' &&
    form.name.trim() !== '' &&
    form.phone.trim() !== '' &&
    form.privacyConsented

  return (
    <div className={styles.step}>
      {/* 안내 */}
      <div className={styles.card}>
        <p className={styles.introText}>
          안녕하세요. 재단법인 강릉문화재단입니다.
          <br />
          이번 '강릉, 봄을 빚다 — 강릉 봄푸드 페스타'에 참여해 주셔서 진심으로
          감사드립니다.
        </p>
        <p className={styles.introTextSub}>
          본 설문은 행사 운영 개선 및 결과 보고를 위한 목적으로 활용되며, 응답
          내용은 통계 처리되어 개인정보는 공개되지 않습니다. 솔직하고 성실한
          답변 부탁드립니다. 소요시간은 약 3~5분입니다.
        </p>
      </div>

      {/* 개인정보 동의 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>개인정보 수집 및 이용 동의</h3>
        <div className={styles.privacyTable}>
          <div className={styles.privacyRow}>
            <div className={styles.privacyLabel}>수집 항목</div>
            <div className={styles.privacyValue}>성함, 연락처 (이벤트/경품 참여자에 한함)</div>
          </div>
          <div className={styles.privacyRow}>
            <div className={styles.privacyLabel}>수집 목적</div>
            <div className={styles.privacyValue}>경품 추첨 및 당첨자 안내</div>
          </div>
          <div className={styles.privacyRow}>
            <div className={styles.privacyLabel}>보유·이용기간</div>
            <div className={styles.privacyValue}>당첨자 발표 후 1개월 보관 후 파기</div>
          </div>
        </div>
        <Checkbox
          label="개인정보 수집 및 이용에 동의합니다"
          checked={form.privacyConsented}
          onChange={(e) => updateForm({ privacyConsented: e.target.checked })}
        />
      </div>

      {/* Ⅰ. 기본 정보 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Ⅰ. 기본 정보</h3>
        <div className={styles.fieldsDense}>
          <RadioGroup
            label="1. 귀하의 성별은 무엇입니까?"
            required
            options={GENDER_OPTIONS}
            value={form.gender}
            onChange={(value) => updateForm({ gender: value as SurveyFormData['gender'] })}
          />
          <RadioGroup
            label="2. 귀하의 연령대는 어떻게 되십니까?"
            required
            options={AGE_GROUP_OPTIONS}
            value={form.ageGroup}
            onChange={(value) => updateForm({ ageGroup: value })}
          />
          <RadioGroup
            label="3. 귀하의 현재 거주 지역은 어디입니까?"
            required
            options={REGION_OPTIONS}
            value={form.region}
            onChange={(value) => updateForm({ region: value })}
          />
          <RadioGroup
            label="4. 이번 행사 방문 시 동반 유형은 무엇입니까?"
            required
            options={COMPANION_OPTIONS}
            value={form.companion}
            onChange={(value) => updateForm({ companion: value })}
          />
        </div>
      </div>

      {/* 성함/연락처 */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>성함 / 연락처</h3>
        <p className={styles.cardSubtitle}>경품 추첨 + 쿠폰 발급을 위해 작성해 주세요</p>
        <div className={styles.fields}>
          <Input
            label="성함"
            required
            placeholder="홍길동"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
          />
          <Input
            label="연락처"
            required
            type="tel"
            inputMode="tel"
            placeholder="010-0000-0000"
            hint="경품 추첨 및 쿠폰 발급에 사용됩니다."
            value={form.phone}
            onChange={(e) => updateForm({ phone: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.actions}>
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
