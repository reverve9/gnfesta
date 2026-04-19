import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * 활성 AR 구역 목록 조회.
 *
 * GET /api/ar/zones
 * Response (200): { zones: ArZoneDto[] }
 *
 * Phase 1 RLS 결정사항 ④ 전면 개방이라 클라에서 supabase 직접 읽기도 가능하지만,
 * API 경계 일관성 + 향후 정책 강화 시 단일 진입점 보장을 위해 별도 엔드포인트로 둔다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ zones: [], error: 'Method Not Allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      zones: [],
      error: 'Server missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data, error } = await supabase
    .from('ar_zones')
    .select('id, name, center_lat, center_lng, radius_m, spawn_weight')
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) {
    return res.status(500).json({ zones: [], error: error.message })
  }

  return res.status(200).json({ zones: data ?? [] })
}
