import { Upload, Check, Info, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/festival'
import type { Festival } from '@/types/database'
import type { FestivalEvent, FestivalGuest } from '@/types/festival_extras'
import styles from './AdminContentDetail.module.css'

const STORAGE_BUCKET = 'festival-assets'

type Slug = 'gnfesta' | 'food'

interface Props {
  slug: Slug
}

const SLUG_LABELS: Record<Slug, string> = {
  gnfesta: '강릉봄푸드페스타',
  food: '푸드부스 콘텐츠',
}

// ============================================================================
// festivals 폼
// ============================================================================
type FestivalForm = {
  name: string
  subtitle: string
  description_lead: string
  description_body: string
  schedule: string
  venue: string
  theme_color: string
}

function toFestivalForm(f: Festival): FestivalForm {
  return {
    name: f.name ?? '',
    subtitle: f.subtitle ?? '',
    description_lead: f.description_lead ?? '',
    description_body: f.description_body ?? '',
    schedule: f.schedule ?? '',
    venue: f.venue ?? '',
    theme_color: f.theme_color ?? '#FBF1CC',
  }
}

// ============================================================================
// festival_events 폼 (gnfesta: 개·폐막식 + 기타 프로그램)
// ============================================================================
type EventForm = {
  name: string
  schedule: string
  venue: string
  description: string
  couponEnabled: boolean
  /** 숫자 입력용 문자열. 빈문자열 = 서버 기본값 사용 */
  couponDiscount: string
  couponMinOrder: string
  /** datetime-local 포맷 ('YYYY-MM-DDTHH:MM'). 빈문자열 = 제한 없음 */
  couponStartsAt: string
  couponEndsAt: string
}

// ISO → <input type="datetime-local"> 포맷 (local tz 기준 — 어드민 KST 전제)
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function toEventForm(e: FestivalEvent): EventForm {
  return {
    name: e.name ?? '',
    schedule: e.schedule ?? '',
    venue: e.venue ?? '',
    description: e.description ?? '',
    couponEnabled: e.coupon_enabled ?? false,
    couponDiscount: e.coupon_discount != null ? String(e.coupon_discount) : '',
    couponMinOrder: e.coupon_min_order != null ? String(e.coupon_min_order) : '',
    couponStartsAt: isoToLocalInput(e.coupon_starts_at),
    couponEndsAt: isoToLocalInput(e.coupon_ends_at),
  }
}

// ============================================================================
// festival_guests 폼 (gnfesta: 스페셜 게스트)
// ============================================================================
type GuestForm = {
  name: string
  description: string
  link_url: string
}

function toGuestForm(g: FestivalGuest): GuestForm {
  return {
    name: g.name ?? '',
    description: g.description ?? '',
    link_url: g.link_url ?? '',
  }
}

// ============================================================================
// 컴포넌트
// ============================================================================
export default function AdminContentDetail({ slug }: Props) {
  // ── festival ────────────────────────────────────────────────────────────
  const [festival, setFestival] = useState<Festival | null>(null)
  const [festivalForm, setFestivalForm] = useState<FestivalForm | null>(null)
  const [festivalSaving, setFestivalSaving] = useState(false)
  const [festivalSaved, setFestivalSaved] = useState(false)
  const [festivalUploading, setFestivalUploading] = useState(false)
  const festivalFileRef = useRef<HTMLInputElement | null>(null)

  // ── events (gnfesta) ────────────────────────────────────────────────────
  const [events, setEvents] = useState<FestivalEvent[]>([])
  const [eventForms, setEventForms] = useState<Record<string, EventForm>>({})
  const [eventSavingId, setEventSavingId] = useState<string | null>(null)
  const [eventSavedId, setEventSavedId] = useState<string | null>(null)

  // ── guests (gnfesta) ────────────────────────────────────────────────────
  const [guests, setGuests] = useState<FestivalGuest[]>([])
  const [guestForms, setGuestForms] = useState<Record<string, GuestForm>>({})
  const [guestSavingId, setGuestSavingId] = useState<string | null>(null)
  const [guestSavedId, setGuestSavedId] = useState<string | null>(null)
  const [guestUploadingId, setGuestUploadingId] = useState<string | null>(null)
  const guestFileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)

    const { data: f } = await supabase
      .from('festivals')
      .select('*')
      .eq('slug', slug)
      .single()
    if (f) {
      setFestival(f)
      setFestivalForm(toFestivalForm(f))
    } else {
      setFestival(null)
      setFestivalForm(null)
    }

    if (slug === 'gnfesta' && f) {
      const [evRes, gtRes] = await Promise.all([
        supabase
          .from('festival_events')
          .select('*')
          .eq('festival_id', f.id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('festival_guests')
          .select('*')
          .eq('festival_id', f.id)
          .order('sort_order', { ascending: true }),
      ])
      const evList = (evRes.data ?? []) as FestivalEvent[]
      const gtList = (gtRes.data ?? []) as FestivalGuest[]
      setEvents(evList)
      setEventForms(
        Object.fromEntries(evList.map((e) => [e.id, toEventForm(e)])),
      )
      setGuests(gtList)
      setGuestForms(
        Object.fromEntries(gtList.map((g) => [g.id, toGuestForm(g)])),
      )
    } else {
      setEvents([])
      setEventForms({})
      setGuests([])
      setGuestForms({})
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // ── festival 핸들러 ─────────────────────────────────────────────────────
  const updateFestivalField = (field: keyof FestivalForm, value: string) => {
    setFestivalForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleFestivalSave = async () => {
    if (!festival || !festivalForm) return
    setFestivalSaving(true)
    const { error } = await supabase
      .from('festivals')
      .update({
        name: festivalForm.name,
        subtitle: festivalForm.subtitle || null,
        description_lead: festivalForm.description_lead || null,
        description_body: festivalForm.description_body || null,
        schedule: festivalForm.schedule || null,
        venue: festivalForm.venue || null,
        theme_color: festivalForm.theme_color || null,
      })
      .eq('id', festival.id)
    setFestivalSaving(false)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setFestivalSaved(true)
    setTimeout(() => setFestivalSaved(false), 2000)
    fetchData()
  }

  const handleFestivalUpload = async (file: File) => {
    if (!festival) return
    setFestivalUploading(true)
    const ext = file.name.split('.').pop() || 'png'
    const path = `festivals/${festival.slug}/poster.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setFestivalUploading(false)
      return
    }
    const { error: dbError } = await supabase
      .from('festivals')
      .update({ poster_url: path })
      .eq('id', festival.id)
    setFestivalUploading(false)
    if (dbError) alert('DB 업데이트 실패: ' + dbError.message)
    else fetchData()
  }

  // ── event 핸들러 (gnfesta) ─────────────────────────────────────────────
  const updateEventField = <K extends keyof EventForm>(
    id: string,
    field: K,
    value: EventForm[K],
  ) => {
    setEventForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleEventSave = async (event: FestivalEvent) => {
    setEventSavingId(event.id)
    const form = eventForms[event.id]
    const discount = form.couponDiscount.trim()
    const minOrder = form.couponMinOrder.trim()
    const { error } = await supabase
      .from('festival_events')
      .update({
        name: form.name,
        schedule: form.schedule || null,
        venue: form.venue || null,
        description: form.description || null,
        coupon_enabled: form.couponEnabled,
        coupon_discount: discount ? Number(discount) : null,
        coupon_min_order: minOrder ? Number(minOrder) : null,
        coupon_starts_at: localInputToIso(form.couponStartsAt),
        coupon_ends_at: localInputToIso(form.couponEndsAt),
      })
      .eq('id', event.id)
    setEventSavingId(null)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setEventSavedId(event.id)
    setTimeout(() => setEventSavedId(null), 2000)
    fetchData()
  }

  const handleEventDelete = async (event: FestivalEvent) => {
    if (!confirm(`"${event.name}" 을(를) 삭제하시겠습니까?`)) return
    const { error } = await supabase
      .from('festival_events')
      .delete()
      .eq('id', event.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    fetchData()
  }

  const handleEventAdd = async (kind: 'opening' | 'closing' | 'program') => {
    if (!festival) return
    const sameKindEvents = events.filter((e) => e.kind === kind)
    const maxSort = sameKindEvents.reduce(
      (max, e) => Math.max(max, e.sort_order),
      0,
    )
    const defaultName =
      kind === 'opening' ? '개막식' : kind === 'closing' ? '폐막식' : '새 프로그램'
    const { error } = await supabase.from('festival_events').insert({
      festival_id: festival.id,
      name: defaultName,
      kind,
      sort_order: maxSort + 10,
      is_active: true,
    })
    if (error) {
      alert('추가 실패: ' + error.message)
      return
    }
    fetchData()
  }

  // ── guest 핸들러 (gnfesta) ─────────────────────────────────────────────
  const updateGuestField = (
    id: string,
    field: keyof GuestForm,
    value: string,
  ) => {
    setGuestForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleGuestSave = async (guest: FestivalGuest) => {
    setGuestSavingId(guest.id)
    const form = guestForms[guest.id]
    const { error } = await supabase
      .from('festival_guests')
      .update({
        name: form.name,
        description: form.description || null,
        link_url: form.link_url || null,
      })
      .eq('id', guest.id)
    setGuestSavingId(null)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    setGuestSavedId(guest.id)
    setTimeout(() => setGuestSavedId(null), 2000)
    fetchData()
  }

  const handleGuestDelete = async (guest: FestivalGuest) => {
    if (!confirm(`"${guest.name}" 을(를) 삭제하시겠습니까?`)) return
    const { error } = await supabase
      .from('festival_guests')
      .delete()
      .eq('id', guest.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    fetchData()
  }

  const handleGuestAdd = async () => {
    if (!festival) return
    const maxSort = guests.reduce((max, g) => Math.max(max, g.sort_order), 0)
    const { error } = await supabase.from('festival_guests').insert({
      festival_id: festival.id,
      name: '새 게스트',
      sort_order: maxSort + 10,
      is_active: true,
    })
    if (error) {
      alert('추가 실패: ' + error.message)
      return
    }
    fetchData()
  }

  const handleGuestUpload = async (guest: FestivalGuest, file: File) => {
    setGuestUploadingId(guest.id)
    const ext = file.name.split('.').pop() || 'png'
    const path = `festivals/gnfesta/guests/${guest.id}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' })
    if (uploadError) {
      alert('업로드 실패: ' + uploadError.message)
      setGuestUploadingId(null)
      return
    }
    const { error: dbError } = await supabase
      .from('festival_guests')
      .update({ photo_url: path })
      .eq('id', guest.id)
    setGuestUploadingId(null)
    if (dbError) alert('DB 업데이트 실패: ' + dbError.message)
    else fetchData()
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────
  if (loading || !festival || !festivalForm) {
    return (
      <div>
        <div className={styles.header}>
          <h1 className={styles.title}>{SLUG_LABELS[slug]}</h1>
        </div>
        <div className={styles.empty}>불러오는 중...</div>
      </div>
    )
  }

  const posterUrl = getAssetUrl(festival.poster_url)
  const ceremonies = events.filter((e) => e.kind === 'opening' || e.kind === 'closing')
  const otherPrograms = events.filter((e) => e.kind === 'program')

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{SLUG_LABELS[slug]}</h1>
        <span className={styles.slug}>/program/{festival.slug}</span>
      </div>

      {/* ─────────────── 섹션 1 — 페이지 상단 영역 ─────────────── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>페이지 상단 영역</h2>
        </header>

        <div className={styles.card}>
          <div
            className={
              slug === 'gnfesta' ? styles.cardBodyFull : styles.cardBody
            }
          >
            {slug !== 'gnfesta' && (
              <div className={styles.posterSection}>
                <div className={styles.posterPreview}>
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={festival.name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className={styles.posterEmpty}>포스터 없음</div>
                  )}
                </div>
                <input
                  ref={festivalFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFestivalUpload(file)
                    e.target.value = ''
                  }}
                />
                <button
                  className={styles.uploadBtn}
                  onClick={() => festivalFileRef.current?.click()}
                  disabled={festivalUploading}
                >
                  <Upload width={16} height={16} />
                  {festivalUploading ? '업로드 중...' : '포스터 교체'}
                </button>
              </div>
            )}

            <div className={styles.formSection}>
              <div className={styles.field}>
                <label className={styles.label}>행사명</label>
                <input
                  className={styles.input}
                  value={festivalForm.name}
                  onChange={(e) => updateFestivalField('name', e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>영문 부제</label>
                <input
                  className={styles.input}
                  value={festivalForm.subtitle}
                  onChange={(e) => updateFestivalField('subtitle', e.target.value)}
                />
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>행사기간</label>
                  <input
                    className={styles.input}
                    value={festivalForm.schedule}
                    onChange={(e) => updateFestivalField('schedule', e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>장소</label>
                  <input
                    className={styles.input}
                    value={festivalForm.venue}
                    onChange={(e) => updateFestivalField('venue', e.target.value)}
                  />
                </div>
              </div>

              {slug !== 'gnfesta' && (
                <div className={styles.field}>
                  <label className={styles.label}>테마 컬러 (드롭캡/박스 배경)</label>
                  <div className={styles.colorRow}>
                    <input
                      type="color"
                      className={styles.colorPicker}
                      value={festivalForm.theme_color}
                      onChange={(e) => updateFestivalField('theme_color', e.target.value)}
                    />
                    <input
                      className={styles.input}
                      value={festivalForm.theme_color}
                      onChange={(e) => updateFestivalField('theme_color', e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label}>
                  {slug === 'gnfesta'
                    ? '본문 — 첫 단락 (인용 블록)'
                    : '본문 — 첫 단락 (드롭캡 적용)'}
                </label>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={festivalForm.description_lead}
                  onChange={(e) =>
                    updateFestivalField('description_lead', e.target.value)
                  }
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>본문 — 두 번째 단락</label>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={festivalForm.description_body}
                  onChange={(e) =>
                    updateFestivalField('description_body', e.target.value)
                  }
                />
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.saveBtn}
                  onClick={handleFestivalSave}
                  disabled={festivalSaving}
                >
                  {festivalSaving ? (
                    '저장 중...'
                  ) : festivalSaved ? (
                    <>
                      <Check width={16} height={16} /> 저장됨
                    </>
                  ) : (
                    '저장'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── 섹션 2 — 페이지 하단 영역 ─────────────── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>페이지 하단 영역</h2>
        </header>

        {/* gnfesta — events/guests 편집 */}
        {slug === 'gnfesta' && (
          <div className={styles.gnfestaGroups}>
            {/* ── 개·폐막식 일정 ── */}
            <div className={styles.subSection}>
              <header className={styles.subSectionHeader}>
                <h3 className={styles.subSectionTitle}>개·폐막식 일정</h3>
              </header>

              {ceremonies.length === 0 ? (
                <div className={styles.emptyState}>
                  등록된 개·폐막식 일정이 없습니다.
                </div>
              ) : (
                <div className={styles.list}>
                  {ceremonies.map((ev) => {
                    const form = eventForms[ev.id]
                    if (!form) return null
                    return (
                      <div key={ev.id} className={styles.card}>
                        <div className={styles.subCardHeader}>
                          <div>
                            <h3 className={styles.subCardTitle}>
                              {ev.kind === 'opening' ? '개막식' : '폐막식'}
                            </h3>
                          </div>
                        </div>
                        <div className={styles.cardBodyFull}>
                          <div className={styles.formSection}>
                            <div className={styles.field}>
                              <label className={styles.label}>이름</label>
                              <input
                                className={styles.input}
                                value={form.name}
                                onChange={(e) =>
                                  updateEventField(ev.id, 'name', e.target.value)
                                }
                              />
                            </div>
                            <div className={styles.row}>
                              <div className={styles.field}>
                                <label className={styles.label}>일 시</label>
                                <input
                                  className={styles.input}
                                  value={form.schedule}
                                  onChange={(e) =>
                                    updateEventField(ev.id, 'schedule', e.target.value)
                                  }
                                />
                              </div>
                              <div className={styles.field}>
                                <label className={styles.label}>장 소</label>
                                <input
                                  className={styles.input}
                                  value={form.venue}
                                  onChange={(e) =>
                                    updateEventField(ev.id, 'venue', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>설명</label>
                              <textarea
                                className={styles.textarea}
                                rows={3}
                                value={form.description}
                                onChange={(e) =>
                                  updateEventField(ev.id, 'description', e.target.value)
                                }
                              />
                            </div>
                            {ev.kind === 'program' && (
                              <div className={styles.couponSection}>
                                <div className={styles.couponHeader}>
                                  <label className={styles.couponToggle}>
                                    <input
                                      type="checkbox"
                                      checked={form.couponEnabled}
                                      onChange={(e) =>
                                        updateEventField(ev.id, 'couponEnabled', e.target.checked)
                                      }
                                    />
                                    <span>스탬프랠리 쿠폰 활성화</span>
                                  </label>
                                  <span className={styles.couponHint}>
                                    활성화 시 프로그램 QR 스캔 → 자동 발급
                                  </span>
                                </div>
                                {form.couponEnabled && (
                                  <>
                                    <div className={styles.row}>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          할인액 (원){' '}
                                          <span className={styles.hintMuted}>비워두면 2,000</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="number"
                                          min={0}
                                          value={form.couponDiscount}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponDiscount',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          최소 주문액{' '}
                                          <span className={styles.hintMuted}>비워두면 10,000</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="number"
                                          min={0}
                                          value={form.couponMinOrder}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponMinOrder',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div className={styles.row}>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          발급 시작{' '}
                                          <span className={styles.hintMuted}>비워두면 제한 없음</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="datetime-local"
                                          value={form.couponStartsAt}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponStartsAt',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          발급 종료{' '}
                                          <span className={styles.hintMuted}>비워두면 제한 없음</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="datetime-local"
                                          value={form.couponEndsAt}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponEndsAt',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            <div className={styles.actions}>
                              <button
                                className={styles.saveBtn}
                                onClick={() => handleEventSave(ev)}
                                disabled={eventSavingId === ev.id}
                              >
                                {eventSavingId === ev.id ? (
                                  '저장 중...'
                                ) : eventSavedId === ev.id ? (
                                  <>
                                    <Check width={16} height={16} /> 저장됨
                                  </>
                                ) : (
                                  '저장'
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── 스페셜 게스트 ── */}
            <div className={styles.subSection}>
              <header className={styles.subSectionHeader}>
                <h3 className={styles.subSectionTitle}>스페셜 게스트</h3>
                <div className={styles.subSectionActions}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={handleGuestAdd}
                  >
                    <Plus width={14} height={14} /> 게스트 추가
                  </button>
                </div>
              </header>

              {guests.length === 0 ? (
                <div className={styles.emptyState}>
                  등록된 스페셜 게스트가 없습니다.
                </div>
              ) : (
                <div className={styles.list}>
                  {guests.map((g) => {
                    const form = guestForms[g.id]
                    if (!form) return null
                    const photoUrl = getAssetUrl(g.photo_url)
                    return (
                      <div key={g.id} className={styles.card}>
                        <div className={styles.subCardHeader}>
                          <div>
                            <h3 className={styles.subCardTitle}>
                              {g.name || '(이름 없음)'}
                            </h3>
                          </div>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => handleGuestDelete(g)}
                            aria-label="삭제"
                          >
                            <Trash2 width={16} height={16} />
                          </button>
                        </div>
                        <div className={styles.cardBody}>
                          <div className={styles.thumbSection}>
                            <div className={styles.guestPhotoPreview}>
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt={g.name}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : (
                                <div className={styles.thumbEmpty}>사진 없음</div>
                              )}
                            </div>
                            <input
                              ref={(el) => {
                                guestFileInputs.current[g.id] = el
                              }}
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleGuestUpload(g, file)
                                e.target.value = ''
                              }}
                            />
                            <button
                              className={styles.uploadBtn}
                              onClick={() => guestFileInputs.current[g.id]?.click()}
                              disabled={guestUploadingId === g.id}
                            >
                              <Upload width={16} height={16} />
                              {guestUploadingId === g.id ? '업로드 중...' : '사진 교체'}
                            </button>
                          </div>

                          <div className={styles.formSection}>
                            <div className={styles.field}>
                              <label className={styles.label}>이름</label>
                              <input
                                className={styles.input}
                                value={form.name}
                                onChange={(e) =>
                                  updateGuestField(g.id, 'name', e.target.value)
                                }
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>한 줄 소개</label>
                              <textarea
                                className={styles.textarea}
                                rows={2}
                                value={form.description}
                                onChange={(e) =>
                                  updateGuestField(g.id, 'description', e.target.value)
                                }
                              />
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>외부 링크 (옵션)</label>
                              <input
                                className={styles.input}
                                placeholder="https://..."
                                value={form.link_url}
                                onChange={(e) =>
                                  updateGuestField(g.id, 'link_url', e.target.value)
                                }
                              />
                            </div>
                            <div className={styles.actions}>
                              <button
                                className={styles.saveBtn}
                                onClick={() => handleGuestSave(g)}
                                disabled={guestSavingId === g.id}
                              >
                                {guestSavingId === g.id ? (
                                  '저장 중...'
                                ) : guestSavedId === g.id ? (
                                  <>
                                    <Check width={16} height={16} /> 저장됨
                                  </>
                                ) : (
                                  '저장'
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── 기타 프로그램 ── */}
            <div className={styles.subSection}>
              <header className={styles.subSectionHeader}>
                <h3 className={styles.subSectionTitle}>기타 프로그램</h3>
                <div className={styles.subSectionActions}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => handleEventAdd('program')}
                  >
                    <Plus width={14} height={14} /> 프로그램 추가
                  </button>
                </div>
              </header>

              {otherPrograms.length === 0 ? (
                <div className={styles.emptyState}>
                  등록된 기타 프로그램이 없습니다.
                </div>
              ) : (
                <div className={styles.list}>
                  {otherPrograms.map((ev) => {
                    const form = eventForms[ev.id]
                    if (!form) return null
                    return (
                      <div key={ev.id} className={styles.card}>
                        <div className={styles.subCardHeader}>
                          <div>
                            <h3 className={styles.subCardTitle}>
                              {form.name || '(이름 없음)'}
                            </h3>
                          </div>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => handleEventDelete(ev)}
                            aria-label="삭제"
                          >
                            <Trash2 width={16} height={16} />
                          </button>
                        </div>
                        <div className={styles.cardBodyFull}>
                          <div className={styles.formSection}>
                            <div className={styles.field}>
                              <label className={styles.label}>이름</label>
                              <input
                                className={styles.input}
                                value={form.name}
                                onChange={(e) =>
                                  updateEventField(ev.id, 'name', e.target.value)
                                }
                              />
                            </div>
                            <div className={styles.row}>
                              <div className={styles.field}>
                                <label className={styles.label}>일 시</label>
                                <input
                                  className={styles.input}
                                  value={form.schedule}
                                  onChange={(e) =>
                                    updateEventField(ev.id, 'schedule', e.target.value)
                                  }
                                />
                              </div>
                              <div className={styles.field}>
                                <label className={styles.label}>장 소</label>
                                <input
                                  className={styles.input}
                                  value={form.venue}
                                  onChange={(e) =>
                                    updateEventField(ev.id, 'venue', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div className={styles.field}>
                              <label className={styles.label}>설명</label>
                              <textarea
                                className={styles.textarea}
                                rows={3}
                                value={form.description}
                                onChange={(e) =>
                                  updateEventField(ev.id, 'description', e.target.value)
                                }
                              />
                            </div>
                            {ev.kind === 'program' && (
                              <div className={styles.couponSection}>
                                <div className={styles.couponHeader}>
                                  <label className={styles.couponToggle}>
                                    <input
                                      type="checkbox"
                                      checked={form.couponEnabled}
                                      onChange={(e) =>
                                        updateEventField(ev.id, 'couponEnabled', e.target.checked)
                                      }
                                    />
                                    <span>스탬프랠리 쿠폰 활성화</span>
                                  </label>
                                  <span className={styles.couponHint}>
                                    활성화 시 프로그램 QR 스캔 → 자동 발급
                                  </span>
                                </div>
                                {form.couponEnabled && (
                                  <>
                                    <div className={styles.row}>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          할인액 (원){' '}
                                          <span className={styles.hintMuted}>비워두면 2,000</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="number"
                                          min={0}
                                          value={form.couponDiscount}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponDiscount',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          최소 주문액{' '}
                                          <span className={styles.hintMuted}>비워두면 10,000</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="number"
                                          min={0}
                                          value={form.couponMinOrder}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponMinOrder',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                    <div className={styles.row}>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          발급 시작{' '}
                                          <span className={styles.hintMuted}>비워두면 제한 없음</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="datetime-local"
                                          value={form.couponStartsAt}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponStartsAt',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className={styles.field}>
                                        <label className={styles.label}>
                                          발급 종료{' '}
                                          <span className={styles.hintMuted}>비워두면 제한 없음</span>
                                        </label>
                                        <input
                                          className={styles.input}
                                          type="datetime-local"
                                          value={form.couponEndsAt}
                                          onChange={(e) =>
                                            updateEventField(
                                              ev.id,
                                              'couponEndsAt',
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            <div className={styles.actions}>
                              <button
                                className={styles.saveBtn}
                                onClick={() => handleEventSave(ev)}
                                disabled={eventSavingId === ev.id}
                              >
                                {eventSavingId === ev.id ? (
                                  '저장 중...'
                                ) : eventSavedId === ev.id ? (
                                  <>
                                    <Check width={16} height={16} /> 저장됨
                                  </>
                                ) : (
                                  '저장'
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* food — 가맹점 안내 */}
        {slug === 'food' && (
          <div className={styles.notice}>
            <Info className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <strong>참여 매장 / 메뉴는 [참여 매장 관리] 메뉴에서 관리합니다.</strong>
              <p>
                좌측 사이드바 → 매장 관리 → 참여 매장 관리. 부스 / 메뉴 / 품절 / 영업 상태 등.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
