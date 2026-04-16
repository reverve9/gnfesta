-- 0012: 스탬프 랠리 완주 경품 수령 기록
-- phone 기준 1인 1회. 어드민에서 수령 처리.

CREATE TABLE IF NOT EXISTS stamp_prize_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_by TEXT DEFAULT 'admin',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stamp_prize_claims_phone ON stamp_prize_claims(phone);

ALTER TABLE stamp_prize_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stamp_prize_claims_all" ON stamp_prize_claims FOR ALL USING (true) WITH CHECK (true);
