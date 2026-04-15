-- =============================================================================
-- 0005: 메뉴/주문 타입 분기 (instant / cook)
-- =============================================================================
--
-- 배경
--  · 봄푸드페스타는 조리 필요(cook) + 즉석판매(instant) 메뉴가 공존.
--  · 같은 부스 안에 두 종류가 섞일 수 있다.
--
-- 설계
--  · food_menus.menu_type    : 메뉴 단위 구분. DEFAULT 'cook'
--  · orders.order_type       : 주문 단위 구분. 결제 생성 시 클라이언트가
--                              items 전체가 instant 면 'instant', 아니면 'cook' 으로 채움.
--                              혼합 주문(cook + instant)은 무조건 'cook' 처리.
--  · instant order 는 markPaymentPaid 시점에 바로 status='completed'
--    + confirmed_at / ready_at = paid_at 으로 채워서 부스 대시보드에선
--    대기/조리중 단계 없이 완료 카드로 바로 들어간다.
--
-- 멱등성
--  · IF NOT EXISTS 로 재실행 안전.
-- =============================================================================

-- food_menus.menu_type
ALTER TABLE food_menus
  ADD COLUMN IF NOT EXISTS menu_type TEXT NOT NULL DEFAULT 'cook'
    CHECK (menu_type IN ('instant', 'cook'));

-- orders.order_type
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'cook'
    CHECK (order_type IN ('instant', 'cook'));

-- 조회 편의 인덱스 (선택적) — 필요 시 주석 해제
-- CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
-- CREATE INDEX IF NOT EXISTS idx_food_menus_menu_type ON food_menus(menu_type);

-- 검증
-- SELECT menu_type, COUNT(*) FROM food_menus GROUP BY menu_type;
-- SELECT order_type, COUNT(*) FROM orders GROUP BY order_type;
