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
        <strong>{STAMPS_REQUIRED}개</strong> 스탬프를 모으면 완주!
      </div>

      {/* 진행 바 */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${(count / STAMPS_REQUIRED) * 100}%` }}
        />
        <span className={styles.progressText}>
          {count} / {STAMPS_REQUIRED}
        </span>
      </div>

      {/* 2열 그리드 — 써클 스탬프 */}
      <div className={styles.grid}>
        {Array.from({ length: STAMPS_REQUIRED }).map((_, i) => {
          const stamp = filled[i]
          return (
            <div
              key={i}
              className={`${styles.slot} ${stamp ? styles.slotFilled : styles.slotEmpty}`}
            >
              <div className={styles.circle}>
                {stamp ? (
                  <>
                    {stamp.imageUrl ? (
                      <img
                        src={stamp.imageUrl}
                        alt={stamp.label}
                        className={styles.circleImg}
                      />
                    ) : (
                      <div className={styles.circleFallback}>
                        <Stamp size={28} />
                      </div>
                    )}
                    <div className={styles.checkOverlay}>
                      <Check size={32} strokeWidth={3} />
                    </div>
                  </>
                ) : (
                  <div className={styles.circleEmpty}>
                    <span className={styles.circleNum}>{i + 1}</span>
                  </div>
                )}
              </div>
              <span className={styles.slotLabel}>
                {stamp ? stamp.label : `스탬프 ${i + 1}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* 완주 */}
      {completed && (
        <div className={styles.completed}>
          🎉 완주! 운영 부스에서 이 화면을 보여주세요.
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
          {loading ? '...' : '조회'}
        </button>
      </form>

      {loaded && count === 0 && (
        <p className={styles.emptyHint}>
          아직 스탬프가 없습니다. 부스에서 주문해 보세요!
        </p>
      )}
    </div>
  )
}
