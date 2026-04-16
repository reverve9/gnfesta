import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { FestivalEvent } from '@/types/festival_extras'
import styles from './AdminQrCodes.module.css'

const GNFESTA_SLUG = 'gnfesta'
const DEFAULT_BASE = 'https://gnfesta.vercel.app'
const QR_SIZE = 240

/**
 * 프로그램 쿠폰용 QR 코드 발급 페이지 (어드민).
 *
 * 운영요원에게 지급할 QR — 참여자가 스캔하면 `/coupon/claim?event=<id>` 로 진입 →
 * 쿠폰 자동 발급. coupon_enabled=true 인 이벤트만 노출.
 *
 * QR 도메인 입력창으로 로컬·스테이징 전환 가능.
 */
export default function AdminProgramQrCodes() {
  const [events, setEvents] = useState<FestivalEvent[]>([])
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
          .eq('slug', GNFESTA_SLUG)
          .single()
        if (fErr || !festival) throw new Error(fErr?.message ?? 'gnfesta 축제를 찾지 못했습니다')
        const { data, error: eErr } = await supabase
          .from('festival_events')
          .select('*')
          .eq('festival_id', festival.id)
          .eq('coupon_enabled', true)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (eErr) throw new Error(eErr.message)
        if (!cancelled) setEvents((data ?? []) as FestivalEvent[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '이벤트 조회 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const trimmedBase = baseUrl.trim().replace(/\/+$/, '')

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>프로그램 쿠폰 QR</h1>
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
          QR 링크 형식: <code>{trimmedBase || DEFAULT_BASE}/coupon/claim?event=&#123;eventId&#125;</code>
          <br />
          <strong>coupon_enabled=true</strong> 로 설정된 이벤트만 노출됩니다. 활성화는 콘텐츠 편집에서 변경하세요.
          <br />
          운영요원에게 이미지/프린트로 전달하면 됩니다. 카드 하단 다운로드 버튼으로 PNG 저장.
        </p>
      </div>

      {loading && <p className={styles.muted}>이벤트 목록을 불러오는 중…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className={styles.muted}>
          쿠폰이 활성화된 이벤트가 없습니다. 콘텐츠 편집 → 이벤트에서 쿠폰을 켜주세요.
        </p>
      )}

      <div className={styles.grid}>
        {events.map((event) => (
          <ProgramQrCard
            key={event.id}
            event={event}
            url={`${trimmedBase || DEFAULT_BASE}/coupon/claim?event=${event.id}`}
          />
        ))}
      </div>
    </div>
  )
}

interface ProgramQrCardProps {
  event: FestivalEvent
  url: string
}

function ProgramQrCard({ event, url }: ProgramQrCardProps) {
  const canvasWrapperRef = useRef<HTMLDivElement>(null)

  const handleDownload = () => {
    const canvas = canvasWrapperRef.current?.querySelector('canvas')
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `gnfesta-coupon-${event.slug ?? event.id.slice(0, 8)}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const scheduleText = useMemo(() => {
    if (!event.coupon_starts_at && !event.coupon_ends_at) return event.schedule ?? ''
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    if (event.coupon_starts_at && event.coupon_ends_at) {
      return `${fmt(event.coupon_starts_at)} ~ ${fmt(event.coupon_ends_at)}`
    }
    if (event.coupon_starts_at) return `${fmt(event.coupon_starts_at)} 부터`
    return `${fmt(event.coupon_ends_at!)} 까지`
  }, [event])

  return (
    <div className={styles.qrCard}>
      <div className={styles.qrBoothName}>{event.name}</div>
      {scheduleText && <div className={styles.qrBoothNo}>{scheduleText}</div>}
      <div className={styles.qrBox} ref={canvasWrapperRef}>
        <QRCodeCanvas value={url} size={QR_SIZE} level="M" includeMargin />
      </div>
      <div className={styles.qrUrl}>{url}</div>
      <button
        type="button"
        onClick={handleDownload}
        style={{
          marginTop: 8,
          padding: '6px 12px',
          background: '#111827',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Download size={14} /> PNG 다운로드
      </button>
    </div>
  )
}
