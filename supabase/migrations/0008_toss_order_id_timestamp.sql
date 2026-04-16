-- 0008: generate_toss_order_id() 를 타임스탬프+시퀀스 조합으로 교체
--
-- 문제: DB 시퀀스 리셋(시드/마이그 재실행) 시 과거 Toss merchant 네임스페이스에
--       paid→cancelled 까지 완료된 orderId 와 충돌 → DUPLICATED_ORDER_ID 에러.
--       pending 까지만 간 번호는 재사용 가능하여 "4~5회 성공 후 실패" 패턴 발생.
--
-- 해결: orderId 에 KST 타임스탬프(YYYYMMDDHHmmss) 를 포함시켜 시퀀스 값이
--       같더라도 시간대가 달라 충돌하지 않도록 함.
--       기존 P-00000001 → P-20260416153000-0001 형태로 변경.
--       컬럼(TEXT UNIQUE NOT NULL), 트리거, 시퀀스는 그대로. 함수만 교체.

CREATE OR REPLACE FUNCTION generate_toss_order_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'P-' || to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYYMMDDHH24MISS')
             || '-' || LPAD(nextval('payment_toss_order_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
