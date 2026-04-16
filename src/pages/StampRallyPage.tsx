import { useCallback, useEffect, useState } from 'react'
import { Check, Stamp } from 'lucide-react'
import PageTitle from '@/components/layout/PageTitle'
import Input from '@/components/ui/Input'
import { fetchMyStamps, STAMPS_REQUIRED, type StampEntry } from '@/lib/stamps'
import { loadLastPhone, saveLastPhone, normalizePhone } from '@/lib/phone'
import styles from './StampRallyPage.module.css'

export default function StampRallyPage() {
  const [phone, setPhone] = useState(() => loadLastPhone() ?? '')
  const [stamps, setStamps] = useState<StampEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async (p: string) => {
    const normalized = normalizePhone(p)
    if (normalized.length !== 11) return
    setLoading(true)
    try {
      const data = await fetchMyStamps(normalized)
      setStamps(data)
      saveLastPhone(normalized)
    } catch {
      setStamps([])
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    const saved = loadLastPhone()
    if (saved) void load(saved)
  }, [load])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void load(phone)
  }

  const filled = stamps.slice(0, STAMPS_REQUIRED)
  const count = filled.length
  const completed = count >= STAMPS_REQUIRED

  return (
    <div className={styles.page}>
      <PageTitle title="스탬프 랠리" subtitle="Stamp Rally" />

      <div className={styles.intro}>
        <p>
          부스에서 음식을 주문하거나 프로그램에 참여하면 스탬프가 적립됩니다.
          <br />
          <strong>{STAMPS_REQUIRED}개</strong>를 모으면 완주!
        </p>
      </div>

      {/* 스탬프 카드 — 항상 표시 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardCount}>
            {count} / {STAMPS_REQUIRED}
          </span>
          {completed && <span className={styles.completedBadge}>완주!</span>}
        </div>
        <div className={styles.grid}>
          {Array.from({ length: STAMPS_REQUIRED }).map((_, i) => {
            const stamp = filled[i]
            return (
              <div
                key={i}
                className={`${styles.slot} ${stamp ? styles.slotFilled : styles.slotEmpty}`}
              >
                {stamp ? (
                  <>
                    <Check className={styles.slotIcon} />
                    <span className={styles.slotLabel}>{stamp.label}</span>
                  </>
                ) : (
                  <>
                    <Stamp className={styles.slotIconEmpty} />
                    <span className={styles.slotNum}>{i + 1}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {completed && (
        <div className={styles.celebration}>
          <div className={styles.celebrationIcon}>🎉</div>
          <p className={styles.celebrationText}>
            축하합니다! 스탬프 랠리를 완주하셨습니다.
            <br />
            운영 부스에서 완주 화면을 보여주시면 경품을 받으실 수 있습니다.
          </p>
        </div>
      )}

      {/* 전화번호 조회 */}
      <form className={styles.phoneForm} onSubmit={handleSubmit}>
        <Input
          label="전화번호로 내 스탬프 조회"
          type="tel"
          inputMode="tel"
          placeholder="010-0000-0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          type="submit"
          className={styles.searchBtn}
          disabled={loading || normalizePhone(phone).length !== 11}
        >
          {loading ? '조회 중...' : '조회'}
        </button>
      </form>

      {loaded && count === 0 && (
        <p className={styles.emptyHint}>
          아직 스탬프가 없습니다. 부스에서 주문하거나 프로그램에 참여해 보세요!
        </p>
      )}
    </div>
  )
}
