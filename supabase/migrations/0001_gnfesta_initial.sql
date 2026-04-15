-- =============================================================================
-- 2026 강릉봄푸드페스타 (GNfesta) — 초기 스키마
-- =============================================================================
--
-- 실행 방법: Supabase Studio → SQL Editor → 이 파일 전체 복붙 → Run
-- (또는 supabase CLI: supabase db push)
--
-- 원본: Moosan(설악무산문화축전) 프로젝트 스키마를 통합·단순화
--  · youth 전용 테이블(programs / applications / participants / form_contents) 제거
--  · 모든 ALTER 를 최종 CREATE TABLE 에 병합
--  · 단일 푸드페스타 컨텍스트로 시드 조정 (festivals: gnfesta + food, food_categories: 4종)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. 공통 유틸 — updated_at 자동 갱신 트리거 함수
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. festivals — 축제 메타 (gnfesta / food 2개 row 로 운영)
-- =============================================================================

CREATE TABLE IF NOT EXISTS festivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,                 -- 'gnfesta' | 'food'
  name TEXT NOT NULL,
  subtitle TEXT,                             -- 영문 부제
  description_lead TEXT,                     -- 첫 단락 (드롭캡/인용 블록)
  description_body TEXT,                     -- 두 번째 단락
  poster_url TEXT,                           -- 좌측 포스터 (storage path)
  schedule TEXT,                             -- '2026년 5월 15일(금) - 17일(일)'
  venue TEXT,                                -- 장소 문자열
  theme_color TEXT,                          -- '#FBF1CC' (festival-tint)
  layout_image_url TEXT,                     -- food 부스 배치도 이미지
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_festivals_updated_at ON festivals;
CREATE TRIGGER trg_festivals_updated_at
  BEFORE UPDATE ON festivals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 2. festival_events — 개·폐막식 / 기타 이벤트 (gnfesta 전용)
-- =============================================================================

CREATE TABLE IF NOT EXISTS festival_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  slug TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'program'
    CHECK (kind IN ('opening', 'closing', 'program')),
  schedule TEXT,
  venue TEXT,
  description TEXT,
  thumbnail_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_events_festival
  ON festival_events(festival_id, sort_order);

DROP TRIGGER IF EXISTS trg_festival_events_updated_at ON festival_events;
CREATE TRIGGER trg_festival_events_updated_at
  BEFORE UPDATE ON festival_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 3. festival_guests — 스페셜 게스트 (gnfesta 전용)
-- =============================================================================

CREATE TABLE IF NOT EXISTS festival_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  link_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_festival_guests_festival
  ON festival_guests(festival_id, sort_order);

DROP TRIGGER IF EXISTS trg_festival_guests_updated_at ON festival_guests;
CREATE TRIGGER trg_festival_guests_updated_at
  BEFORE UPDATE ON festival_guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 4. notices — 공지사항
-- =============================================================================

CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',       -- 업로드 이미지 public URL 배열
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'program', 'result')),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_notices_updated_at ON notices;
CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 5. food_categories — 푸드 매장 카테고리 마스터
-- =============================================================================

CREATE TABLE IF NOT EXISTS food_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE food_categories IS
  '푸드페스타 매장 카테고리 마스터. food_booths.category 가 이 테이블의 slug 를 참조 (소프트 FK).';


-- =============================================================================
-- 6. food_booths — 푸드 부스
-- =============================================================================

CREATE TABLE IF NOT EXISTS food_booths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  booth_no TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                             -- food_categories.slug 참조 (소프트 FK)
  thumbnail_url TEXT,
  gallery_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_open BOOLEAN NOT NULL DEFAULT true,     -- 영업 중
  is_paused BOOLEAN NOT NULL DEFAULT false,  -- 일시 준비 중
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN food_booths.is_open IS '영업 상태. false = 영업 종료';
COMMENT ON COLUMN food_booths.is_paused IS 'true = 영업 중이지만 잠시 주문 받지 않음';

CREATE INDEX IF NOT EXISTS idx_food_booths_festival
  ON food_booths(festival_id, sort_order);

DROP TRIGGER IF EXISTS trg_food_booths_updated_at ON food_booths;
CREATE TRIGGER trg_food_booths_updated_at
  BEFORE UPDATE ON food_booths
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 7. food_menus — 부스별 메뉴
-- =============================================================================

CREATE TABLE IF NOT EXISTS food_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES food_booths(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INT,                                 -- NULL = '시가'
  description TEXT,
  image_url TEXT,
  is_signature BOOLEAN NOT NULL DEFAULT false,
  is_sold_out BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_menus_booth
  ON food_menus(booth_id, sort_order);

DROP TRIGGER IF EXISTS trg_food_menus_updated_at ON food_menus;
CREATE TRIGGER trg_food_menus_updated_at
  BEFORE UPDATE ON food_menus
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 8. payments — Toss 결제 단위 (1 결제 = 1 row, N orders 연결)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS payment_toss_order_seq START 1;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toss_order_id TEXT UNIQUE NOT NULL,        -- 'P-00000001'
  payment_key TEXT,                          -- Toss paymentKey (승인 후)
  phone TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  coupon_id UUID,                            -- FK는 coupons 생성 후 추가
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_phone_created ON payments(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_festival_created ON payments(festival_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_coupon_id ON payments(coupon_id);

-- Toss orderId 자동 생성 (전역 sequence, DELETE 무관)
CREATE OR REPLACE FUNCTION generate_toss_order_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'P-' || LPAD(nextval('payment_toss_order_seq')::TEXT, 8, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_toss_order_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.toss_order_id IS NULL OR NEW.toss_order_id = '' THEN
    NEW.toss_order_id := generate_toss_order_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_set_toss_order_id ON payments;
CREATE TRIGGER trg_payments_set_toss_order_id
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION set_toss_order_id();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 9. booth_order_counters — 부스별 누적 주문 카운터 (DELETE 영향 없음)
-- =============================================================================

CREATE TABLE IF NOT EXISTS booth_order_counters (
  booth_id UUID PRIMARY KEY REFERENCES food_booths(id) ON DELETE CASCADE,
  last_no INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE booth_order_counters IS
  '부스별 누적 주문 카운터. last_no 는 절대 감소하지 않으며 DELETE FROM orders 도 영향 없음.';


-- =============================================================================
-- 10. orders — 부스 scope 주문 (1 payment = N orders)
-- =============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL,         -- 'A01-0515-0001'
  booth_id UUID REFERENCES food_booths(id) ON DELETE SET NULL,
  booth_no TEXT NOT NULL,
  booth_name TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'confirmed', 'completed', 'cancelled')),
  paid_at TIMESTAMPTZ,                       -- 결제 승인 시각 (elapsed 기준)
  confirmed_at TIMESTAMPTZ,                  -- 부스가 주문 확인한 시각
  estimated_minutes INTEGER,                 -- 부스가 선택한 예상 조리시간
  ready_at TIMESTAMPTZ,                      -- 조리 완료 시각
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  cancelled_by TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('booth', 'admin')),
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_booth_status ON orders(booth_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_phone_created ON orders(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_booth_confirmed ON orders(booth_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_at ON orders(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- order_number 생성: per-booth advisory lock + counter upsert
CREATE OR REPLACE FUNCTION generate_booth_order_number(
  p_booth_id UUID,
  p_booth_no TEXT
) RETURNS TEXT AS $$
DECLARE
  date_prefix TEXT;
  next_no INT;
BEGIN
  date_prefix := to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'MMDD');
  PERFORM pg_advisory_xact_lock(hashtext('booth_order_' || p_booth_id::text));

  INSERT INTO booth_order_counters (booth_id, last_no, updated_at)
  VALUES (p_booth_id, 1, now())
  ON CONFLICT (booth_id) DO UPDATE
    SET last_no = booth_order_counters.last_no + 1,
        updated_at = now()
  RETURNING last_no INTO next_no;

  RETURN COALESCE(NULLIF(p_booth_no, ''), 'X')
    || '-' || date_prefix
    || '-' || LPAD(next_no::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_booth_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_booth_order_number(NEW.booth_id, NEW.booth_no);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_set_number ON orders;
CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_booth_order_number();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 11. order_items — 주문 라인 아이템 (순수 메뉴 스냅샷)
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_id UUID REFERENCES food_menus(id) ON DELETE SET NULL,
  menu_name TEXT NOT NULL,
  menu_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);


-- =============================================================================
-- 12. coupons — 번호 입력식 쿠폰 (설문 자동발급 + 수동발급)
-- =============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_amount INTEGER NOT NULL CHECK (discount_amount > 0),
  min_order_amount INTEGER NOT NULL DEFAULT 10000 CHECK (min_order_amount >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used')),
  issued_source TEXT NOT NULL DEFAULT 'manual' CHECK (issued_source IN ('manual', 'survey')),
  issued_phone TEXT,                         -- 수동발급 시 기록용 (free text)
  phone TEXT,                                -- normalizePhone 후 11자리, 조회 인덱스 대상
  note TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_issued_source ON coupons(issued_source);
CREATE INDEX IF NOT EXISTS idx_coupons_expires_at ON coupons(expires_at);
CREATE INDEX IF NOT EXISTS idx_coupons_phone ON coupons(phone);

-- 설문 자동발급: 1 phone = 1 쿠폰 (수동발급은 제약 없음)
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_unique_survey_phone
  ON coupons(phone)
  WHERE issued_source = 'survey' AND phone IS NOT NULL;

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON coupons;
CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- payments.coupon_id FK 는 coupons 생성 후 연결
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_coupon_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_coupon_id_fkey
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;


-- =============================================================================
-- 13. booth_accounts — 부스 직원 로그인 (sessionStorage + bcrypt)
-- =============================================================================

CREATE TABLE IF NOT EXISTS booth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES food_booths(id) ON DELETE CASCADE,
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,               -- bcrypt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booth_accounts_booth ON booth_accounts(booth_id);

DROP TRIGGER IF EXISTS trg_booth_accounts_updated_at ON booth_accounts;
CREATE TRIGGER trg_booth_accounts_updated_at
  BEFORE UPDATE ON booth_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 14. surveys — 만족도 조사
-- =============================================================================

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  festival_id UUID REFERENCES festivals(id) ON DELETE SET NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  age INTEGER NOT NULL CHECK (age > 0 AND age < 150),
  region TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  privacy_consented BOOLEAN NOT NULL DEFAULT false,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 phone + festival 조합 1회만
CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_phone_festival
  ON surveys(phone, festival_id);
CREATE INDEX IF NOT EXISTS idx_surveys_festival_id ON surveys(festival_id);
CREATE INDEX IF NOT EXISTS idx_surveys_created_at ON surveys(created_at DESC);

DROP TRIGGER IF EXISTS trg_surveys_updated_at ON surveys;
CREATE TRIGGER trg_surveys_updated_at
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- 15. booth_waiting_counts — 부스별 미확인 주문 카운트 뷰
-- =============================================================================

CREATE OR REPLACE VIEW booth_waiting_counts AS
SELECT
  fb.id AS booth_id,
  COALESCE(wc.cnt, 0) AS waiting_count
FROM food_booths fb
LEFT JOIN (
  SELECT
    o.booth_id,
    COUNT(*) AS cnt
  FROM orders o
  WHERE o.status = 'paid'
    AND o.confirmed_at IS NULL
    AND o.created_at > now() - INTERVAL '3 hours'
  GROUP BY o.booth_id
) wc ON wc.booth_id = fb.id
WHERE fb.is_active = true;

COMMENT ON VIEW booth_waiting_counts IS
  '부스별 미확인(paid + confirmed_at IS NULL) 주문 건수. 최근 3시간 내, 활성 부스만.';

GRANT SELECT ON booth_waiting_counts TO anon, authenticated;


-- =============================================================================
-- 16. RLS — MVP 단계 전면 개방 (anon 읽기·쓰기 전부 허용)
--   · Supabase Auth 미사용, 어드민 보호는 sessionStorage + UI 가드로 처리
--   · 운영 단계에서 admin-only write 로 강화 필요
-- =============================================================================

ALTER TABLE festivals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_guests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_booths       ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_menus        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_accounts    ENABLE ROW LEVEL SECURITY;

-- 쿠폰/설문은 원본 Moosan 정책대로 RLS 비활성
ALTER TABLE coupons           DISABLE ROW LEVEL SECURITY;
ALTER TABLE surveys           DISABLE ROW LEVEL SECURITY;

-- anon all-open 정책
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'festivals', 'festival_events', 'festival_guests', 'notices',
    'food_categories', 'food_booths', 'food_menus',
    'payments', 'orders', 'order_items', 'booth_order_counters', 'booth_accounts'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%I_all" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_all" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;


-- =============================================================================
-- 17. Realtime publication + REPLICA IDENTITY FULL
-- =============================================================================
-- publication 에 테이블 추가하고 REPLICA IDENTITY 설정 (non-PK 필터 / old row payload)

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'payments', 'orders', 'order_items', 'food_booths', 'food_menus', 'coupons', 'surveys'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;  -- 이미 등록됨
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;


-- =============================================================================
-- 18. Storage — festival-assets 버킷 + public read 정책
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'festival-assets',
  'festival-assets',
  true,
  10485760,  -- 10MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "festival_assets_select" ON storage.objects;
CREATE POLICY "festival_assets_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'festival-assets');

DROP POLICY IF EXISTS "festival_assets_insert" ON storage.objects;
CREATE POLICY "festival_assets_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'festival-assets');

DROP POLICY IF EXISTS "festival_assets_update" ON storage.objects;
CREATE POLICY "festival_assets_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'festival-assets');

DROP POLICY IF EXISTS "festival_assets_delete" ON storage.objects;
CREATE POLICY "festival_assets_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'festival-assets');


-- =============================================================================
-- 19. Seed — festivals (2 rows: gnfesta + food) / food_categories (4종)
-- =============================================================================

INSERT INTO festivals (slug, name, subtitle, description_lead, description_body, schedule, venue, theme_color, sort_order, is_active)
VALUES
  (
    'gnfesta',
    '2026 강릉봄푸드페스타',
    'Gangneung Spring Food Festa 2026',
    '강릉, 봄을 빚다 — 한 입 베어물면, 강릉의 봄 바다가 눈앞에 펼쳐집니다.',
    '강릉의 제철 식재료와 봄의 정취를 한자리에 담은 미식 축제. (본문 미정)',
    '일정 미정',
    '강원특별자치도 강릉시 일원 (장소 미정)',
    '#FBF1CC',
    1,
    true
  ),
  (
    'food',
    '푸드부스 / 참여매장',
    'Food Booths',
    '강릉봄푸드페스타 참여 매장을 한눈에 살펴보세요.',
    NULL,
    '일정 미정',
    '강원특별자치도 강릉시 일원 (장소 미정)',
    '#FBF1CC',
    2,
    true
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO food_categories (slug, label, sort_order)
VALUES
  ('korean',   '한식', 1),
  ('chinese',  '중식', 2),
  ('japanese', '일식', 3),
  ('fusion',   '퓨전', 4)
ON CONFLICT (slug) DO NOTHING;


-- =============================================================================
-- 끝. 검증 쿼리 (참고 — 필요 시 수동 실행)
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT slug, name FROM festivals;
-- SELECT slug, label FROM food_categories ORDER BY sort_order;
-- SELECT pubname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;
