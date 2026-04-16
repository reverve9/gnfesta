import { supabase } from './supabase'
import {
  DuplicateSurveyCouponError,
  hasSurveyCouponByPhone,
  issueSurveyCoupon,
} from './coupons'
import type { Coupon, Json, Survey } from '@/types/database'
import {
  GENDER_OPTIONS,
  AGE_GROUP_OPTIONS,
  REGION_OPTIONS,
  COMPANION_OPTIONS,
  YES_NO_OPTIONS,
  DECISION_MAKER_OPTIONS,
  INFO_SOURCE_OPTIONS,
  EXPECTATION_OPTIONS,
  IMAGE_ITEMS,
  Q10_ITEMS,
  Q11_ITEMS,
  Q12_ITEMS,
  Q15_ITEMS,
  Q16_ITEMS,
  SATISFACTION_5_OPTIONS,
  APPROPRIATE_5_OPTIONS,
  FUTURE_PROGRAM_OPTIONS,
} from '@/pages/sections/survey/questions'

// ─── 필터 / 조회 ──────────────────────────────────────────────

export interface SurveyFilters {
  dateFrom?: string
  dateTo?: string
  festivalId?: string | null
}

export async function fetchSurveys(filters: SurveyFilters = {}): Promise<Survey[]> {
  let query = supabase
    .from('surveys')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.dateFrom) {
    const fromIso = new Date(`${filters.dateFrom}T00:00:00+09:00`).toISOString()
    query = query.gte('created_at', fromIso)
  }
  if (filters.dateTo) {
    const toIso = new Date(`${filters.dateTo}T23:59:59.999+09:00`).toISOString()
    query = query.lte('created_at', toIso)
  }
  if (filters.festivalId !== undefined) {
    if (filters.festivalId === null) query = query.is('festival_id', null)
    else query = query.eq('festival_id', filters.festivalId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Survey[]
}

// ─── 라벨 lookup ──────────────────────────────────────────────

function toMap(opts: { value: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(opts.map((o) => [o.value, o.label]))
}

const GENDER_LABELS = toMap(GENDER_OPTIONS)
const AGE_GROUP_LABELS = toMap(AGE_GROUP_OPTIONS)
const REGION_LABELS = toMap(REGION_OPTIONS)
const COMPANION_LABELS = toMap(COMPANION_OPTIONS)
const YES_NO_LABELS = toMap(YES_NO_OPTIONS)
const DECISION_MAKER_LABELS = toMap(DECISION_MAKER_OPTIONS)
const INFO_SOURCE_LABELS = toMap(INFO_SOURCE_OPTIONS)
const EXPECTATION_LABELS = toMap(EXPECTATION_OPTIONS)
const FUTURE_PROGRAM_LABELS = toMap(FUTURE_PROGRAM_OPTIONS)
const SATISFACTION_5_LABELS = toMap(SATISFACTION_5_OPTIONS)
const APPROPRIATE_5_LABELS = toMap(APPROPRIATE_5_OPTIONS)

export const SURVEY_LABELS = {
  gender: GENDER_LABELS,
  ageGroup: AGE_GROUP_LABELS,
  region: REGION_LABELS,
  companion: COMPANION_LABELS,
  yesNo: YES_NO_LABELS,
  decisionMaker: DECISION_MAKER_LABELS,
  infoSource: INFO_SOURCE_LABELS,
  expectation: EXPECTATION_LABELS,
  futureProgram: FUTURE_PROGRAM_LABELS,
  satisfaction5: SATISFACTION_5_LABELS,
  appropriate5: APPROPRIATE_5_LABELS,
} as const

export const SURVEY_ITEMS = {
  q9: IMAGE_ITEMS,
  q10: Q10_ITEMS,
  q11: Q11_ITEMS,
  q12: Q12_ITEMS,
  q15: Q15_ITEMS,
  q16: Q16_ITEMS,
} as const

// ─── 통계 헬퍼 ────────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function to100Avg(values: (number | null)[], max: number): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  return Math.round((avg / max) * 1000) / 10
}

function topBoxRatio(values: (number | null)[], threshold: number): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  const top = nums.filter((v) => v >= threshold).length
  return Math.round((top / nums.length) * 1000) / 10
}

export interface CountBucket {
  key: string
  label: string
  count: number
  ratio: number
}

export interface LikertSubItem {
  key: string
  label: string
  avg100: number | null
  distribution: number[]
  max: number
}

export interface LikertSection {
  key: string
  label: string
  sectionAvg100: number | null
  items: LikertSubItem[]
}

export interface SurveyStats {
  total: number
  topRegion: { key: string; label: string; count: number; ratio: number } | null
  gender: CountBucket[]
  ageBuckets: CountBucket[]
  regions: CountBucket[]
  companion: CountBucket[]
  pastParticipation: CountBucket[]
  decisionMaker: CountBucket[]
  expectation: CountBucket[]
  overallSatisfactionAvg100: number | null
  overallSatisfactionTopBox: number | null
  sections: LikertSection[]
  operatingHours: CountBucket[]
  infoSources: CountBucket[]
  futurePrograms: CountBucket[]
  openComments: {
    q13_1: string[]
    q13_2: string[]
    q18: string[]
  }
}

function countBuckets(
  values: string[],
  labels: Record<string, string>,
): CountBucket[] {
  const total = values.length
  const counts = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const rows: CountBucket[] = []
  for (const [key, label] of Object.entries(labels)) {
    const count = counts.get(key) ?? 0
    rows.push({
      key,
      label,
      count,
      ratio: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    })
  }
  return rows
}

function likertSection(
  key: string,
  label: string,
  items: { key: string; label?: string; left?: string; right?: string }[],
  extract: (row: Survey) => Record<string, number | null> | null | undefined,
  rows: Survey[],
  max: number,
): LikertSection {
  const subItems: LikertSubItem[] = items.map((it) => {
    const values: (number | null)[] = []
    const dist = Array.from({ length: max }, () => 0)
    for (const row of rows) {
      const group = extract(row)
      if (!group) continue
      const v = toNumber(group[it.key])
      values.push(v)
      if (v !== null && v >= 1 && v <= max) dist[v - 1] += 1
    }
    const displayLabel =
      it.label ??
      (it.left && it.right ? `${it.left} ↔ ${it.right}` : it.key)
    return {
      key: it.key,
      label: displayLabel,
      avg100: to100Avg(values, max),
      distribution: dist,
      max,
    }
  })
  const valid = subItems
    .map((it) => it.avg100)
    .filter((v): v is number => v !== null)
  const sectionAvg100 =
    valid.length > 0
      ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
      : null
  return { key, label, sectionAvg100, items: subItems }
}

export function calcSurveyStats(rows: Survey[]): SurveyStats {
  const total = rows.length

  const gender = countBuckets(
    rows.map((r) => r.gender),
    GENDER_LABELS,
  )

  const ageGroupVals: string[] = []
  const companionVals: string[] = []
  const pastParticipationVals: string[] = []
  const decisionMakerVals: string[] = []
  const expectationVals: string[] = []
  const infoSourceVals: string[] = []
  const futureVals: string[] = []
  const q13Values: (number | null)[] = []
  const q14Vals: string[] = []
  const q13_1Samples: string[] = []
  const q13_2Samples: string[] = []
  const q18Samples: string[] = []

  for (const row of rows) {
    const a = (row.answers ?? {}) as Record<string, unknown>
    if (typeof a.ageGroup === 'string') ageGroupVals.push(a.ageGroup)
    if (typeof a.companion === 'string') companionVals.push(a.companion)
    if (typeof a.q5 === 'string') pastParticipationVals.push(a.q5)
    if (typeof a.q6 === 'string') decisionMakerVals.push(a.q6)
    if (typeof a.q8 === 'string') expectationVals.push(a.q8)
    if (Array.isArray(a.q7)) {
      for (const s of a.q7) if (typeof s === 'string') infoSourceVals.push(s)
    }
    if (Array.isArray(a.q17)) {
      for (const s of a.q17) if (typeof s === 'string') futureVals.push(s)
    }
    q13Values.push(toNumber(a.q13))
    if (typeof a.q14 === 'string') q14Vals.push(a.q14)
    if (typeof a.q13_1 === 'string' && a.q13_1.trim()) q13_1Samples.push(a.q13_1)
    if (typeof a.q13_2 === 'string' && a.q13_2.trim()) q13_2Samples.push(a.q13_2)
    if (typeof a.q18 === 'string' && a.q18.trim()) q18Samples.push(a.q18)
  }

  const regions = countBuckets(
    rows.map((r) => r.region),
    REGION_LABELS,
  )
  let topRegion: SurveyStats['topRegion'] = null
  for (const r of regions) {
    if (!topRegion || r.count > topRegion.count) {
      topRegion = r.count > 0 ? { key: r.key, label: r.label, count: r.count, ratio: r.ratio } : topRegion
    }
  }

  const extract = (qKey: string) => (row: Survey) =>
    (row.answers as Record<string, unknown>)?.[qKey] as Record<string, number | null>

  const sections: LikertSection[] = [
    likertSection('q9', '행사 이미지 (문9)', IMAGE_ITEMS, extract('q9'), rows, 7),
    likertSection('q10', '프로그램 평가 (문10)', Q10_ITEMS, extract('q10'), rows, 7),
    likertSection('q11', '운영 평가 (문11)', Q11_ITEMS, extract('q11'), rows, 7),
    likertSection('q12', '주관기관 (문12)', Q12_ITEMS, extract('q12'), rows, 7),
    likertSection('q15', '재방문/추천 의향 (문15)', Q15_ITEMS, extract('q15'), rows, 7),
    likertSection('q16', '행사 성과 (문16)', Q16_ITEMS, extract('q16'), rows, 7),
  ]

  return {
    total,
    topRegion,
    gender,
    ageBuckets: countBuckets(ageGroupVals, AGE_GROUP_LABELS),
    regions,
    companion: countBuckets(companionVals, COMPANION_LABELS),
    pastParticipation: countBuckets(pastParticipationVals, YES_NO_LABELS),
    decisionMaker: countBuckets(decisionMakerVals, DECISION_MAKER_LABELS),
    expectation: countBuckets(expectationVals, EXPECTATION_LABELS),
    overallSatisfactionAvg100: to100Avg(q13Values, 5),
    overallSatisfactionTopBox: topBoxRatio(q13Values, 4),
    sections,
    operatingHours: countBuckets(q14Vals, APPROPRIATE_5_LABELS),
    infoSources: countBuckets(infoSourceVals, INFO_SOURCE_LABELS),
    futurePrograms: countBuckets(futureVals, FUTURE_PROGRAM_LABELS),
    openComments: {
      q13_1: q13_1Samples,
      q13_2: q13_2Samples,
      q18: q18Samples,
    },
  }
}

// ─── localStorage 디바이스 중복 방지 ──────────────────────────

const SURVEY_DONE_KEY = 'survey_done'

export function hasSurveyDoneLocally(): boolean {
  try {
    return localStorage.getItem(SURVEY_DONE_KEY) === 'true'
  } catch {
    return false
  }
}

export function markSurveyDoneLocally(): void {
  try {
    localStorage.setItem(SURVEY_DONE_KEY, 'true')
  } catch {
    /* 시크릿 모드 등 */
  }
}

// ─── 제출 ─────────────────────────────────────────────────────

export interface SubmitSurveyInput {
  festivalId: string | null
  gender: 'male' | 'female' | 'other'
  age: number
  region: string
  name: string
  phone: string
  privacyConsented: boolean
  answers: Record<string, unknown>
}

export interface SubmitSurveyResult {
  survey: Survey
  coupon: Coupon
}

export async function submitSurvey(
  input: SubmitSurveyInput,
): Promise<SubmitSurveyResult> {
  if (await hasSurveyCouponByPhone(input.phone)) {
    throw new DuplicateSurveyCouponError()
  }

  const { data, error } = await supabase
    .from('surveys')
    .insert({
      festival_id: input.festivalId,
      gender: input.gender,
      age: input.age,
      region: input.region,
      name: input.name,
      phone: input.phone,
      privacy_consented: input.privacyConsented,
      answers: input.answers as Json,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('이미 제출하신 연락처입니다. 설문은 한 번만 참여 가능합니다.')
    }
    throw new Error(error.message || '설문 제출에 실패했습니다.')
  }

  const coupon = await issueSurveyCoupon(input.phone)

  return { survey: data as Survey, coupon }
}
