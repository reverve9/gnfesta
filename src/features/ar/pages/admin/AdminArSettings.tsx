import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './AdminArSettings.module.css'

/**
 * AR 축제 설정 편집 페이지 — Phase 3-R1.
 *
 * 기능 범위 (최소)
 *  · `get_festival_settings` RPC 로 활성 row 로드 → 폼 표시
 *  · 편집 후 `update_festival_settings` RPC 호출로 저장
 *  · rarity 합 100 클라이언트 검증
 *  · 단순 input + submit (슬라이더·지도 미리보기는 Phase 6 범위)
 *
 * 인증: 상위 AdminLayout 의 sessionStorage 어드민 인증에 의존.
 * 저장 경로: RPC 직접 호출 (어드민 서버 인증 미도입 상태 — Phase 6+ 에서 강화 예정).
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
  active: boolean
  updated_by: string | null
  updated_at: string
}

type FormState = Omit<FestivalSettings, 'id' | 'active' | 'updated_at'>

const EMPTY_FORM: FormState = {
  name: '',
  center_lat: 0,
  center_lng: 0,
  geofence_radius_m: 200,
  spawn_interval_sec: 45,
  movement_bonus_distance_m: 50,
  rarity_weight_common: 75,
  rarity_weight_rare: 22,
  rarity_weight_legendary: 3,
  capture_token_ttl_sec: 60,
  capture_cooldown_sec: 0,
  mission_common_count: 10,
  mission_rare_count: 3,
  mission_legendary_count: 1,
  updated_by: null,
}

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
    updated_by: s.updated_by,
  }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

export default function AdminArSettings() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('get_festival_settings')
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        return
      }
      if (!data) {
        setLoadError('활성 설정 row 가 없습니다. seed (ar_festival_default.sql) 적용이 필요합니다.')
        return
      }
      setForm(toFormState(data as unknown as FestivalSettings))
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const raritySum =
    form.rarity_weight_common + form.rarity_weight_rare + form.rarity_weight_legendary
  const rarityOk = raritySum === 100

  const numericOk =
    form.geofence_radius_m > 0 &&
    form.spawn_interval_sec > 0 &&
    form.movement_bonus_distance_m > 0 &&
    form.capture_token_ttl_sec > 0 &&
    form.capture_cooldown_sec >= 0 &&
    form.mission_common_count >= 0 &&
    form.mission_rare_count >= 0 &&
    form.mission_legendary_count >= 0

  const canSubmit = loaded && rarityOk && numericOk && status.kind !== 'saving'

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (status.kind === 'ok' || status.kind === 'error') setStatus({ kind: 'idle' })
  }

  function numInput(key: keyof FormState, value: number) {
    return (
      <input
        className={styles.input}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={e => updateField(key, Number(e.target.value) as FormState[typeof key])}
      />
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setStatus({ kind: 'saving' })
    const role = sessionStorage.getItem('admin_role') ?? 'unknown'
    const { error } = await supabase.rpc('update_festival_settings', {
      p_settings: { ...form, updated_by: role },
    })
    if (error) {
      setStatus({ kind: 'error', message: error.message })
      return
    }
    setStatus({ kind: 'ok', message: '저장되었습니다.' })
  }

  return (
    <section className={styles.page}>
      <header>
        <h1 className={styles.title}>AR 게임 설정</h1>
        <p className={styles.note}>
          축제장 geofence · 스폰 파라미터 · 경품 미션 조건 편집. 저장 즉시 서버 반영되며
          클라이언트는 다음 로드 주기에 새 값을 사용.
        </p>
      </header>

      {loadError && <p className={styles.statusErr}>로드 실패: {loadError}</p>}

      {loaded && (
        <form className={styles.page} onSubmit={handleSubmit}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>기본 정보</h2>
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

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Geofence</h2>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>중심 위도 (center_lat)</label>
                <input
                  className={styles.input}
                  type="number"
                  step="any"
                  value={form.center_lat}
                  onChange={e => updateField('center_lat', Number(e.target.value))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>중심 경도 (center_lng)</label>
                <input
                  className={styles.input}
                  type="number"
                  step="any"
                  value={form.center_lng}
                  onChange={e => updateField('center_lng', Number(e.target.value))}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>반경 (m)</label>
              {numInput('geofence_radius_m', form.geofence_radius_m)}
              <span className={styles.hint}>축제장 50×150m + 주변 동선 포함 여유 → 200m 권장</span>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>스폰 스케줄</h2>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>스폰 주기 (초)</label>
                {numInput('spawn_interval_sec', form.spawn_interval_sec)}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>이동 보너스 거리 (m)</label>
                {numInput('movement_bonus_distance_m', form.movement_bonus_distance_m)}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Rarity 확률 (%)</h2>
            <div className={styles.rowTriple}>
              <div className={styles.field}>
                <label className={styles.label}>common</label>
                {numInput('rarity_weight_common', form.rarity_weight_common)}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>rare</label>
                {numInput('rarity_weight_rare', form.rarity_weight_rare)}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>legendary</label>
                {numInput('rarity_weight_legendary', form.rarity_weight_legendary)}
              </div>
            </div>
            <span className={rarityOk ? styles.hint : styles.warning}>
              합계: {raritySum} / 100 {rarityOk ? '✓' : '— 합이 100 이어야 저장 가능'}
            </span>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>포획</h2>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>포획 토큰 유효시간 (초)</label>
                {numInput('capture_token_ttl_sec', form.capture_token_ttl_sec)}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>포획 쿨다운 (초, 0 = 없음)</label>
                {numInput('capture_cooldown_sec', form.capture_cooldown_sec)}
              </div>
            </div>
            <span className={styles.hint}>
              쿨다운 실제 적용 로직은 Phase 3-R3 에서 서버 스폰 정책에 반영 예정.
            </span>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>경품 미션 조건</h2>
            <div className={styles.rowTriple}>
              <div className={styles.field}>
                <label className={styles.label}>common N</label>
                {numInput('mission_common_count', form.mission_common_count)}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>rare M</label>
                {numInput('mission_rare_count', form.mission_rare_count)}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>legendary L</label>
                {numInput('mission_legendary_count', form.mission_legendary_count)}
              </div>
            </div>
            <span className={styles.hint}>
              미션 달성 판정·경품 발급 로직은 Phase 4 범위. 현재는 조건 값 저장만.
            </span>
          </div>

          <div className={styles.actions}>
            <button className={styles.submitBtn} type="submit" disabled={!canSubmit}>
              {status.kind === 'saving' ? '저장 중…' : '저장'}
            </button>
            {status.kind === 'ok' && (
              <span className={`${styles.status} ${styles.statusOk}`}>{status.message}</span>
            )}
            {status.kind === 'error' && (
              <span className={`${styles.status} ${styles.statusErr}`}>
                저장 실패: {status.message}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
