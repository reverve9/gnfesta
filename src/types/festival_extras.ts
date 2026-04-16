/**
 * gnfesta / food 페이지 확장 테이블 타입 (festival_events / festival_guests / food_booths / food_menus)
 * Database 인터페이스에 정식 편입 전 임시 standalone 타입.
 */

export interface FestivalEvent {
  id: string
  festival_id: string
  slug: string | null
  name: string
  kind: 'opening' | 'closing' | 'program'
  schedule: string | null
  venue: string | null
  description: string | null
  thumbnail_url: string | null
  sort_order: number
  is_active: boolean
  /** 스탬프랠리 프로그램 쿠폰 설정 (0007) — false 면 발급 API 거부 */
  coupon_enabled: boolean
  /** 할인액 원. null 이면 서버 기본값(2000) */
  coupon_discount: number | null
  /** 최소 주문액. null 이면 서버 기본값(10000) */
  coupon_min_order: number | null
  /** 발급 시작 (ISO). null = 제한 없음 */
  coupon_starts_at: string | null
  /** 발급 종료 (ISO). null = 제한 없음 */
  coupon_ends_at: string | null
  created_at: string
  updated_at: string
}

export interface FestivalGuest {
  id: string
  festival_id: string
  name: string
  description: string | null
  photo_url: string | null
  link_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * 카테고리는 food_categories 테이블의 slug 를 자유 참조 (소프트 FK).
 * 11_food_categories_table.sql 이후로 union 이 아닌 string.
 */
export type FoodCategory = string

export interface FoodBooth {
  id: string
  festival_id: string
  booth_no: string | null
  name: string
  description: string | null
  category: FoodCategory | null
  thumbnail_url: string | null
  gallery_urls: string[]
  sort_order: number
  is_active: boolean
  is_open: boolean
  is_paused: boolean
  created_at: string
  updated_at: string
}

export interface FoodMenu {
  id: string
  booth_id: string
  name: string
  price: number | null
  description: string | null
  image_url: string | null
  is_signature: boolean
  is_sold_out: boolean
  stock: number | null
  sort_order: number
  is_active: boolean
  menu_type: 'instant' | 'cook'
  created_at: string
  updated_at: string
}

/** food_booths + 그 부스의 menus 묶음 */
export interface FoodBoothWithMenus extends FoodBooth {
  menus: FoodMenu[]
}
