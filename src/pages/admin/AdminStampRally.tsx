import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Download, RotateCw, Image as ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/festival'
import type { FestivalEvent } from '@/types/festival_extras'
import styles from './AdminStampRally.module.css'

const GNFESTA_SLUG = 'gnfesta'
const DEFAULT_BASE = 'https://gnfesta.vercel.app'
const QR_SIZE = 200

export default function AdminStampRally() {
  const [events, setEvents] = useState<FestivalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data: festival } = await supabase
        .from('festivals')
        .select('id')
        .eq('slug', GNFESTA_SLUG)
        .single()
      if (!festival) throw new Error('gnfesta 축제를 찾지 못했습니다')
      const { data, error: eErr } = await supabase
        .from('festival_events')
        .select('*')
        .eq('festival_id', festival.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (eErr) throw new Error(eErr.message)
      setEvents((data ?? []) as FestivalEvent[])
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

  const handleToggle = useCallback(
    async (event: FestivalEvent) => {
      if (busy) return
      const next = !event.coupon_enabled
      setBusy(event.id)
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, coupon_enabled: next } : e)),
      )
      try {
        const { error: uErr } = await supabase
          .from('festival_events')
          .update({ coupon_enabled: next })
          .eq('id', event.id)
        if (uErr) throw uErr
      } catch {
        setEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, coupon_enabled: !next } : e)),
        )
      } finally {
        setBusy(null)
      }
    },
    [busy],
  )

  const trimmedBase = baseUrl.trim().replace(/\/+$/, '')
  const enabledCount = events.filter((e) => e.coupon_enabled).length

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>스탬프 랠리 프로그램 관리</h1>
          <p className={styles.sub}>
            프로그램별 스탬프 활성화 · QR 코드 · 썸네일 관리
          </p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{enabledCount}</div>
            <div className={styles.statLabel}>활성</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{events.length - enabledCount}</div>
            <div className={styles.statLabel}>비활성</div>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RotateCw className={`${styles.refreshIcon} ${loading ? styles.spin : ''}`} />
            새로고침
          </button>
        </div>
      </header>

      <div className={styles.baseRow}>
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
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.placeholder}>불러오는 중...</div>
      ) : events.length === 0 ? (
        <div className={styles.placeholder}>등록된 프로그램이 없습니다.</div>
      ) : (
        <div className={styles.list}>
          {events.map((event) => (
            <ProgramCard
              key={event.id}
              event={event}
              baseUrl={trimmedBase || DEFAULT_BASE}
              busy={busy === event.id}
              onToggle={() => handleToggle(event)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProgramCard({
  event,
  baseUrl,
  busy,
  onToggle,
}: {
  event: FestivalEvent
  baseUrl: string
  busy: boolean
  onToggle: () => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const url = `${baseUrl}/coupon/claim?event=${event.id}`
  const thumbUrl = getAssetUrl(event.thumbnail_url)
  const enabled = event.coupon_enabled

  const handleDownload = () => {
    const canvas = canvasRef.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `stamp-qr-${event.slug ?? event.id.slice(0, 8)}.png`
    a.click()
  }

  const timeWindow = useMemo(() => {
    if (!event.coupon_starts_at && !event.coupon_ends_at) return null
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    if (event.coupon_starts_at && event.coupon_ends_at)
      return `${fmt(event.coupon_starts_at)} ~ ${fmt(event.coupon_ends_at)}`
    if (event.coupon_starts_at) return `${fmt(event.coupon_starts_at)} 부터`
    return `${fmt(event.coupon_ends_at!)} 까지`
  }, [event])

  return (
    <div className={`${styles.card} ${!enabled ? styles.cardDisabled : ''}`}>
      <div className={styles.cardTop}>
        {/* 썸네일 */}
        <div className={styles.thumb}>
          {thumbUrl ? (
            <img src={thumbUrl} alt={event.name} />
          ) : (
            <div className={styles.thumbEmpty}>
              <ImageIcon size={28} />
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className={styles.cardInfo}>
          <div className={styles.cardName}>{event.name}</div>
          {event.schedule && <div className={styles.cardSchedule}>{event.schedule}</div>}
          {timeWindow && <div className={styles.cardWindow}>스탬프 시간: {timeWindow}</div>}
          <div className={styles.cardType}>
            {event.kind === 'opening' ? '개막' : event.kind === 'closing' ? '폐막' : '프로그램'}
          </div>
        </div>

        {/* 토글 */}
        <button
          type="button"
          className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
          onClick={onToggle}
          disabled={busy}
        >
          <span className={styles.toggleKnob} />
          <span className={styles.toggleLabel}>{enabled ? '활성' : '비활성'}</span>
        </button>
      </div>

      {/* QR — 활성일 때만 */}
      {enabled && (
        <div className={styles.cardQr}>
          <div ref={canvasRef}>
            <QRCodeCanvas value={url} size={QR_SIZE} level="M" includeMargin />
          </div>
          <div className={styles.qrMeta}>
            <div className={styles.qrUrl}>{url}</div>
            <button type="button" className={styles.downloadBtn} onClick={handleDownload}>
              <Download size={14} /> PNG 다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
