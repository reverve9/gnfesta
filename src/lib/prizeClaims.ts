import { supabase } from './supabase'
import { STAMPS_REQUIRED } from './stamps'

export interface CompletedUser {
  phone: string
  stampCount: number
  stamps: { source_label: string; issued_source: string; created_at: string }[]
  claimed: boolean
  claimedAt: string | null
}

/**
 * 완주자 목록 — 스탬프 6개 이상 모은 phone 기반 유저 + 경품 수령 여부.
 */
export async function fetchCompletedUsers(): Promise<CompletedUser[]> {
  // 1) 모든 활성 스탬프 (payment + program)
  const { data: allStamps, error: sErr } = await supabase
    .from('coupons')
    .select('phone, source_label, issued_source, created_at')
    .in('issued_source', ['payment', 'program'])
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
  if (sErr) throw sErr

  // 2) phone 별 그룹
  const byPhone = new Map<string, CompletedUser['stamps']>()
  for (const row of allStamps ?? []) {
    if (!row.phone) continue
    const list = byPhone.get(row.phone) ?? []
    list.push({
      source_label: row.source_label ?? '',
      issued_source: row.issued_source,
      created_at: row.created_at,
    })
    byPhone.set(row.phone, list)
  }

  // 3) 완주자만 필터
  const completed: { phone: string; stamps: CompletedUser['stamps'] }[] = []
  for (const [phone, stamps] of byPhone) {
    if (stamps.length >= STAMPS_REQUIRED) {
      completed.push({ phone, stamps })
    }
  }
  if (completed.length === 0) return []

  // 4) 수령 여부 조회
  const { data: claims } = await supabase
    .from('stamp_prize_claims')
    .select('phone, claimed_at')
    .in('phone', completed.map((c) => c.phone))
  const claimMap = new Map<string, string>()
  for (const c of claims ?? []) {
    claimMap.set(c.phone, c.claimed_at)
  }

  return completed.map((c) => ({
    phone: c.phone,
    stampCount: c.stamps.length,
    stamps: c.stamps,
    claimed: claimMap.has(c.phone),
    claimedAt: claimMap.get(c.phone) ?? null,
  }))
}

/** 경품 수령 처리 */
export async function claimPrize(phone: string): Promise<void> {
  const { error } = await supabase
    .from('stamp_prize_claims')
    .insert({ phone })
  if (error) {
    if (error.code === '23505') throw new Error('이미 수령 처리된 번호입니다')
    throw new Error(`수령 처리 실패: ${error.message}`)
  }
}

/** 경품 수령 취소 (실수 대응) */
export async function unclaimPrize(phone: string): Promise<void> {
  const { error } = await supabase
    .from('stamp_prize_claims')
    .delete()
    .eq('phone', phone)
  if (error) throw new Error(`수령 취소 실패: ${error.message}`)
}

/** 특정 phone 의 수령 여부 조회 (유저앱용) */
export async function checkPrizeClaimed(phone: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('stamp_prize_claims')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()
  if (error) return false
  return !!data
}
