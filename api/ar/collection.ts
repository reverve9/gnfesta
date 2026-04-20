import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * AR 도감 조회 API — Phase 4 (§1-3).
 *
 * GET /api/ar/collection?phone=01012345678
 *
 * Response 200:
 *   {
 *     ok: true,
 *     collection: {
 *       phone,
 *       captures: [{ id, creature_id, creature_name, rarity, thumbnail_url, captured_at }...],
 *       mission_counts: { common, rare, legendary },  // 목표
 *       progress:       { common, rare, legendary },  // 현재 포획 수
 *       rewards: [{ grade, code, issued_at, status }...]  // 발급된 경품
 *     }
 *   }
 *
 * 실패:
 *   400 { ok:false, result:'invalid_phone' }
 *   405 { ok:false, result:'method_not_allowed' }
 *   500 { ok:false, result:'server_error' | 'server_misconfigured', message }
 *
 * 구성:
 *  · ar_captures JOIN ar_creatures (rarity / name / thumbnail_url 조합)
 *  · ar_festival_settings → mission_{common,rare,legendary}_count
 *  · ar_rewards.triggered_by = 'mission:<grade>' 필터
 */

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11)
}

function isValidNormalizedPhone(normalized: string): boolean {
  return /^010\d{8}$/.test(normalized)
}

type Rarity = 'common' | 'rare' | 'legendary'

function parseRewardGrade(triggeredBy: string): Rarity | null {
  if (triggeredBy === 'mission:common') return 'common'
  if (triggeredBy === 'mission:rare') return 'rare'
  if (triggeredBy === 'mission:legendary') return 'legendary'
  return null
}

interface CaptureRow {
  id: number
  creature_id: string
  captured_at: string
  ar_creatures: {
    name: string
    rarity: Rarity
    thumbnail_url: string | null
  } | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, result: 'method_not_allowed' })
  }

  const phoneRaw = (req.query.phone ?? '') as string
  if (!phoneRaw) {
    return res.status(400).json({ ok: false, result: 'invalid_phone' })
  }
  const phone = normalizePhone(phoneRaw)
  if (!isValidNormalizedPhone(phone)) {
    return res.status(400).json({ ok: false, result: 'invalid_phone' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      result: 'server_misconfigured',
      message: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1) captures + creature 조인
  const { data: captureData, error: captureErr } = await supabase
    .from('ar_captures')
    .select('id, creature_id, captured_at, ar_creatures(name, rarity, thumbnail_url)')
    .eq('phone', phone)
    .order('captured_at', { ascending: false })
  if (captureErr) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: captureErr.message,
    })
  }
  const rows = (captureData ?? []) as unknown as CaptureRow[]
  const captures = rows.map(r => ({
    id: r.id,
    creature_id: r.creature_id,
    creature_name: r.ar_creatures?.name ?? 'Unknown',
    rarity: (r.ar_creatures?.rarity ?? 'common') as Rarity,
    thumbnail_url: r.ar_creatures?.thumbnail_url ?? null,
    captured_at: r.captured_at,
  }))

  const progress = {
    common: captures.filter(c => c.rarity === 'common').length,
    rare: captures.filter(c => c.rarity === 'rare').length,
    legendary: captures.filter(c => c.rarity === 'legendary').length,
  }

  // 2) settings (mission counts)
  const { data: settingsData, error: settingsErr } = await supabase.rpc(
    'get_festival_settings',
  )
  if (settingsErr) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: settingsErr.message,
    })
  }
  const settings = settingsData as {
    mission_common_count?: number
    mission_rare_count?: number
    mission_legendary_count?: number
  } | null
  const mission_counts = {
    common: settings?.mission_common_count ?? 0,
    rare: settings?.mission_rare_count ?? 0,
    legendary: settings?.mission_legendary_count ?? 0,
  }

  // 3) rewards (mission:<grade> 필터)
  const { data: rewardData, error: rewardErr } = await supabase
    .from('ar_rewards')
    .select('code, triggered_by, issued_at, status')
    .eq('phone', phone)
    .in('triggered_by', ['mission:common', 'mission:rare', 'mission:legendary'])
    .order('issued_at', { ascending: false })
  if (rewardErr) {
    return res.status(500).json({
      ok: false,
      result: 'server_error',
      message: rewardErr.message,
    })
  }
  const rewards = (rewardData ?? [])
    .map(r => {
      const grade = parseRewardGrade(r.triggered_by as string)
      if (!grade) return null
      return {
        grade,
        code: r.code as string,
        issued_at: r.issued_at as string,
        status: r.status as 'active' | 'used' | 'expired',
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return res.status(200).json({
    ok: true,
    collection: {
      phone,
      captures,
      mission_counts,
      progress,
      rewards,
    },
  })
}
