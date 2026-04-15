-- =============================================================================
-- 0002: food_categories 카테고리 변경 (GNfesta 기준)
-- =============================================================================
--
-- 변경: 한식 / 중식 / 일식 / 퓨전 → 베이커리 / 로컬푸드 / 디저트 / 기타
--
-- food_booths.category 는 slug 소프트 FK (CHECK 제약/외래키 없음) 이므로
-- 기존 rows 삭제 후 신규 insert 로 충분. 혹시 이미 생성된 booth 가 있다면
-- 해당 booth.category 는 null 이 되지 않고 텍스트로 남으므로 별도 UPDATE 필요.
-- 현재는 booth 미등록 상태라 문제 없음.
-- =============================================================================

-- 기존 카테고리 제거
DELETE FROM food_categories
 WHERE slug IN ('korean', 'chinese', 'japanese', 'fusion');

-- GNfesta 신규 카테고리
INSERT INTO food_categories (slug, label, sort_order, is_active)
VALUES
  ('bakery',    '베이커리', 1, true),
  ('localfood', '로컬푸드', 2, true),
  ('dessert',   '디저트',   3, true),
  ('etc',       '기타',     4, true)
ON CONFLICT (slug) DO UPDATE
  SET label      = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      is_active  = EXCLUDED.is_active;

-- 검증
-- SELECT slug, label, sort_order, is_active
--   FROM food_categories ORDER BY sort_order;
