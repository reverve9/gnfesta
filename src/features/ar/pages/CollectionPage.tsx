/**
 * /ar/collection — Phase 4 도감.
 *
 * PHASE_4_PROMPT §1-3 구현:
 *  · 세션 phone 기반 (`loadLastPhone()`), `?phone=` 쿼리 폴백 허용.
 *  · `/api/ar/collection` 서버 엔드포인트 1회 fetch.
 *  · 등급별 포획 썸네일 목록 + 미션 진척도 + 발급된 경품 코드.
 *
 * 없는/실패 케이스는 ArStub 로 단순 메시지 렌더 (기존 AR 페이지 톤앤매너 유지).
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  getArCollection,
  type CollectionDto,
  type CollectionCapture,
} from '../lib/api'
import type { ArRarity } from '../lib/assets'
import { isValidPhone, loadLastPhone, normalizePhone } from '../../../lib/phone'
import ArStub from './ArStub'
import styles from './CollectionPage.module.css'

const GRADE_LABEL: Record<ArRarity, string> = {
  legendary: '전설',
  rare: '희귀',
  common: '공통',
}

const GRADE_ORDER: ArRarity[] = ['legendary', 'rare', 'common']

function formatCapturedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  const hh = d.getHours().toString().padStart(2, '0')
  const mi = d.getMinutes().toString().padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

export default function CollectionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const phone = useMemo(() => {
    const q = searchParams.get('phone')
    if (q) {
      const normalized = normalizePhone(q)
      if (/^010\d{8}$/.test(normalized)) return normalized
    }
    const saved = loadLastPhone()
    if (saved && isValidPhone(saved)) return normalizePhone(saved)
    return null
  }, [searchParams])

  const [collection, setCollection] = useState<CollectionDto | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!phone) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const resp = await getArCollection({ phone })
      if (cancelled) return
      setLoading(false)
      if (resp.ok) {
        setCollection(resp.collection)
      } else {
        setErrorMessage(resp.message ?? resp.result)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phone])

  if (!phone) {
    return (
      <ArStub
        title="내 도감"
        message="AR 게임에서 전화번호를 먼저 입력해 주세요."
      />
    )
  }
  if (loading) {
    return <ArStub title="내 도감" message="불러오는 중..." />
  }
  if (errorMessage || !collection) {
    return (
      <ArStub
        title="내 도감"
        message={`불러오기 실패: ${errorMessage ?? '데이터 없음'}`}
      />
    )
  }

  const byRarity: Record<ArRarity, CollectionCapture[]> = {
    legendary: [],
    rare: [],
    common: [],
  }
  for (const c of collection.captures) {
    byRarity[c.rarity].push(c)
  }

  const totalMission =
    collection.mission_counts.common +
    collection.mission_counts.rare +
    collection.mission_counts.legendary
  const totalProgress =
    collection.progress.common +
    collection.progress.rare +
    collection.progress.legendary

  return (
    <section className={styles.page}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => navigate(-1)}
        aria-label="이전 페이지로"
      >
        <ArrowLeft size={20} />
      </button>

      <header className={styles.header}>
        <h1 className={styles.title}>내 도감</h1>
        <p className={styles.summary}>
          총 {totalProgress}종 포획{totalMission > 0 ? ` · 미션 ${totalMission}종 기준` : ''}
        </p>
      </header>

      {/* 미션 진척도 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>미션 진척도</h2>
        <ul className={styles.missionList}>
          {GRADE_ORDER.map(grade => {
            const current = collection.progress[grade]
            const target = collection.mission_counts[grade]
            const ratio = target > 0 ? Math.min(1, current / target) : 0
            const cleared = target > 0 && current >= target
            return (
              <li key={grade} className={styles.missionItem}>
                <div className={styles.missionHeader}>
                  <span className={styles.missionGrade}>{GRADE_LABEL[grade]}</span>
                  <span
                    className={cleared ? styles.missionCountDone : styles.missionCount}
                  >
                    {current} / {target}
                    {cleared ? ' · 달성' : ''}
                  </span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={cleared ? styles.progressFillDone : styles.progressFill}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* 경품 코드 */}
      {collection.rewards.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>획득한 경품</h2>
          <p className={styles.sectionNote}>매표소에서 아래 코드를 제시해 주세요.</p>
          <ul className={styles.rewardList}>
            {collection.rewards.map(r => (
              <li key={r.code} className={styles.rewardItem}>
                <span className={styles.rewardGrade}>{GRADE_LABEL[r.grade]}</span>
                <code className={styles.rewardCode}>{r.code}</code>
                <span className={styles.rewardStatus}>
                  {r.status === 'used' ? '사용됨' : r.status === 'expired' ? '만료' : '유효'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 등급별 포획 */}
      {GRADE_ORDER.map(grade => (
        <section key={grade} className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {GRADE_LABEL[grade]}{' '}
            <span className={styles.sectionCount}>
              {byRarity[grade].length}
              {collection.mission_counts[grade] > 0
                ? ` / ${collection.mission_counts[grade]}`
                : ''}
            </span>
          </h2>
          {byRarity[grade].length === 0 ? (
            <p className={styles.emptyHint}>아직 포획하지 않았습니다.</p>
          ) : (
            <ul className={styles.captureGrid}>
              {byRarity[grade].map(c => (
                <li key={c.id} className={styles.captureCard}>
                  {c.thumbnail_url ? (
                    <img
                      className={styles.captureThumb}
                      src={c.thumbnail_url}
                      alt={c.creature_name}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.captureFallback}>
                      {c.creature_name.slice(0, 1)}
                    </div>
                  )}
                  <span className={styles.captureName}>{c.creature_name}</span>
                  <span className={styles.captureTime}>
                    {formatCapturedAt(c.captured_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
