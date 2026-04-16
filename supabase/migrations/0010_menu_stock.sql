-- 0010: instant 메뉴 재고 관리
-- NULL = 재고 관리 안 함 (cook 기본), 0 이상 = 재고 추적
-- 재고가 0 이 되면 is_sold_out 자동 전환

ALTER TABLE food_menus ADD COLUMN IF NOT EXISTS stock INT DEFAULT NULL;

-- 원자적 재고 차감 RPC (race-safe)
CREATE OR REPLACE FUNCTION decrement_menu_stock(p_menu_id UUID, p_qty INT)
RETURNS INT AS $$
DECLARE
  remaining INT;
BEGIN
  UPDATE food_menus
  SET stock = GREATEST(0, stock - p_qty),
      is_sold_out = CASE WHEN stock - p_qty <= 0 THEN true ELSE is_sold_out END
  WHERE id = p_menu_id AND stock IS NOT NULL
  RETURNING stock INTO remaining;

  RETURN COALESCE(remaining, -1);
END;
$$ LANGUAGE plpgsql;
