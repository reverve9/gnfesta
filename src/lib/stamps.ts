import { supabase } from './supabase'
import { normalizePhone } from './phone'
import { getClientId } from './clientId'
import { getAssetUrl } from './festival'

export const STAMPS_REQUIRED = 6

export interface StampEntry {
  id: string
  source: 'payment' | 'program'
  label: string
  imageUrl: string | null
  createdAt: string
}

/**
 * 내 스탬프 조회 — phone(결제) + clientId(프로그램) 병합.
 * 부스 썸네일도 함께 가져옴.
 */
export async function fetchMyStamps(phone: string): Promise<StampEntry[]> {
  const clientId = getClientId()
  const normalized = normalizePhone(phone)

  // 1) 결제 스탬프
  const { data: paymentRows } = await supabase
    .from('coupons')
    .select('id, booth_id, source_label, created_at')
    .eq('phone', normalized)
    .eq('issued_source', 'payment')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  // 2) 프로그램 스탬프
  let programRows: typeof paymentRows = []
  if (clientId) {
    const { data } = await supabase
      .from('coupons')
      .select('id, booth_id, source_label, created_at')
      .eq('client_id', clientId)
      .eq('issued_source', 'program')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    programRows = data
  }

  // 3) 부스 썸네일 일괄 조회
  const allRows = [...(paymentRows ?? []), ...(programRows ?? [])]
  const boothIds = [...new Set(allRows.map((r) => r.booth_id).filter((id): id is string => !!id))]
  const boothImages = new Map<string, string | null>()

  if (boothIds.length > 0) {
    const { data: booths } = await supabase
      .from('food_booths')
      .select('id, thumbnail_url')
      .in('id', boothIds)
    for (const b of booths ?? []) {
      boothImages.set(b.id, getAssetUrl(b.thumbnail_url))
    }
  }

  // 4) 병합
  const stamps: StampEntry[] = []
  for (const row of paymentRows ?? []) {
    stamps.push({
      id: row.id,
      source: 'payment',
      label: row.source_label || '참여',
      imageUrl: row.booth_id ? (boothImages.get(row.booth_id) ?? null) : null,
      createdAt: row.created_at,
    })
  }
  for (const row of programRows ?? []) {
    stamps.push({
      id: row.id,
      source: 'program',
      label: row.source_label || '프로그램',
      imageUrl: row.booth_id ? (boothImages.get(row.booth_id) ?? null) : null,
      createdAt: row.created_at,
    })
  }

  stamps.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return stamps
}
