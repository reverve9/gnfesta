-- =============================================================================
-- 0017: AR zone 모델 폐기 — ar_zones 테이블 삭제 + zone_id FK 컬럼 제거
--        + issue_spawn_token 2파라미터로 축소 + capture_creature DROP
-- =============================================================================
--
-- 배경 (phase3_redesign.md v1.0)
--  · 축제장 50×150m 스케일에서 다중 zone(반경 50m) 모델이 GPS 정밀도 한계로 작동 불가.
--  · 단일 geofence(반경 200m) + 시간/이동 기반 스폰으로 재설계.
--  · ar_zones 및 관련 FK 컬럼(zone_id) 전부 제거.
--
-- 결정 (Phase 3-R1)
--  · Q1-B: `ar_spawn_tokens.zone_id` / `ar_captures.zone_id` / `ar_capture_attempts.zone_id`
--    전부 DROP COLUMN.
--  · Q2-A: `issue_spawn_token` 시그니처에서 p_zone_id 제거 → (p_phone, p_creature_id).
--
-- 부수 처리
--  · `capture_creature` RPC 는 v_token_row.zone_id 등을 여러 곳에서 참조.
--    zone_id 컬럼 제거로 함수 정의가 invalid 해지므로 DROP 후 Phase 4 에서 재설계 예정
--    (HTTP /api/ar/capture 엔드포인트는 아직 미존재 — 실사용 경로 영향 없음).
--  · `zone_rate_limit` 라는 result CHECK 값은 `ar_capture_attempts.result` 제약에 남김.
--    (enum 제약 되돌리지 않음 — 불필요한 churn 회피. Phase 4 가 필요 시 정리.)
--  · `ar_zones` 테이블 DROP.
--
-- 주의
--  · ar_spawn_tokens.zone_id 는 NOT NULL + CASCADE 였음.
--    zone_id=NOT NULL 컬럼을 DROP 하면 CHECK 조건 내 참조가 있는지 PG 가 자동 정리.
--  · 이미 존재하는 row (예: 테스트 seed 로 들어간 token) 는 컬럼 소실 — 무해.
-- =============================================================================


-- =============================================================================
-- 1. capture_creature RPC 선 DROP (zone_id 컬럼 참조 때문)
-- =============================================================================
-- Phase 4 에서 경품 미션 판정 포함하여 재설계. 현재 호출자 없음.

DROP FUNCTION IF EXISTS capture_creature(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);


-- =============================================================================
-- 2. issue_spawn_token — 3파라미터 → 2파라미터 교체
-- =============================================================================
-- PostgreSQL 은 시그니처 변경 시 DROP 필수 (REPLACE 로 파라미터 수 변경 불가).

DROP FUNCTION IF EXISTS issue_spawn_token(TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION issue_spawn_token(
  p_phone       TEXT,
  p_creature_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  TOKEN_TTL_SEC CONSTANT INT := 60;
  v_token TEXT;
BEGIN
  -- TTL 은 R1 에서 하드코딩 60초 유지 (ar_festival_settings.capture_token_ttl_sec 연동은 R3 범위).
  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  INSERT INTO ar_spawn_tokens (token, phone, creature_id, expires_at)
  VALUES (v_token, p_phone, p_creature_id,
          now() + make_interval(secs => TOKEN_TTL_SEC));

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION issue_spawn_token(TEXT, UUID) IS
  '포획 토큰 발급 (TTL 60초). Phase 3-R1: zone_id 파라미터 제거.';


-- =============================================================================
-- 3. zone_id FK 컬럼 DROP (3개 테이블)
-- =============================================================================
-- 각 테이블의 FK/index 는 DROP COLUMN 으로 자동 정리된다 (CASCADE 불필요).

-- ar_spawn_tokens: NOT NULL + CASCADE 였음
ALTER TABLE ar_spawn_tokens DROP COLUMN IF EXISTS zone_id;

-- ar_captures: nullable + SET NULL 이었음. 관련 인덱스는 DROP COLUMN 으로 연쇄 제거
DROP INDEX IF EXISTS idx_ar_captures_zone_time;
ALTER TABLE ar_captures DROP COLUMN IF EXISTS zone_id;

-- ar_capture_attempts: nullable + SET NULL 이었음
DROP INDEX IF EXISTS idx_ar_capture_attempts_zone_time;
ALTER TABLE ar_capture_attempts DROP COLUMN IF EXISTS zone_id;


-- =============================================================================
-- 4. ar_zones 테이블 DROP
-- =============================================================================
-- FK 참조가 이미 제거됐으므로 단순 DROP 가능.

DROP TABLE IF EXISTS ar_zones CASCADE;


-- =============================================================================
-- 끝. 검증 쿼리
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'ar_zones';  -- 0 row
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('ar_spawn_tokens','ar_captures','ar_capture_attempts')
--     AND column_name = 'zone_id';  -- 0 row
-- SELECT proname, pronargs FROM pg_proc
--   WHERE proname = 'issue_spawn_token';  -- 1 row, pronargs = 2
-- SELECT proname FROM pg_proc WHERE proname = 'capture_creature';  -- 0 row
