import { supabase } from './supabase'
import { normalizePhone } from './phone'
import { getClientId } from './clientId'

export const STAMPS_REQUIRED = 6

export interface StampEntry {
  id: string
  source: 'payment' | 'program'
  label: string
  createdAt: string
}

/**
 * 내 스탬프 조회 — phone(결제 스탬프) + clientId(프로그램 스탬프) 병합.
 * cancelled 제외. 최대 STAMPS_REQUIRED 개까지만 카드에 표시.
 */
export async function fetchMyStamps(phone: string): Promise<StampEntry[]> {
  const clientId = getClientId()
  const normalized = normalizePhone(phone)

  const queries = [
    supabase
      .from('coupons')
      .select('id, source_label, created_at')
      .eq('phone', normalized)
      .eq('issued_source', 'payment')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true }),
  ]

  if (clientId) {
    queries.push(
      supabase
        .from('coupons')
        .select('id, source_label, created_at')
        .eq('client_id', clientId)
        .eq('issued_source', 'program')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
    )
  }

  const results = await Promise.all(queries)
  const stamps: StampEntry[] = []

  for (const { data, error } of results) {
    if (error) continue
    for (const row of data ?? []) {
      stamps.push({
        id: row.id,
        source: stamps.length < (results[0]?.data?.length ?? 0) ? 'payment' : 'program',
        label: row.source_label || '참여',
        createdAt: row.created_at,
      })
    }
  }

  stamps.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return stamps
}
