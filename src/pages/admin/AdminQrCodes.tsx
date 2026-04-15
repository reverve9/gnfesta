import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { fetchFoodBooths } from '@/lib/festival'
import type { FoodBoothWithMenus } from '@/types/festival_extras'
import styles from './AdminQrCodes.module.css'

const FOOD_SLUG = 'food'

// 기본값은 운영 도메인. 로컬·스테이징에서 다른 URL 로 출력하려면 상단 입력창에서 변경.
const DEFAULT_BASE = 'https://gnfesta.vercel.app'

export default function AdminQrCodes() {
  const [booths, setBooths] = useState<FoodBoothWithMenus[]>([])
  const [loading, setLoading] = useState(true)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data: festival, error: fErr } = await supabase
          .from('festivals')
          .select('id')
          .eq('slug', FOOD_SLUG)
          .single()
        if (fErr || !festival) throw new Error(fErr?.message ?? 'food 축제를 찾지 못했습니다')
        const list = await fetchFoodBooths(festival.id)
        if (cancelled) return
        setBooths(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '부스 조회 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedBooths = useMemo(
    () =>
      [...booths].sort((a, b) => {
        const an = a.booth_no ?? ''
        const bn = b.booth_no ?? ''
        if (an && bn) return an.localeCompare(bn, undefined, { numeric: true })
        if (an) return -1
        if (bn) return 1
        return a.name.localeCompare(b.name)
      }),
    [booths],
  )

  const trimmedBase = baseUrl.trim().replace(/\/+$/, '')

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>부스 QR 코드</h1>
        <label className={styles.baseLabel}>
          QR 도메인
          <input
            className={styles.baseInput}
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={DEFAULT_BASE}
          />
        </label>
        <p className={styles.hint}>
          QR 링크 형식: <code>{trimmedBase || DEFAULT_BASE}/program/food?booth=&#123;boothId&#125;</code>
          <br />
          손님이 QR 을 찍으면 해당 부스 상세 모달이 열린 상태로 진입합니다.
        </p>
      </div>

      {loading && <p className={styles.muted}>부스 목록을 불러오는 중…</p>}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.grid}>
        {sortedBooths.map((booth) => {
          const url = `${trimmedBase}/program/food?booth=${booth.id}`
          return (
            <div key={booth.id} className={styles.qrCard}>
              <div className={styles.qrBoothName}>{booth.name}</div>
              {booth.booth_no && (
                <div className={styles.qrBoothNo}>{booth.booth_no}번 매장</div>
              )}
              <div className={styles.qrBox}>
                <QRCodeCanvas
                  value={url}
                  size={240}
                  level="M"
                  includeMargin
                />
              </div>
              <div className={styles.qrUrl}>{url}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
