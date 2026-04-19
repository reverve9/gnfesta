import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * 활성 AR 축제 설정 조회.
 *
 * GET /api/ar/festival
 * Response (200): { settings: ArFestivalSettings | null, error?: string }
 *
 * Phase 3-R1 재설계 (phase3_redesign.md v1.0):
 *  · 다중 zone 모델 → 단일 geofence + 런타임 파라미터.
 *  · `/api/ar/zones` 를 본 엔드포인트로 교체.
 *  · 클라/어드민 공통 읽기 경로.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ settings: null, error: 'Method Not Allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      settings: null,
      error: 'Server missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data, error } = await supabase.rpc('get_festival_settings')
  if (error) {
    return res.status(500).json({ settings: null, error: error.message })
  }

  return res.status(200).json({ settings: data ?? null })
}
