import { RotateCw, Gift, ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchCompletedUsers,
  claimPrize,
  unclaimPrize,
  type CompletedUser,
} from '@/lib/prizeClaims'
import { exportToExcel, fmtDateKst } from '@/lib/excel'
import { ExportButton } from '@/components/admin/ExcelButtons'
import { formatPhoneDisplay } from '@/lib/phone'
import Pagination, { DEFAULT_PAGE_SIZE } from '@/components/admin/Pagination'
import styles from './AdminPrizeClaims.module.css'

const SOURCE_LABEL: Record<string, string> = {
  payment: '결제',
  program: '프로그램',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`
}

export default function AdminPrizeClaims() {
  const [rows, setRows] = useState<CompletedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = DEFAULT_PAGE_SIZE

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCompletedUsers()
      setRows(data)
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

  const handleClaim = useCallback(
    async (phone: string) => {
      if (busy) return
      setBusy(phone)
      try {
        await claimPrize(phone)
        setRows((prev) =>
          prev.map((r) =>
            r.phone === phone
              ? { ...r, claimed: true, claimedAt: new Date().toISOString() }
              : r,
          ),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : '수령 처리 실패')
      } finally {
        setBusy(null)
      }
    },
    [busy],
  )

  const handleUnclaim = useCallback(
    async (phone: string) => {
      if (busy) return
      setBusy(phone)
      try {
        await unclaimPrize(phone)
        setRows((prev) =>
          prev.map((r) =>
            r.phone === phone ? { ...r, claimed: false, claimedAt: null } : r,
          ),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : '수령 취소 실패')
      } finally {
        setBusy(null)
      }
    },
    [busy],
  )

  const totals = useMemo(() => {
    const total = rows.length
    const claimed = rows.filter((r) => r.claimed).length
    return { total, claimed, unclaimed: total - claimed }
  }, [rows])

  const handleExport = async () => {
    const cols = [
      { key: 'phone', label: '전화번호' },
      { key: 'stampCount', label: '스탬프 수' },
      { key: 'stamps', label: '스탬프 내역' },
      { key: 'claimed', label: '수령 여부' },
      { key: 'claimedAt', label: '수령 일시' },
    ]
    const data = rows.map((r) => ({
      phone: formatPhoneDisplay(r.phone),
      stampCount: r.stampCount,
      stamps: r.stamps.map((s) => s.source_label).join(', '),
      claimed: r.claimed ? '수령' : '미수령',
      claimedAt: r.claimedAt ? fmtDateKst(r.claimedAt) : '',
    }))
    await exportToExcel(data, cols, '경품수령')
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE)

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>경품 수령 관리</h1>
          <p className={styles.sub}>스탬프 랠리 완주자 · 경품 수령 처리</p>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.total}</div>
            <div className={styles.statLabel}>완주</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.claimed}</div>
            <div className={styles.statLabel}>수령</div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statValue}>{totals.unclaimed}</div>
            <div className={styles.statLabel}>미수령</div>
          </div>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RotateCw className={`${styles.refreshIcon} ${loading ? styles.refreshIconSpin : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={rows.length}
        onChange={setPage}
        unit="명"
        actions={<ExportButton onClick={handleExport} disabled={rows.length === 0} />}
      />

      <div className={styles.list}>
        {loading && rows.length === 0 ? (
          <div className={styles.placeholder}>불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className={styles.placeholder}>완주자가 없습니다.</div>
        ) : (
          pageRows.map((user) => {
            const expanded = expandedPhone === user.phone
            const isBusy = busy === user.phone
            return (
              <div key={user.phone} className={styles.card}>
                <div
                  className={styles.cardHeader}
                  onClick={() => setExpandedPhone(expanded ? null : user.phone)}
                >
                  <div className={styles.cardMain}>
                    <span className={styles.cardPhone}>
                      {formatPhoneDisplay(user.phone)}
                    </span>
                    <span className={styles.cardCount}>
                      스탬프 {user.stampCount}개
                    </span>
                  </div>
                  <div className={styles.cardRight}>
                    {user.claimed ? (
                      <span className={styles.badgeClaimed}>수령완료</span>
                    ) : (
                      <span className={styles.badgeUnclaimed}>미수령</span>
                    )}
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {expanded && (
                  <div className={styles.cardBody}>
                    <ul className={styles.stampList}>
                      {user.stamps.map((s, i) => (
                        <li key={i} className={styles.stampItem}>
                          <span className={styles.stampLabel}>{s.source_label || '—'}</span>
                          <span className={styles.stampMeta}>
                            {SOURCE_LABEL[s.issued_source] ?? s.issued_source}
                            {' · '}
                            {formatDateTime(s.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className={styles.cardActions}>
                      {user.claimed ? (
                        <>
                          <span className={styles.claimedInfo}>
                            {user.claimedAt && formatDateTime(user.claimedAt)} 수령
                          </span>
                          <button
                            type="button"
                            className={styles.unclaimBtn}
                            onClick={() => handleUnclaim(user.phone)}
                            disabled={isBusy}
                          >
                            {isBusy ? '...' : '수령 취소'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.claimBtn}
                          onClick={() => handleClaim(user.phone)}
                          disabled={isBusy}
                        >
                          <Gift size={16} />
                          {isBusy ? '처리 중...' : '경품 수령 처리'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
