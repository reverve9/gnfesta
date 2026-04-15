-- =============================================================================
-- 0006: 쿠폰 소스 확장 (payment / program) + client_id + 회수 지원
-- =============================================================================
--
-- 배경
--  · 기존 쿠폰은 설문(survey) 자동발급 + 수동(manual) 두 경로만 있었다.
--  · 스탬프랠리 정책에 따라 두 경로가 추가된다:
--      - payment : 결제 confirm 시 해당 매장 쿠폰 자동발급 (phone 기반)
--      - program : 프로그램 부스에서 스태프 회전 QR 스캔 시 발급
--                  (phone 아님 — localStorage client_id 기반)
--  · 쿠폰함은 (client_id OR phone) 병합 조회.
--
-- 중복방지 정책
--  · survey  : (phone)                     — 기존 유지
--  · payment : (phone, booth_id)           — 같은 매장 재결제해도 1회
--  · program : (client_id, event_id)       — 같은 프로그램 재참여해도 1회
--  · manual  : 제약 없음 (어드민 재량)
--
-- 결제 취소 시 흐름
--  · payment 쿠폰 회수 : issued_from_order_id 로 역추적 → status='cancelled'
--  · 사용된 쿠폰 복원  : 만료 전이면 used→active, used_at/used_payment_id 클리어
--    (application 레이어에서 처리, 스키마는 status='cancelled' 허용만 추가)
--
-- 이중수혜 방지
--  · payment.applied_coupon_id IS NOT NULL 인 결제는 쿠폰 발급 스킵
--    (application 레이어에서 처리)
--
-- 멱등성
--  · IF NOT EXISTS / DROP CONSTRAINT IF EXISTS 로 재실행 안전.
-- =============================================================================

-- ─── 1. status CHECK 확장: 'cancelled' 추가 ─────────────────────────────
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_status_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_status_check
  CHECK (status IN ('active', 'used', 'cancelled'));

-- ─── 2. issued_source CHECK 확장: 'payment', 'program' 추가 ─────────────
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_issued_source_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_issued_source_check
  CHECK (issued_source IN ('manual', 'survey', 'payment', 'program'));

-- ─── 3. 신규 컬럼 ────────────────────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS client_id TEXT,
  ADD COLUMN IF NOT EXISTS booth_id UUID REFERENCES food_booths(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES festival_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_label TEXT,
  ADD COLUMN IF NOT EXISTS issued_from_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

-- ─── 4. unique indexes (소스별 중복방지) ─────────────────────────────────
-- survey (phone) 는 0001 에서 이미 생성됨 (idx_coupons_unique_survey_phone)

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_unique_payment
  ON coupons(phone, booth_id)
  WHERE issued_source = 'payment'
    AND phone IS NOT NULL
    AND booth_id IS NOT NULL
    AND status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_unique_program
  ON coupons(client_id, event_id)
  WHERE issued_source = 'program'
    AND client_id IS NOT NULL
    AND event_id IS NOT NULL
    AND status <> 'cancelled';

-- ─── 5. 조회 indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coupons_client
  ON coupons(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_issued_from_order
  ON coupons(issued_from_order_id)
  WHERE issued_from_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_booth
  ON coupons(booth_id)
  WHERE booth_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_event
  ON coupons(event_id)
  WHERE event_id IS NOT NULL;

-- ─── 검증 쿼리 ───────────────────────────────────────────────────────────
-- SELECT issued_source, status, COUNT(*) FROM coupons GROUP BY 1, 2;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'coupons';
