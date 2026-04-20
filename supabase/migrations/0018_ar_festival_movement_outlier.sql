-- =============================================================================
-- 0018: AR 설정 확장 (movement_outlier_cap_m) + issue_spawn_token 재작성
--        + update_festival_settings 시그니처 확장
-- =============================================================================
--
-- 배경 (phase3_redesign.md v1.0, PHASE_3_R3_PROMPT v1.0)
--  · 클라 useSpawnScheduler 의 이상치 상한(하드코딩 100m)을 어드민에서 조정 가능하게 함.
--  · issue_spawn_token 의 TTL 을 ar_festival_settings.capture_token_ttl_sec 에서 동적 로드.
--  · 쿨다운 판정을 RPC 내부에서 원자 처리 (Q2=B). 미경과 시 P0001 + 'cooldown_active:<N>'.
--
-- 결정
--  · Q2=B: 쿨다운 검증은 issue_spawn_token 내부에서 최신 토큰 조회 + 거절/발급 원자 처리.
--          SQLSTATE P0001 + MESSAGE 'cooldown_active:<retry_after_sec>' 로 시그널.
--          API 핸들러가 파싱하여 429 + { ok:false, reason:'cooldown', retry_after_sec } 변환.
--  · Q1=γ: outside_geofence 응답은 API 핸들러가 geofence 계산 후 403 반환. 본 마이그레이션
--          범위 아님 (API 레벨 검증).
--  · update_festival_settings: 기존 JSONB 파라미터 유지 + explicit p_movement_outlier_cap_m
--          INTEGER DEFAULT NULL 추가. 어드민 UI 는 계속 JSONB 로 호출 가능(하위호환).
--
-- 멱등성
--  · ADD COLUMN IF NOT EXISTS 로 재실행 안전.
--  · CREATE OR REPLACE / DROP IF EXISTS 로 RPC 재적용 안전.
-- =============================================================================


-- =============================================================================
-- 1. ar_festival_settings — movement_outlier_cap_m 컬럼 추가
-- =============================================================================

ALTER TABLE ar_festival_settings
  ADD COLUMN IF NOT EXISTS movement_outlier_cap_m INTEGER NOT NULL DEFAULT 100;

-- CHECK 제약은 별도 ADD (기존 row 에도 검증됨. DEFAULT 100 은 범위 내).
-- 멱등성: 동일 이름 CHECK 가 이미 있으면 SKIP.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ar_festival_settings_movement_outlier_cap_m_range'
  ) THEN
    ALTER TABLE ar_festival_settings
      ADD CONSTRAINT ar_festival_settings_movement_outlier_cap_m_range
      CHECK (movement_outlier_cap_m >= 1 AND movement_outlier_cap_m <= 10000);
  END IF;
END $$;

COMMENT ON COLUMN ar_festival_settings.movement_outlier_cap_m IS
  '이동 이상치 상한(m). 한 GPS 업데이트에서 해당 거리 초과 이동은 누적에서 제외. 기본 100m.';


-- =============================================================================
-- 2. update_festival_settings — explicit movement_outlier_cap_m 파라미터 추가
-- =============================================================================
-- 시그니처 변경이므로 DROP + CREATE.
-- · 기존 호출자 (어드민 UI) 는 p_settings JSONB 한 개만 전달 → 두번째 파라미터 DEFAULT NULL 로 호환.
-- · 본문에서 p_movement_outlier_cap_m 이 NULL 이면 JSONB 키에서 폴백 → 기존값 유지.
-- · 다른 필드는 기존과 동일한 JSONB 파싱.

DROP FUNCTION IF EXISTS update_festival_settings(JSONB);
DROP FUNCTION IF EXISTS update_festival_settings(JSONB, INTEGER);

CREATE OR REPLACE FUNCTION update_festival_settings(
  p_settings JSONB,
  p_movement_outlier_cap_m INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_current   ar_festival_settings%ROWTYPE;
  v_name      TEXT;
  v_c_lat     DOUBLE PRECISION;
  v_c_lng     DOUBLE PRECISION;
  v_radius    INT;
  v_spawn_int INT;
  v_move_bon  INT;
  v_r_common  INT;
  v_r_rare    INT;
  v_r_legend  INT;
  v_ttl       INT;
  v_cooldown  INT;
  v_mc        INT;
  v_mr        INT;
  v_ml        INT;
  v_outlier   INT;
  v_updated_by TEXT;
  v_row       ar_festival_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_current FROM ar_festival_settings WHERE active = true LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active ar_festival_settings row to update'
      USING HINT = 'seed file 을 먼저 적용하세요 (supabase/seeds/ar_festival_default.sql)';
  END IF;

  v_name      := COALESCE(p_settings->>'name', v_current.name);
  v_c_lat     := COALESCE((p_settings->>'center_lat')::double precision, v_current.center_lat);
  v_c_lng     := COALESCE((p_settings->>'center_lng')::double precision, v_current.center_lng);
  v_radius    := COALESCE((p_settings->>'geofence_radius_m')::int, v_current.geofence_radius_m);
  v_spawn_int := COALESCE((p_settings->>'spawn_interval_sec')::int, v_current.spawn_interval_sec);
  v_move_bon  := COALESCE((p_settings->>'movement_bonus_distance_m')::int, v_current.movement_bonus_distance_m);
  v_r_common  := COALESCE((p_settings->>'rarity_weight_common')::int, v_current.rarity_weight_common);
  v_r_rare    := COALESCE((p_settings->>'rarity_weight_rare')::int, v_current.rarity_weight_rare);
  v_r_legend  := COALESCE((p_settings->>'rarity_weight_legendary')::int, v_current.rarity_weight_legendary);
  v_ttl       := COALESCE((p_settings->>'capture_token_ttl_sec')::int, v_current.capture_token_ttl_sec);
  v_cooldown  := COALESCE((p_settings->>'capture_cooldown_sec')::int, v_current.capture_cooldown_sec);
  v_mc        := COALESCE((p_settings->>'mission_common_count')::int, v_current.mission_common_count);
  v_mr        := COALESCE((p_settings->>'mission_rare_count')::int, v_current.mission_rare_count);
  v_ml        := COALESCE((p_settings->>'mission_legendary_count')::int, v_current.mission_legendary_count);
  v_outlier   := COALESCE(
    p_movement_outlier_cap_m,
    (p_settings->>'movement_outlier_cap_m')::int,
    v_current.movement_outlier_cap_m
  );
  v_updated_by := COALESCE(p_settings->>'updated_by', v_current.updated_by);

  IF v_radius <= 0 OR v_radius > 5000 THEN
    RAISE EXCEPTION 'geofence_radius_m must be in (0, 5000] (got %)', v_radius;
  END IF;
  IF v_spawn_int <= 0 THEN
    RAISE EXCEPTION 'spawn_interval_sec must be > 0 (got %)', v_spawn_int;
  END IF;
  IF v_move_bon <= 0 THEN
    RAISE EXCEPTION 'movement_bonus_distance_m must be > 0 (got %)', v_move_bon;
  END IF;
  IF v_ttl <= 0 THEN
    RAISE EXCEPTION 'capture_token_ttl_sec must be > 0 (got %)', v_ttl;
  END IF;
  IF v_cooldown < 0 THEN
    RAISE EXCEPTION 'capture_cooldown_sec must be >= 0 (got %)', v_cooldown;
  END IF;
  IF v_r_common < 0 OR v_r_rare < 0 OR v_r_legend < 0 THEN
    RAISE EXCEPTION 'rarity weights must be >= 0';
  END IF;
  IF (v_r_common + v_r_rare + v_r_legend) <> 100 THEN
    RAISE EXCEPTION 'rarity weights sum must be 100 (got %)',
                    v_r_common + v_r_rare + v_r_legend;
  END IF;
  IF v_mc < 0 OR v_mr < 0 OR v_ml < 0 THEN
    RAISE EXCEPTION 'mission counts must be >= 0';
  END IF;
  IF v_outlier < 1 OR v_outlier > 10000 THEN
    RAISE EXCEPTION 'movement_outlier_cap_m must be in [1, 10000] (got %)', v_outlier;
  END IF;

  UPDATE ar_festival_settings SET
    name                      = v_name,
    center_lat                = v_c_lat,
    center_lng                = v_c_lng,
    geofence_radius_m         = v_radius,
    spawn_interval_sec        = v_spawn_int,
    movement_bonus_distance_m = v_move_bon,
    rarity_weight_common      = v_r_common,
    rarity_weight_rare        = v_r_rare,
    rarity_weight_legendary   = v_r_legend,
    capture_token_ttl_sec     = v_ttl,
    capture_cooldown_sec      = v_cooldown,
    mission_common_count      = v_mc,
    mission_rare_count        = v_mr,
    mission_legendary_count   = v_ml,
    movement_outlier_cap_m    = v_outlier,
    updated_by                = v_updated_by,
    updated_at                = now()
  WHERE active = true
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION update_festival_settings(JSONB, INTEGER) IS
  '활성 ar_festival_settings row 의 partial update. rarity 합 100 강제. p_movement_outlier_cap_m '
  '는 explicit 파라미터(우선) 또는 p_settings JSONB 키로 전달 가능. 공개 RPC.';


-- =============================================================================
-- 3. issue_spawn_token — TTL 동적 로드 + 쿨다운 내부 판정 (Q2=B)
-- =============================================================================
-- 기존 R1 구현 (TTL 60초 하드코딩, 쿨다운 없음) 교체.
-- 시그니처 불변: (p_phone TEXT, p_creature_id UUID) RETURNS TEXT.
--
-- 로직
--  1. ar_festival_settings 활성 row 조회 (capture_token_ttl_sec, capture_cooldown_sec)
--  2. capture_cooldown_sec > 0 인 경우 phone 의 최신 issued_at 조회 + 경과 시간 비교
--     미경과 시 RAISE EXCEPTION ERRCODE=P0001 MESSAGE='cooldown_active:<N>' (N = 남은 초)
--  3. 통과 시 토큰 생성 + INSERT (TTL = capture_token_ttl_sec)
--  4. active settings 없으면 TTL 60초 기본값 폴백 + 쿨다운 비활성 (안전 기본값).

CREATE OR REPLACE FUNCTION issue_spawn_token(
  p_phone       TEXT,
  p_creature_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ttl_sec      INT;
  v_cooldown_sec INT;
  v_last_issued  TIMESTAMPTZ;
  v_elapsed_sec  INT;
  v_retry_after  INT;
  v_token        TEXT;
BEGIN
  -- 1) settings 로드 (active row). 없으면 안전 기본값.
  SELECT capture_token_ttl_sec, capture_cooldown_sec
    INTO v_ttl_sec, v_cooldown_sec
  FROM ar_festival_settings
  WHERE active = true
  LIMIT 1;

  IF v_ttl_sec IS NULL THEN
    v_ttl_sec := 60;
    v_cooldown_sec := 0;
  END IF;

  -- 2) 쿨다운 판정 (> 0 일 때만).
  IF v_cooldown_sec > 0 THEN
    SELECT issued_at INTO v_last_issued
    FROM ar_spawn_tokens
    WHERE phone = p_phone
    ORDER BY issued_at DESC
    LIMIT 1;

    IF v_last_issued IS NOT NULL THEN
      v_elapsed_sec := EXTRACT(EPOCH FROM (now() - v_last_issued))::INT;
      IF v_elapsed_sec < v_cooldown_sec THEN
        v_retry_after := v_cooldown_sec - v_elapsed_sec;
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = format('cooldown_active:%s', v_retry_after);
      END IF;
    END IF;
  END IF;

  -- 3) 토큰 발급 (TTL = v_ttl_sec).
  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  INSERT INTO ar_spawn_tokens (token, phone, creature_id, expires_at)
  VALUES (v_token, p_phone, p_creature_id,
          now() + make_interval(secs => v_ttl_sec));

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION issue_spawn_token(TEXT, UUID) IS
  '포획 토큰 발급. TTL 은 ar_festival_settings.capture_token_ttl_sec 동적 로드. '
  'capture_cooldown_sec > 0 시 최신 토큰 경과 시간 체크 → 미경과면 P0001 ''cooldown_active:<N>'' RAISE.';


-- =============================================================================
-- 끝. 검증 쿼리
-- =============================================================================
-- SELECT movement_outlier_cap_m FROM ar_festival_settings WHERE active = true;  -- 100
-- SELECT proname, pg_get_function_arguments(oid)
--   FROM pg_proc WHERE proname = 'update_festival_settings';
--   -- 기대: p_settings jsonb, p_movement_outlier_cap_m integer DEFAULT NULL
-- \sf issue_spawn_token
--   -- 기대: ar_festival_settings 조회 + capture_token_ttl_sec 사용
