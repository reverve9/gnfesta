-- =============================================================================
-- 0007: festival_events 쿠폰 설정 필드 (스탬프랠리 프로그램 쿠폰)
-- =============================================================================
--
-- 배경
--  · 0006 에서 coupons.issued_source='program' + (client_id, event_id) unique 를 뚫어뒀음.
--  · 실제 발급 조건(이벤트가 쿠폰 활성 / 지정 시간창 / 할인 정책) 을 이벤트 row 자체에
--    싣는다. 어드민이 이벤트 편집 화면에서 켜고 끄고 기간·할인액을 조절한다.
--
-- 설계
--  · coupon_enabled    : 발급 on/off. false 면 어떤 요청도 거부.
--  · coupon_discount   : 할인액(원). NULL 이면 기본값(2000) 사용.
--  · coupon_min_order  : 최소 주문액. NULL 이면 기본값(10000) 사용.
--  · coupon_starts_at  : 발급 시작 (NULL = 제한 없음)
--  · coupon_ends_at    : 발급 종료 (NULL = 제한 없음)
--    서버 발급 API 가 now() BETWEEN starts_at AND ends_at 검증. NULL 쪽은 스킵.
--
-- 왜 기본값 NULL 인가
--  · 기본값(2000/10000)을 하드코딩해두면 어드민이 "null 인데 2000원 발급" 이라 혼란.
--    명시적으로 null 이면 "서버 기본값" 이라는 규칙.
--
-- 멱등성
--  · ADD COLUMN IF NOT EXISTS 로 재실행 안전.
-- =============================================================================

ALTER TABLE festival_events
  ADD COLUMN IF NOT EXISTS coupon_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_discount INTEGER
    CHECK (coupon_discount IS NULL OR coupon_discount > 0),
  ADD COLUMN IF NOT EXISTS coupon_min_order INTEGER
    CHECK (coupon_min_order IS NULL OR coupon_min_order >= 0),
  ADD COLUMN IF NOT EXISTS coupon_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coupon_ends_at TIMESTAMPTZ;

-- 조회 편의 — 쿠폰 활성화된 이벤트만 필터
CREATE INDEX IF NOT EXISTS idx_festival_events_coupon_enabled
  ON festival_events(festival_id)
  WHERE coupon_enabled = true;

-- 검증
-- SELECT id, name, coupon_enabled, coupon_discount, coupon_starts_at, coupon_ends_at
--   FROM festival_events WHERE coupon_enabled = true;
