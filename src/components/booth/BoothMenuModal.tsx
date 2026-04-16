import { X, Image as ImageIcon, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  fetchBoothMenus,
  fetchBoothStatus,
  setBoothOpen,
  setBoothPaused,
  setMenuSoldOut,
  setMenuStock,
} from '@/lib/boothMenus'
import { getAssetUrl } from '@/lib/festival'
import type { FoodBooth, FoodMenu } from '@/types/database'
import styles from './BoothMenuModal.module.css'

interface BoothMenuModalProps {
  boothId: string
  onClose: () => void
}

type BusyKey = 'open' | 'paused' | `menu-${string}` | null

export default function BoothMenuModal({ boothId, onClose }: BoothMenuModalProps) {
  const [booth, setBooth] = useState<FoodBooth | null>(null)
  const [menus, setMenus] = useState<FoodMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyKey>(null)

  const refetch = useCallback(async () => {
    try {
      const [boothData, menusData] = await Promise.all([
        fetchBoothStatus(boothId),
        fetchBoothMenus(boothId),
      ])
      setBooth(boothData)
      setMenus(menusData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
    }
  }, [boothId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refetch().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleToggleOpen = useCallback(async () => {
    if (!booth || busy) return
    const next = !booth.is_open
    setBusy('open')
    setBooth((prev) => (prev ? { ...prev, is_open: next } : prev))
    try {
      await setBoothOpen(boothId, next)
    } catch (e) {
      setBooth((prev) => (prev ? { ...prev, is_open: !next } : prev))
      setError(e instanceof Error ? e.message : '영업 상태 변경 실패')
    } finally {
      setBusy(null)
    }
  }, [booth, boothId, busy])

  const handleTogglePaused = useCallback(async () => {
    if (!booth || busy) return
    const next = !booth.is_paused
    setBusy('paused')
    setBooth((prev) => (prev ? { ...prev, is_paused: next } : prev))
    try {
      await setBoothPaused(boothId, next)
    } catch (e) {
      setBooth((prev) => (prev ? { ...prev, is_paused: !next } : prev))
      setError(e instanceof Error ? e.message : '준비 중 상태 변경 실패')
    } finally {
      setBusy(null)
    }
  }, [booth, boothId, busy])

  const handleToggleMenu = useCallback(
    async (menu: FoodMenu) => {
      if (busy) return
      setBusy(`menu-${menu.id}`)
      const next = !menu.is_sold_out
      setMenus((prev) =>
        prev.map((m) => (m.id === menu.id ? { ...m, is_sold_out: next } : m)),
      )
      try {
        await setMenuSoldOut(menu.id, next)
      } catch (e) {
        setMenus((prev) =>
          prev.map((m) => (m.id === menu.id ? { ...m, is_sold_out: !next } : m)),
        )
        setError(e instanceof Error ? e.message : '품절 상태 변경 실패')
      } finally {
        setBusy(null)
      }
    },
    [busy],
  )

  const handleStockChange = useCallback(
    async (menu: FoodMenu, delta: number) => {
      if (busy) return
      const current = menu.stock ?? 0
      const next = Math.max(0, current + delta)
      setBusy(`menu-${menu.id}`)
      setMenus((prev) =>
        prev.map((m) =>
          m.id === menu.id
            ? { ...m, stock: next, is_sold_out: next <= 0 }
            : m,
        ),
      )
      try {
        await setMenuStock(menu.id, next)
      } catch (e) {
        setMenus((prev) =>
          prev.map((m) =>
            m.id === menu.id ? { ...m, stock: current, is_sold_out: current <= 0 } : m,
          ),
        )
        setError(e instanceof Error ? e.message : '재고 변경 실패')
      } finally {
        setBusy(null)
      }
    },
    [busy],
  )

  const handleStockInput = useCallback(
    async (menu: FoodMenu, value: string) => {
      const num = parseInt(value, 10)
      if (isNaN(num) || num < 0) return
      if (busy) return
      setBusy(`menu-${menu.id}`)
      setMenus((prev) =>
        prev.map((m) =>
          m.id === menu.id
            ? { ...m, stock: num, is_sold_out: num <= 0 }
            : m,
        ),
      )
      try {
        await setMenuStock(menu.id, num)
      } catch (e) {
        setError(e instanceof Error ? e.message : '재고 변경 실패')
        void refetch()
      } finally {
        setBusy(null)
      }
    },
    [busy, refetch],
  )

  const instantMenus = menus.filter((m) => m.menu_type === 'instant')
  const cookMenus = menus.filter((m) => m.menu_type === 'cook')

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <h2 className={styles.title}>매장 관리</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            <X className={styles.closeIcon} />
          </button>
        </header>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.body}>
          {loading ? (
            <div className={styles.empty}>데이터를 불러오는 중...</div>
          ) : (
            <>
              {/* ── 영업 상태 ── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>영업 상태</h3>
                    <p className={styles.sectionDesc}>
                      영업 종료 시 손님 앱에서 주문을 받지 않아요.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.statusToggle} ${
                      booth?.is_open ? styles.statusToggleOn : styles.statusToggleOff
                    }`}
                    onClick={handleToggleOpen}
                    disabled={busy !== null}
                    aria-pressed={booth?.is_open ?? false}
                  >
                    <span className={styles.statusToggleKnob} />
                    <span className={styles.statusToggleLabel}>
                      {booth?.is_open ? '영업 중' : '영업 종료'}
                    </span>
                  </button>
                </div>
              </section>

              {/* ── 준비 중 ── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>준비 중</h3>
                    <p className={styles.sectionDesc}>
                      잠시 주문 받지 않을 때 켜두세요. 영업은 계속됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.statusToggle} ${
                      booth?.is_paused ? styles.statusTogglePaused : styles.statusToggleOn
                    }`}
                    onClick={handleTogglePaused}
                    disabled={!booth?.is_open || busy !== null}
                    aria-pressed={booth?.is_paused ?? false}
                  >
                    <span className={styles.statusToggleKnob} />
                    <span className={styles.statusToggleLabel}>
                      {booth?.is_paused ? '준비 중' : '주문 가능'}
                    </span>
                  </button>
                </div>
              </section>

              {/* ── 즉시판매 메뉴 (재고 관리) ── */}
              {instantMenus.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionHead}>
                    <div>
                      <h3 className={styles.sectionTitle}>즉시판매 메뉴 · 재고</h3>
                      <p className={styles.sectionDesc}>
                        재고가 0이 되면 자동 품절됩니다. 판매 시 자동 차감.
                      </p>
                    </div>
                  </div>
                  <div className={styles.menuList}>
                    {instantMenus.map((menu) => {
                      const soldOut = menu.is_sold_out
                      const stock = menu.stock
                      const hasStock = stock !== null
                      return (
                        <article
                          key={menu.id}
                          className={`${styles.menuCard} ${soldOut ? styles.menuCardSoldOut : ''}`}
                        >
                          <div className={styles.thumb}>
                            {getAssetUrl(menu.image_url) ? (
                              <img src={getAssetUrl(menu.image_url)!} alt={menu.name} />
                            ) : (
                              <div className={styles.thumbPlaceholder}>
                                <ImageIcon />
                              </div>
                            )}
                            {soldOut && <div className={styles.soldOutBadge}>품절</div>}
                          </div>
                          <div className={styles.info}>
                            <div className={styles.nameRow}>
                              <span className={styles.name}>{menu.name}</span>
                            </div>
                            <div className={styles.price}>
                              {menu.price !== null
                                ? `${menu.price.toLocaleString()}원`
                                : '가격 미정'}
                            </div>
                          </div>
                          {hasStock ? (
                            <div className={styles.stockControl}>
                              <button
                                type="button"
                                className={styles.stockBtn}
                                onClick={() => handleStockChange(menu, -10)}
                                disabled={busy !== null || stock <= 0}
                              >
                                <Minus size={14} />
                              </button>
                              <input
                                type="number"
                                className={styles.stockInput}
                                value={stock}
                                onChange={(e) => handleStockInput(menu, e.target.value)}
                                min={0}
                              />
                              <button
                                type="button"
                                className={styles.stockBtn}
                                onClick={() => handleStockChange(menu, 10)}
                                disabled={busy !== null}
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={styles.stockInitBtn}
                              onClick={() => handleStockInput(menu, '50')}
                              disabled={busy !== null}
                            >
                              재고 설정
                            </button>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ── 조리 메뉴 (품절 토글) ── */}
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>
                      {instantMenus.length > 0 ? '조리 메뉴 · 품절 관리' : '메뉴 품절 관리'}
                    </h3>
                    <p className={styles.sectionDesc}>
                      품절 토글 시 손님 앱의 메뉴가 즉시 비활성화돼요.
                    </p>
                  </div>
                </div>

                {cookMenus.length === 0 && instantMenus.length === 0 ? (
                  <div className={styles.empty}>등록된 메뉴가 없습니다.</div>
                ) : cookMenus.length === 0 ? null : (
                  <div className={styles.menuList}>
                    {cookMenus.map((menu) => {
                      const soldOut = menu.is_sold_out
                      const menuBusy = busy === `menu-${menu.id}`
                      return (
                        <article
                          key={menu.id}
                          className={`${styles.menuCard} ${soldOut ? styles.menuCardSoldOut : ''}`}
                        >
                          <div className={styles.thumb}>
                            {getAssetUrl(menu.image_url) ? (
                              <img src={getAssetUrl(menu.image_url)!} alt={menu.name} />
                            ) : (
                              <div className={styles.thumbPlaceholder}>
                                <ImageIcon />
                              </div>
                            )}
                            {soldOut && <div className={styles.soldOutBadge}>품절</div>}
                          </div>
                          <div className={styles.info}>
                            <div className={styles.nameRow}>
                              <span className={styles.name}>{menu.name}</span>
                            </div>
                            <div className={styles.price}>
                              {menu.price !== null
                                ? `${menu.price.toLocaleString()}원`
                                : '가격 미정'}
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`${styles.toggle} ${!soldOut ? styles.toggleOn : ''}`}
                            onClick={() => handleToggleMenu(menu)}
                            disabled={menuBusy || busy !== null}
                            aria-pressed={!soldOut}
                            aria-label={`${menu.name} 판매 토글`}
                          >
                            <span className={styles.toggleKnob} />
                            <span className={styles.toggleLabel}>
                              {soldOut ? '품절' : '판매중'}
                            </span>
                          </button>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.footerBtn} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  )
}
