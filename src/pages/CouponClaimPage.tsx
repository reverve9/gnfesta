import { CircleCheck, TriangleAlert, Clock, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import { ensureClientId } from '@/lib/clientId'
import styles from './CouponClaimPage.module.css'

type Phase = 'loading' | 'success' | 'duplicate' | 'window' | 'disabled' | 'error'

interface IssueResponse {
  ok: boolean
  code?: string
  discount?: number
  minOrder?: number
  expiresAt?: string
  sourceLabel?: string
  error?: string
  codeName?: string // ALREADY_CLAIMED / DISABLED / BEFORE_WINDOW / AFTER_WINDOW
}

/**
 * 프로그램 쿠폰 랜딩 페이지 — `/coupon/claim?event=<uuid>`
 *
 * 운영요원 소지의 고정 QR 을 참여자가 스캔 → 이 페이지 진입 → 자동 발급 시도.
 * localStorage 에 clientId 없으면 생성해 서버에 전송.
 *
 * 분기
 *  · 발급 성공 → 쿠폰 코드/할인 안내 + 쿠폰함 링크
 *  · 이미 발급(ALREADY_CLAIMED) → 이미 받으셨다는 안내
 *  · 시간창 밖(BEFORE_WINDOW/AFTER_WINDOW) → 시간 안내
 *  · 비활성(DISABLED) → 준비 중 안내
 *  · 그 외 에러 → 일반 에러
 */
export default function CouponClaimPage() {
  const [params] = useSearchParams()
  const eventId = params.get('event')

  const [phase, setPhase] = useState<Phase>('loading')
  const [result, setResult] = useState<IssueResponse | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    if (!eventId) {
      setPhase('error')
      setResult({ ok: false, error: '이벤트 정보가 누락되었습니다 (QR 을 다시 스캔해주세요)' })
      return
    }

    void (async () => {
      try {
        const clientId = ensureClientId()
        const response = await fetch('/api/coupons/issue-program', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, clientId }),
        })
        const json = (await response.json().catch(() => ({}))) as IssueResponse & {
          code?: string
        }

        if (response.ok && json.ok) {
          setResult(json)
          setPhase('success')
          return
        }

        // 서버가 code 필드로 세분 사유 전달 — 필드명이 쿠폰 코드와 겹치므로
        // 응답 구조상 ALREADY_CLAIMED 케이스는 ok=false + code='ALREADY_CLAIMED'
        const errCode = (json as { code?: string }).code
        setResult(json)
        if (errCode === 'ALREADY_CLAIMED') setPhase('duplicate')
        else if (errCode === 'BEFORE_WINDOW' || errCode === 'AFTER_WINDOW') setPhase('window')
        else if (errCode === 'DISABLED') setPhase('disabled')
        else setPhase('error')
      } catch (err) {
        setResult({
          ok: false,
          error: err instanceof Error ? err.message : '쿠폰 발급 중 오류가 발생했습니다',
        })
        setPhase('error')
      }
    })()
  }, [eventId])

  return (
    <section className={styles.page}>
      <PageTitle title="스탬프랠리 쿠폰" />

      <div className={styles.center}>
        {phase === 'loading' && (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.message}>쿠폰을 발급하는 중…</p>
          </>
        )}

        {phase === 'success' && result?.ok && (
          <>
            <CircleCheck className={`${styles.icon} ${styles.iconSuccess}`} />
            <p className={styles.message}>
              {result.sourceLabel ? `${result.sourceLabel} ` : ''}쿠폰이 발급되었어요
            </p>
            <div className={styles.couponCard}>
              <div className={styles.discount}>
                {(result.discount ?? 0).toLocaleString()}원 할인
              </div>
              <div className={styles.minOrder}>
                {(result.minOrder ?? 0).toLocaleString()}원 이상 결제 시
              </div>
              <div className={styles.code}>{result.code}</div>
            </div>
            <p className={styles.submessage}>
              체크아웃 시 쿠폰 코드를 입력하거나 쿠폰함에서 바로 사용할 수 있어요.
            </p>
            <Link to="/cart" className={styles.cta}>
              장바구니로 이동
            </Link>
          </>
        )}

        {phase === 'duplicate' && (
          <>
            <Info className={`${styles.icon} ${styles.iconInfo}`} />
            <p className={styles.message}>이미 받으신 프로그램이에요</p>
            <p className={styles.submessage}>
              같은 프로그램의 쿠폰은 한 번만 발급돼요. 쿠폰함에서 확인해주세요.
            </p>
            <Link to="/cart" className={styles.cta}>
              장바구니로 이동
            </Link>
          </>
        )}

        {phase === 'window' && (
          <>
            <Clock className={`${styles.icon} ${styles.iconInfo}`} />
            <p className={styles.message}>
              {result?.error ?? '쿠폰 발급 시간이 아닙니다'}
            </p>
            <p className={styles.submessage}>프로그램 운영 시간에 다시 시도해주세요.</p>
          </>
        )}

        {phase === 'disabled' && (
          <>
            <Info className={`${styles.icon} ${styles.iconInfo}`} />
            <p className={styles.message}>아직 쿠폰 발급이 열리지 않았어요</p>
            <p className={styles.submessage}>운영 스태프에게 확인 부탁드려요.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <TriangleAlert className={`${styles.icon} ${styles.iconError}`} />
            <p className={styles.message}>쿠폰 발급에 실패했어요</p>
            {result?.error && <p className={styles.errorDetail}>{result.error}</p>}
            <Link to="/" className={styles.cta}>
              홈으로
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
