-- 0011: instant 주문 수령 확인용 타임스탬프
-- 부스에서 "수령완료" 클릭 시 기록. NULL = 미수령.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ DEFAULT NULL;
