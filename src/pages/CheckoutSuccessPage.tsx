import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageTitle from '@/components/layout/PageTitle'
import { confirmPayment } from '@/lib/toss'
import { findPaymentByTossOrderId, markPaymentPaid } from '@/lib/orders'
import { useCart } from '@/store/cartStore'
import styles from './CheckoutResult.module.css'

type Phase = 'confirming' | 'success' | 'failed'

export default function CheckoutSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { clear } = useCart()

  const paymentKey = params.get('paymentKey')
  const tossOrderId = params.get('orderId') // 토스의 orderId = payments.toss_order_id
  const amountStr = params.get('amount')
  const amount = amountStr ? Number(amountStr) : NaN

  const [phase, setPhase] = useState<Phase>('confirming')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    // StrictMode 중복 호출 방지
    if (ranRef.current) return
    ranRef.current = true

    if (!paymentKey || !tossOrderId || !Number.isFinite(amount)) {
      setErrorMessage('잘못된 접근입니다')
      setPhase('failed')
      return
    }

    void (async () => {
      try {
        // 1) 우리 payments 조회 → id 확보
        const payment = await findPaymentByTossOrderId(tossOrderId)
        if (!payment) throw new Error('결제 정보를 찾을 수 없습니다')

        // 2) 재진입 분기 — 새로고침 / 뒤로가기 / 앞으로가기로 success URL 재방문 시
        //    같은 orderId 로 Toss confirm 을 재호출하면 "이미 승인 및 취소가
        //    진행된 중복된 주문번호" 400 이 나온다. DB 상태로 선분기.
        if (payment.status === 'paid') {
          clear()
          setPaymentId(payment.id)
          setPhase('success')
          navigate(`/order/${payment.id}?from=checkout`, { replace: true })
          return
        }
        if (payment.status === 'cancelled') {
          throw new Error('취소된 결제입니다')
        }

        // 3) 금액 검증 (위변조 방지)
        if (payment.total_amount !== amount) {
          throw new Error('결제 금액이 일치하지 않습니다')
        }

        // 4) 토스 confirm API (server-side) — 서버도 동일 분기로 방어함.
        //    서버가 race 로 'paid' 판정을 더 빨리 한 경우 alreadyConfirmed 로 응답.
        const confirmResult = await confirmPayment({
          paymentKey,
          orderId: tossOrderId,
          amount,
        })

        if (!confirmResult.alreadyConfirmed) {
          // 5) payments + 하위 orders 전부 paid 상태로 전이
          await markPaymentPaid(payment.id, paymentKey)
        }

        // 6) 카트 비우기
        clear()

        setPaymentId(payment.id)
        setPhase('success')

        // 잠시 보여주고 주문 상태 페이지로 이동.
        // ?from=checkout 쿼리로 마킹 → Header 가 back 버튼 숨겨서
        // history 한 칸 뒤가 토스 도메인인 사고를 차단한다.
        // URL 에 들어가므로 새로고침 / 백그라운드 복원에도 안전.
        window.setTimeout(() => {
          navigate(`/order/${payment.id}?from=checkout`, { replace: true })
        }, 1200)
      } catch (err) {
        const message = err instanceof Error ? err.message : '결제 승인 중 오류가 발생했습니다'
        setErrorMessage(message)
        setPhase('failed')
      }
    })()
  }, [paymentKey, tossOrderId, amount, clear, navigate])

  return (
    <section className={styles.page}>
      <PageTitle title={phase === 'success' ? '결제 완료' : '결제 처리'} />

      <div className={styles.center}>
        {phase === 'confirming' && (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.message}>결제를 확인하고 있어요…</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <CircleCheck className={`${styles.icon} ${styles.iconSuccess}`} />
            <p className={styles.message}>결제가 완료되었어요</p>
            <p className={styles.submessage}>주문 상태 페이지로 이동합니다…</p>
            {paymentId && (
              <Link
                to={`/order/${paymentId}?from=checkout`}
                replace
                className={styles.cta}
              >
                지금 이동하기
              </Link>
            )}
          </>
        )}

        {phase === 'failed' && (
          <>
            <TriangleAlert className={`${styles.icon} ${styles.iconError}`} />
            <p className={styles.message}>결제 승인에 실패했어요</p>
            {errorMessage && <p className={styles.errorDetail}>{errorMessage}</p>}
            <Link to="/cart" className={styles.cta}>
              장바구니로 돌아가기
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
