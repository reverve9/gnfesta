import { RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SURVEY_ITEMS,
  SURVEY_LABELS,
  calcSurveyStats,
  fetchSurveys,
  type CountBucket,
  type LikertSection,
  type LikertSubItem,
  type SurveyStats,
} from '@/lib/survey'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { ExportButton } from '@/components/admin/ExcelButtons'
import type { Coupon, Survey } from '@/types/database'
import { fetchSurveyCouponByPhone } from '@/lib/coupons'
import { formatPhoneDisplay } from '@/lib/phone'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import styles from './StatsSurveyTab.module.css'

function fmtPct(n: number | null | undefined, suffix = '%'): string {
  if (n === null || n === undefined) return '—'
  return `${n.toFixed(1)}${suffix}`
}

function fmtCount(n: number): string {
  return n.toLocaleString() + '명'
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

export default function StatsSurveyTab() {
  const [rows, setRows] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = DEFAULT_PAGE_SIZE

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSurveys()
      setRows(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const stats: SurveyStats = useMemo(() => calcSurveyStats(rows), [rows])

  const handleExport = async () => {
    const cols = [
      { key: 'created_at', label: '제출일시' },
      { key: 'name', label: '이름' },
      { key: 'gender', label: '성별' },
      { key: 'ageGroup', label: '연령대' },
      { key: 'region', label: '거주지역' },
      { key: 'companion', label: '동반유형' },
      { key: 'phone', label: '전화' },
      { key: 'q5', label: '과거참여' },
      { key: 'q6', label: '결정자' },
      { key: 'q7', label: '정보출처' },
      { key: 'q8', label: '기대부분' },
      { key: 'q13', label: '종합만족도' },
      { key: 'q13_1', label: '불만족이유' },
      { key: 'q13_2', label: '만족이유' },
      { key: 'q14', label: '운영시간' },
      { key: 'q17', label: '향후프로그램' },
      { key: 'q18', label: '자유의견' },
    ]
    const data = rows.map((r) => {
      const a = (r.answers ?? {}) as Record<string, unknown>
      return {
        created_at: fmtDateKst(r.created_at),
        name: r.name,
        gender: SURVEY_LABELS.gender[r.gender] ?? r.gender,
        ageGroup: SURVEY_LABELS.ageGroup[a.ageGroup as string] ?? a.ageGroup ?? '',
        region: SURVEY_LABELS.region[r.region] ?? r.region,
        companion: SURVEY_LABELS.companion[a.companion as string] ?? a.companion ?? '',
        phone: formatPhoneDisplay(r.phone),
        q5: SURVEY_LABELS.yesNo[a.q5 as string] ?? a.q5 ?? '',
        q6: SURVEY_LABELS.decisionMaker[a.q6 as string] ?? a.q6 ?? '',
        q7: Array.isArray(a.q7) ? (a.q7 as string[]).map((v) => SURVEY_LABELS.infoSource[v] ?? v).join(', ') : '',
        q8: SURVEY_LABELS.expectation[a.q8 as string] ?? a.q8 ?? '',
        q13: a.q13 ?? '',
        q13_1: a.q13_1 ?? '',
        q13_2: a.q13_2 ?? '',
        q14: SURVEY_LABELS.appropriate5[a.q14 as string] ?? a.q14 ?? '',
        q17: Array.isArray(a.q17) ? (a.q17 as string[]).map((v) => SURVEY_LABELS.futureProgram[v] ?? v).join(', ') : '',
        q18: a.q18 ?? '',
      }
    })
    await exportToExcel(data, cols, '만족도조사')
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  return (
    <div className={styles.tab}>
      <div className={styles.headerBar}>
        <div className={styles.headerLabel}>
          누적 응답 집계 · 총 <strong>{stats.total.toLocaleString()}</strong>명
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => void refetch()}
          disabled={loading}
        >
          <RotateCw
            className={`${styles.refreshIcon} ${loading ? styles.refreshIconSpin : ''}`}
          />
          <span>새로고침</span>
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading && rows.length === 0 ? (
        <div className={styles.placeholder}>통계 계산 중…</div>
      ) : stats.total === 0 ? (
        <div className={styles.placeholder}>조회된 응답이 없습니다.</div>
      ) : (
        <>
          {/* 1. KPI */}
          <KpiSection stats={stats} />

          {/* 2. 응답자 정보 */}
          <DemographicsSection stats={stats} />

          {/* 3. 참여 동기 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5~8. 참여 행태</h2>
            <div className={styles.demoGrid}>
              <BucketTable title="문5. 과거 참여 경험" buckets={stats.pastParticipation} />
              <BucketTable title="문6. 참여 결정자" buckets={stats.decisionMaker} />
              <BucketTable title="문8. 기대한 부분" buckets={stats.expectation} scrollable />
            </div>
          </section>

          {/* 4. 정보 출처 */}
          <SingleBucketSection title="7. 정보 출처 (복수선택)" buckets={stats.infoSources} />

          {/* 5. 행사 평가 (Q9~Q12) */}
          <LikertGridSection
            title="9~12. 행사 평가 (100점 환산)"
            sections={stats.sections.filter((s) =>
              ['q9', 'q10', 'q11', 'q12'].includes(s.key),
            )}
          />

          {/* 6. 종합 만족도 */}
          <Q13Section stats={stats} />

          {/* 7. 운영시간 */}
          <SingleBucketSection title="14. 운영 시간 적절성" buckets={stats.operatingHours} />

          {/* 8. 의향/성과 (Q15~Q16) */}
          <LikertGridSection
            title="15~16. 재방문 의향 및 행사 성과 (100점 환산)"
            sections={stats.sections.filter((s) =>
              ['q15', 'q16'].includes(s.key),
            )}
          />

          {/* 9-10. 향후 프로그램 + 자유의견 */}
          <div className={styles.dualSectionGrid}>
            <SingleBucketSection
              title="17. 향후 희망 프로그램 (복수선택)"
              buckets={stats.futurePrograms}
            />
            <SingleCommentSection
              title="18. 자유 의견"
              items={stats.openComments.q18}
              total={stats.openComments.q18.length}
            />
          </div>

          {/* 11. 원본 응답 테이블 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>원본 응답 목록</h2>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={rows.length}
              onChange={setPage}
              unit="명"
              actions={<ExportButton onClick={handleExport} disabled={rows.length === 0} />}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.alignCenter}>#</th>
                    <th>제출일시</th>
                    <th>이름</th>
                    <th>성별</th>
                    <th>연령대</th>
                    <th>거주지역</th>
                    <th>동반유형</th>
                    <th className={styles.alignCenter}>종합만족</th>
                    <th>전화</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => {
                    const displayNo = rows.length - (pageStart + idx)
                    const answers = (r.answers ?? {}) as Record<string, unknown>
                    const q13 = typeof answers.q13 === 'number' ? answers.q13 : Number(answers.q13) || null
                    return (
                      <tr
                        key={r.id}
                        className={styles.row}
                        onClick={() => setSelectedSurvey(r)}
                      >
                        <td className={`${styles.alignCenter} ${styles.mono}`}>{displayNo}</td>
                        <td className={styles.mono}>{formatDateTime(r.created_at)}</td>
                        <td>{r.name}</td>
                        <td>{SURVEY_LABELS.gender[r.gender] ?? r.gender}</td>
                        <td>{SURVEY_LABELS.ageGroup[answers.ageGroup as string] ?? '—'}</td>
                        <td>{SURVEY_LABELS.region[r.region] ?? r.region}</td>
                        <td>{SURVEY_LABELS.companion[answers.companion as string] ?? '—'}</td>
                        <td className={`${styles.alignCenter} ${styles.mono}`}>{q13 ?? '—'}</td>
                        <td className={styles.mono}>{formatPhoneDisplay(r.phone)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {selectedSurvey && (
        <SurveyDetailModal
          survey={selectedSurvey}
          onClose={() => setSelectedSurvey(null)}
        />
      )}
    </div>
  )
}

// ─── KPI ──────────────────────────────────────────────────────

function KpiSection({ stats }: { stats: SurveyStats }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>핵심 지표</h2>
      <div className={styles.kpiGrid}>
        <Kpi label="총 응답 수" value={fmtCount(stats.total)} emphasis />
        <Kpi
          label="최다 거주지역"
          value={
            stats.topRegion
              ? `${stats.topRegion.label} (${stats.topRegion.ratio.toFixed(1)}%)`
              : '—'
          }
        />
        <Kpi label="전반 만족도 (4~5점 비율)" value={fmtPct(stats.overallSatisfactionTopBox)} />
        <Kpi
          label="종합 만족도 (100점 환산)"
          value={fmtPct(stats.overallSatisfactionAvg100, '점')}
          emphasis
        />
      </div>
    </section>
  )
}

function Kpi({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className={`${styles.kpiCard} ${emphasis ? styles.kpiCardEmphasis : ''}`}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue}>{value}</div>
    </div>
  )
}

// ─── Demographics ─────────────────────────────────────────────

function DemographicsSection({ stats }: { stats: SurveyStats }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>응답자 정보</h2>
      <div className={styles.demoGrid}>
        <BucketTable title="성별" buckets={stats.gender} />
        <BucketTable title="연령대" buckets={stats.ageBuckets} />
        <BucketTable title="거주지역" buckets={stats.regions} />
        <BucketTable title="동반 유형" buckets={stats.companion} scrollable />
      </div>
    </section>
  )
}

function BucketTable({
  title,
  buckets,
  scrollable,
}: {
  title: string
  buckets: CountBucket[]
  scrollable?: boolean
}) {
  return (
    <div className={styles.bucketCard}>
      <h3 className={styles.bucketTitle}>{title}</h3>
      <div className={scrollable ? styles.bucketListScroll : styles.bucketList}>
        {buckets.map((b) => (
          <div
            key={b.key}
            className={`${styles.bucketRow} ${b.count === 0 ? styles.bucketRowDim : ''}`}
          >
            <span className={styles.bucketLabel}>{b.label}</span>
            <div className={styles.bucketBar}>
              <div
                className={styles.bucketBarFill}
                style={{ width: `${Math.min(b.ratio, 100)}%` }}
              />
            </div>
            <span className={styles.bucketRatio}>{b.ratio.toFixed(1)}%</span>
            <span className={styles.bucketCount}>({b.count})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Likert Grid ──────────────────────────────────────────────

function LikertGridSection({
  title,
  sections,
}: {
  title: string
  sections: LikertSection[]
}) {
  if (sections.length === 0) return null
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.perfGrid}>
        {sections.map((section) => (
          <LikertCard key={section.key} section={section} />
        ))}
      </div>
    </section>
  )
}

function SingleBucketSection({
  title,
  buckets,
}: {
  title: string
  buckets: CountBucket[]
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <BucketTable title="" buckets={buckets} />
    </section>
  )
}

// ─── Q13 종합 만족도 ─────────────────────────────────────────

function Q13Section({ stats }: { stats: SurveyStats }) {
  const MAX = 10
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>13. 종합 만족도</h2>
      <div className={styles.kpiGridDual}>
        <Kpi
          label="전반 만족도 (4~5점 비율)"
          value={fmtPct(stats.overallSatisfactionTopBox)}
        />
        <Kpi
          label="종합 만족도 (100점 환산)"
          value={fmtPct(stats.overallSatisfactionAvg100, '점')}
          emphasis
        />
      </div>
      <div className={styles.openGridDual}>
        <OpenBlock
          title="13-2. 만족 이유"
          items={stats.openComments.q13_2.slice(0, MAX)}
          total={stats.openComments.q13_2.length}
        />
        <OpenBlock
          title="13-1. 불만족 이유"
          items={stats.openComments.q13_1.slice(0, MAX)}
          total={stats.openComments.q13_1.length}
        />
      </div>
    </section>
  )
}

function LikertCard({ section }: { section: LikertSection }) {
  return (
    <div className={styles.perfCard}>
      <div className={styles.perfCardHeader}>
        <h3 className={styles.perfCardTitle}>{section.label}</h3>
        <span className={styles.perfCardScore}>
          {section.sectionAvg100 !== null
            ? `${section.sectionAvg100.toFixed(1)}점`
            : '—'}
        </span>
      </div>
      <div className={styles.perfItems}>
        {section.items.map((item) => (
          <SubItemRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  )
}

function SubItemRow({ item }: { item: LikertSubItem }) {
  const pct = item.avg100 ?? 0
  return (
    <div className={styles.subItemRow}>
      <span className={styles.subItemLabel}>{item.label}</span>
      <div className={styles.subItemBar}>
        <div
          className={styles.subItemBarFill}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={styles.subItemScore}>
        {item.avg100 !== null ? item.avg100.toFixed(1) : '—'}
      </span>
    </div>
  )
}

// ─── Comment sections ─────────────────────────────────────────

function SingleCommentSection({
  title,
  items,
  total,
}: {
  title: string
  items: string[]
  total: number
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {title} <span className={styles.sectionTitleCount}>({total}건)</span>
      </h2>
      {items.length === 0 ? (
        <div className={styles.openEmpty}>응답 없음</div>
      ) : (
        <ul className={styles.openList}>
          {items.map((text, idx) => (
            <li key={idx} className={styles.openItem}>
              {text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function OpenBlock({
  title,
  items,
  total,
}: {
  title: string
  items: string[]
  total: number
}) {
  return (
    <div className={styles.openBlock}>
      <h3 className={styles.openTitle}>
        {title} <span className={styles.openCount}>({total}건)</span>
      </h3>
      {items.length === 0 ? (
        <div className={styles.openEmpty}>응답 없음</div>
      ) : (
        <ul className={styles.openList}>
          {items.map((text, idx) => (
            <li key={idx} className={styles.openItem}>
              {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── 상세 모달 ────────────────────────────────────────────────

interface SurveyDetailModalProps {
  survey: Survey
  onClose: () => void
}

function SurveyDetailModal({ survey, onClose }: SurveyDetailModalProps) {
  const navigate = useNavigate()
  const [surveyCoupon, setSurveyCoupon] = useState<Coupon | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetchSurveyCouponByPhone(survey.phone)
      .then((c) => {
        if (!cancelled) setSurveyCoupon(c)
      })
      .catch(() => {
        if (!cancelled) setSurveyCoupon(null)
      })
  }, [survey.phone])

  const couponStatus = useMemo(() => {
    if (!surveyCoupon) return null
    if (surveyCoupon.status === 'used') return { label: '사용완료', tone: 'used' as const }
    if (new Date(surveyCoupon.expires_at).getTime() < Date.now()) return { label: '만료', tone: 'expired' as const }
    return { label: '미사용', tone: 'active' as const }
  }, [surveyCoupon])

  const a = (survey.answers ?? {}) as Record<string, unknown>

  const strAnswer = (key: string, map?: Record<string, string>) => {
    const v = a[key]
    if (typeof v !== 'string' || !v) return '—'
    return map?.[v] ?? v
  }

  const multiAnswer = (key: string, map: Record<string, string>) => {
    const v = a[key]
    if (!Array.isArray(v) || v.length === 0) return '—'
    return v
      .map((item) => (typeof item === 'string' ? map[item] ?? item : ''))
      .filter(Boolean)
      .join(', ')
  }

  const numAnswer = (key: string) => {
    const v = a[key]
    if (v === null || v === undefined || v === '') return '—'
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? String(n) : '—'
  }

  const likertGroup = (
    key: string,
    items: { key: string; label?: string; left?: string; right?: string }[],
  ) => {
    const group = (a[key] as Record<string, unknown> | undefined) ?? {}
    return items.map((item) => {
      const raw = group[item.key]
      const n = typeof raw === 'number' ? raw : Number(raw)
      const display = Number.isFinite(n) ? String(n) : '—'
      const label =
        item.label ??
        (item.left && item.right ? `${item.left} ↔ ${item.right}` : item.key)
      return { label, value: display }
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>설문 응답 상세</h2>
            <p className={styles.modalSub}>
              {survey.name} · {formatDateTime(survey.created_at)}
            </p>
          </div>
          <div className={styles.modalHeaderRight}>
            {surveyCoupon && couponStatus && (
              <button
                type="button"
                className={`${styles.couponBadge} ${styles[`couponBadge_${couponStatus.tone}`]}`}
                onClick={() => navigate('/coupons')}
                title="쿠폰 관리로 이동"
              >
                🎟 {surveyCoupon.discount_amount.toLocaleString()}원 · {couponStatus.label}
              </button>
            )}
            <button
              type="button"
              className={styles.modalClose}
              onClick={onClose}
              aria-label="닫기"
            >
              <X />
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {/* 응답자 정보 */}
          <DetailSection title="응답자 정보">
            <DetailRow label="성별" value={SURVEY_LABELS.gender[survey.gender] ?? survey.gender} />
            <DetailRow label="연령대" value={strAnswer('ageGroup', SURVEY_LABELS.ageGroup)} />
            <DetailRow label="거주지역" value={SURVEY_LABELS.region[survey.region] ?? survey.region} />
            <DetailRow label="동반유형" value={strAnswer('companion', SURVEY_LABELS.companion)} />
            <DetailRow label="전화" value={formatPhoneDisplay(survey.phone)} />
            <DetailRow label="개인정보 동의" value={survey.privacy_consented ? '동의' : '미동의'} />
          </DetailSection>

          {/* Q5~Q8 */}
          <DetailSection title="5~8. 참여 행태">
            <DetailRow label="문5. 과거 참여 경험" value={strAnswer('q5', SURVEY_LABELS.yesNo)} />
            <DetailRow label="문6. 참여 결정자" value={strAnswer('q6', SURVEY_LABELS.decisionMaker)} />
            <DetailRow label="문7. 정보 출처" value={multiAnswer('q7', SURVEY_LABELS.infoSource)} />
            <DetailRow label="문8. 기대한 부분" value={strAnswer('q8', SURVEY_LABELS.expectation)} />
          </DetailSection>

          {/* Q9 */}
          <DetailSection title="9. 행사 이미지 (7점 척도)">
            {likertGroup('q9', SURVEY_ITEMS.q9).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q10 */}
          <DetailSection title="10. 프로그램 평가 (7점 척도)">
            {likertGroup('q10', SURVEY_ITEMS.q10).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q11 */}
          <DetailSection title="11. 운영 평가 (7점 척도)">
            {likertGroup('q11', SURVEY_ITEMS.q11).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q12 */}
          <DetailSection title="12. 주관기관 (7점 척도)">
            {likertGroup('q12', SURVEY_ITEMS.q12).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q13 */}
          <DetailSection title="13. 종합 만족도 (5점 척도)">
            <DetailRow label="문13. 종합 만족도" value={numAnswer('q13')} />
            {typeof a.q13_1 === 'string' && a.q13_1 && (
              <DetailRow label="문13-1. 불만족 이유" value={a.q13_1} multiline />
            )}
            {typeof a.q13_2 === 'string' && a.q13_2 && (
              <DetailRow label="문13-2. 만족 이유" value={a.q13_2} multiline />
            )}
          </DetailSection>

          {/* Q14 */}
          <DetailSection title="14. 운영 시간">
            <DetailRow label="문14. 운영시간 적절성" value={strAnswer('q14', SURVEY_LABELS.appropriate5)} />
          </DetailSection>

          {/* Q15 */}
          <DetailSection title="15. 재방문/추천 의향 (7점 척도)">
            {likertGroup('q15', SURVEY_ITEMS.q15).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q16 */}
          <DetailSection title="16. 행사 성과 (7점 척도)">
            {likertGroup('q16', SURVEY_ITEMS.q16).map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          {/* Q17 */}
          <DetailSection title="17. 향후 희망 프로그램">
            <DetailRow label="문17" value={multiAnswer('q17', SURVEY_LABELS.futureProgram)} />
          </DetailSection>

          {/* Q18 */}
          <DetailSection title="18. 자유 의견">
            <DetailRow
              label="문18"
              value={typeof a.q18 === 'string' && a.q18 ? a.q18 : '—'}
              multiline
            />
          </DetailSection>
        </div>
      </div>
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.detailSection}>
      <h3 className={styles.detailTitle}>{title}</h3>
      <dl className={styles.detailList}>{children}</dl>
    </div>
  )
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className={`${styles.detailRow} ${multiline ? styles.detailRowMulti : ''}`}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{value}</dd>
    </div>
  )
}
