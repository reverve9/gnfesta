import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './AdminArSettings.module.css'

/**
 * AR 축제 설정 편집 페이지 — Phase 3-R1.
 *
 * 톤앤매너: 기존 어드민 폼 패턴(AdminContentDetail) 과 동일. 페이지 래퍼 · 섹션 카드 ·
 * 필드 · 입력 · 저장 버튼 · 저장 완료 인디케이터.
 *
 * 기능 범위 (변경 없음 — R1)
 *  · `get_festival_settings` RPC 로 활성 row 로드 → 폼 표시
 *  · 편집 후 `update_festival_settings` RPC 호출로 저장
 *  · rarity 합 100 클라이언트 검증
 *  · 인증: 상위 AdminLayout 의 sessionStorage 어드민 인증에 의존
 *  · 저장 경로: RPC 직접 호출 (서버 어드민 인증 미도입 — Phase 6+ 전환 예정)
 */

interface FestivalSettings {
  id: string
  name: string
  center_lat: number
  center_lng: number
  geofence_radius_m: number
  spawn_interval_sec: number
  movement_bonus_distance_m: number
  rarity_weight_common: number
  rarity_weight_rare: number
  rarity_weight_legendary: number
  capture_token_ttl_sec: number
  capture_cooldown_sec: number
  mission_common_count: number
  mission_rare_count: number
  mission_legendary_count: number
  movement_outlier_cap_m: number
  active: boolean
  updated_by: string | null
  updated_at: string
}

type FormState = Omit<FestivalSettings, 'id' | 'active' | 'updated_at'>

function toFormState(s: FestivalSettings): FormState {
  return {
    name: s.name,
    center_lat: s.center_lat,
    center_lng: s.center_lng,
    geofence_radius_m: s.geofence_radius_m,
    spawn_interval_sec: s.spawn_interval_sec,
    movement_bonus_distance_m: s.movement_bonus_distance_m,
    rarity_weight_common: s.rarity_weight_common,
    rarity_weight_rare: s.rarity_weight_rare,
    rarity_weight_legendary: s.rarity_weight_legendary,
    capture_token_ttl_sec: s.capture_token_ttl_sec,
    capture_cooldown_sec: s.capture_cooldown_sec,
    mission_common_count: s.mission_common_count,
    mission_rare_count: s.mission_rare_count,
    mission_legendary_count: s.mission_legendary_count,
    movement_outlier_cap_m: s.movement_outlier_cap_m,
    updated_by: s.updated_by,
  }
}

export default function AdminArSettings() {
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('get_festival_settings')
      if (cancelled) return
      setLoading(false)
      if (error) {
        setLoadError(error.message)
        return
      }
      if (!data) {
        setLoadError('활성 설정 row 가 없습니다. seed (ar_festival_default.sql) 적용이 필요합니다.')
        return
      }
      setForm(toFormState(data as unknown as FestivalSettings))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => (prev ? { ...prev, [key]: value } : prev))
    if (saved) setSaved(false)
  }

  function numberInput(key: keyof FormState, value: number, step?: string) {
    return (
      <input
        className={styles.input}
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => updateField(key, Number(e.target.value) as FormState[typeof key])}
      />
    )
  }

  const raritySum = form
    ? form.rarity_weight_common + form.rarity_weight_rare + form.rarity_weight_legendary
    : 0
  const rarityOk = raritySum === 100

  const numericOk = form
    ? form.geofence_radius_m > 0 &&
      form.spawn_interval_sec > 0 &&
      form.movement_bonus_distance_m > 0 &&
      form.capture_token_ttl_sec > 0 &&
      form.capture_cooldown_sec >= 0 &&
      form.mission_common_count >= 0 &&
      form.mission_rare_count >= 0 &&
      form.mission_legendary_count >= 0 &&
      form.movement_outlier_cap_m >= 1 &&
      form.movement_outlier_cap_m <= 10000
    : false

  const canSubmit = !!form && rarityOk && numericOk && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !form) return
    setSaving(true)
    const role = sessionStorage.getItem('admin_role') ?? 'unknown'
    const { error } = await supabase.rpc('update_festival_settings', {
      p_settings: { ...form, updated_by: role },
    })
    setSaving(false)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>AR 게임 설정</h1>
        </div>
        <div className={styles.empty}>불러오는 중...</div>
      </div>
    )
  }

  if (loadError || !form) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>AR 게임 설정</h1>
        </div>
        <div className={styles.empty}>로드 실패: {loadError ?? 'unknown'}</div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>AR 게임 설정</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ─────────────── 섹션 1 — 기본 정보 ─────────────── */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>기본 정보</h2>
          </header>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formSection}>
                <div className={styles.field}>
                  <label className={styles.label}>축제명</label>
                  <input
                    className={styles.input}
                    type="text"
                    value={form.name}
                    onChange={e => updateField('name', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── 섹션 2 — Geofence ─────────────── */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Geofence</h2>
            <p className={styles.sectionSub}>축제장 전체를 감싸는 단일 영역</p>
          </header>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formSection}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>중심 위도 (center_lat)</label>
                    {numberInput('center_lat', form.center_lat, 'any')}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>중심 경도 (center_lng)</label>
                    {numberInput('center_lng', form.center_lng, 'any')}
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>반경 (m)</label>
                  {numberInput('geofence_radius_m', form.geofence_radius_m)}
                  <p className={styles.hintMuted}>축제장 50×150m + 주변 동선 포함 여유 · 권장 200m</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── 섹션 3 — 스폰 스케줄 ─────────────── */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>스폰 스케줄</h2>
          </header>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formSection}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>스폰 주기 (초)</label>
                    {numberInput('spawn_interval_sec', form.spawn_interval_sec)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>이동 보너스 거리 (m)</label>
                    {numberInput('movement_bonus_distance_m', form.movement_bonus_distance_m)}
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>이동 이상치 상한 (m)</label>
                  {numberInput('movement_outlier_cap_m', form.movement_outlier_cap_m)}
                  <p className={styles.hintMuted}>
                    한 번의 GPS 업데이트에서 해당 거리 초과 이동은 이상치로 간주하여 누적 무시
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── 섹션 4 — Rarity 확률 ─────────────── */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Rarity 확률 (%)</h2>
            <p className={styles.sectionSub}>세 값의 합은 반드시 100</p>
          </header>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formSection}>
                <div className={styles.rowTriple}>
                  <div className={styles.field}>
                    <label className={styles.label}>common</label>
                    {numberInput('rarity_weight_common', form.rarity_weight_common)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>rare</label>
                    {numberInput('rarity_weight_rare', form.rarity_weight_rare)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>legendary</label>
                    {numberInput('rarity_weight_legendary', form.rarity_weight_legendary)}
                  </div>
                </div>
                <p className={rarityOk ? styles.hintMuted : styles.hintWarn}>
                  합계 {raritySum} / 100 {rarityOk ? '' : '— 합이 100 이어야 저장 가능'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── 섹션 5 — 포획 ─────────────── */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>포획</h2>
          </header>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formSection}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>포획 토큰 유효시간 (초)</label>
                    {numberInput('capture_token_ttl_sec', form.capture_token_ttl_sec)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>포획 쿨다운 (초, 0 = 없음)</label>
                    {numberInput('capture_cooldown_sec', form.capture_cooldown_sec)}
                  </div>
                </div>
                <p className={styles.hintMuted}>
                  쿨다운 실제 적용 로직은 Phase 3-R3 에서 서버 스폰 정책에 반영 예정
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── 섹션 6 — 경품 미션 조건 ─────────────── */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>경품 미션 조건</h2>
            <p className={styles.sectionSub}>
              미션 달성 판정 · 경품 발급 로직은 Phase 4 범위 (현재는 조건값 저장만)
            </p>
          </header>
          <div className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.formSection}>
                <div className={styles.rowTriple}>
                  <div className={styles.field}>
                    <label className={styles.label}>common N</label>
                    {numberInput('mission_common_count', form.mission_common_count)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>rare M</label>
                    {numberInput('mission_rare_count', form.mission_rare_count)}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>legendary L</label>
                    {numberInput('mission_legendary_count', form.mission_legendary_count)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.actions}>
          <button className={styles.saveBtn} type="submit" disabled={!canSubmit}>
            {saving ? (
              '저장 중...'
            ) : saved ? (
              <>
                <Check width={16} height={16} /> 저장됨
              </>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
