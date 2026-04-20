-- =============================================================================
-- 0019: AR 포획 API 재설계 + velocity anti-cheat 컬럼
--        (Phase 4 — PHASE_4_PROMPT.md §1-1 · §1-2 · §1-5)
-- =============================================================================
--
-- 배경
--  · `/api/ar/capture` 엔드포인트 신설을 위해 0017 에서 DROP 된 capture_creature 를
--    geofence 기반으로 재작성. 다중 zone 잔재(rate_limit / zone_rate_limit) 전부 제거.
--  · 서버 검증 순서 (Q2=B · RPC 내부 원자 처리):
--      1) 토큰 존재           → invalid_token
--      2) 토큰 만료           → expired
--      3) 토큰 소비 (duplicate) → duplicate + capture_id
--      4) geofence 재검증      → outside_geofence + distance_m
--      5) velocity 검증        → velocity_anomaly + speed_kmh
--      6) ar_captures INSERT + 토큰 consumed_at UPDATE (동일 트랜잭션)
--      7) 미션 집계·발급 (mission_{common,rare,legendary}_count 기준)
--      8) 응답
--  · Velocity 기본 50 km/h (Q3=A). 첫 capture / 시간차 < 1초 skip.
--  · 경품 발급: 등급별 누적 포획 수 >= mission_count 이고 ar_rewards 에 동일
--    triggered_by ('mission:common' / 'mission:rare' / 'mission:legendary') 없을 때만
--    `generate_ar_reward_code()` 로 신규 INSERT. 결과 JSON 의 new_rewards 에 포함.
--
-- 결정
--  · RPC 반환형: JSONB (claim_ar_prize 패턴). 성공/거절 모두 본체 payload 로 전달.
--    RAISE EXCEPTION 미사용 → API 핸들러 분기 단순화.
--  · 실패 reason 문자열: API 응답 그대로 노출 (invalid_token / expired / duplicate /
--    outside_geofence / velocity_anomaly).
--  · ar_capture_attempts 로그는 본 RPC 에서 미작성 — 기존 CHECK 제약 enum 이 신규
--    reason 과 일치하지 않으므로 schema 불변 원칙 준수 (PHASE_4_PROMPT §2 — 기존 컬럼
--    변경 금지). 로깅은 Phase 6+ 어드민 감사 범위.
--  · update_festival_settings 시그니처 불변. JSONB 에 velocity_cap_kmh 키 추가 파싱만.
--
-- 멱등성
--  · ADD COLUMN IF NOT EXISTS + 별도 CHECK (DO $$) 로 재실행 안전.
--  · CREATE OR REPLACE FUNCTION 로 RPC 재적용 안전.
--  · capture_creature 이전 시그니처 (TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) 는
--    0017 에서 이미 DROP. 본 마이그레이션은 신규 시그니처(+ p_captured_at TIMESTAMPTZ)
--    로 생성하므로 중복 없음.
-- =============================================================================


-- =============================================================================
-- 1. ar_festival_settings — velocity_cap_kmh 컬럼 추가
-- =============================================================================

ALTER TABLE ar_festival_settings
  ADD COLUMN IF NOT EXISTS velocity_cap_kmh INTEGER NOT NULL DEFAULT 50;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ar_festival_settings_velocity_cap_kmh_range'
  ) THEN
    ALTER TABLE ar_festival_settings
      ADD CONSTRAINT ar_festival_settings_velocity_cap_kmh_range
      CHECK (velocity_cap_kmh >= 1 AND velocity_cap_kmh <= 500);
  END IF;
END $$;

COMMENT ON COLUMN ar_festival_settings.velocity_cap_kmh IS
  'velocity anti-cheat 상한(km/h). 직전 capture 와의 평균 속도가 초과하면 velocity_anomaly 거절. 기본 50km/h.';


-- =============================================================================
-- 2. update_festival_settings — velocity_cap_kmh JSONB 파싱 추가
-- =============================================================================
-- 시그니처(p_settings JSONB, p_movement_outlier_cap_m INTEGER DEFAULT NULL) 불변.
-- 본문만 교체하여 velocity_cap_kmh 필드를 partial-update 에 편입.

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
  v_velocity  INT;
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
  v_velocity  := COALESCE((p_settings->>'velocity_cap_kmh')::int, v_current.velocity_cap_kmh);
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
  IF v_velocity < 1 OR v_velocity > 500 THEN
    RAISE EXCEPTION 'velocity_cap_kmh must be in [1, 500] (got %)', v_velocity;
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
    velocity_cap_kmh          = v_velocity,
    updated_by                = v_updated_by,
    updated_at                = now()
  WHERE active = true
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION update_festival_settings(JSONB, INTEGER) IS
  '활성 ar_festival_settings row 의 partial update. rarity 합 100 강제. '
  'p_movement_outlier_cap_m 는 explicit 파라미터(우선) 또는 JSONB 키 가능. '
  'velocity_cap_kmh 는 JSONB 키로만 전달. 공개 RPC.';


-- =============================================================================
-- 3. capture_creature — 포획 + 미션 판정 + 경품 발급 (Phase 4 신규)
-- =============================================================================

CREATE OR REPLACE FUNCTION capture_creature(
  p_token        TEXT,
  p_phone        TEXT,
  p_client_lat   DOUBLE PRECISION,
  p_client_lng   DOUBLE PRECISION,
  p_captured_at  TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_token_row     ar_spawn_tokens%ROWTYPE;
  v_settings      ar_festival_settings%ROWTYPE;
  v_dist_m        DOUBLE PRECISION;
  v_last_capture  ar_captures%ROWTYPE;
  v_elapsed_sec   DOUBLE PRECISION;
  v_delta_km      DOUBLE PRECISION;
  v_speed_kmh     DOUBLE PRECISION;
  v_velocity_cap  INT;
  v_capture_id    BIGINT;
  v_existing_id   BIGINT;
  v_creature      ar_creatures%ROWTYPE;
  v_c_count       INT;
  v_r_count       INT;
  v_l_count       INT;
  v_new_rewards   JSONB := '[]'::jsonb;
  v_reward_code   TEXT;
BEGIN
  -- (1) 토큰 존재 확인
  SELECT * INTO v_token_row FROM ar_spawn_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  -- (2) 토큰 만료 확인
  IF v_token_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- (3) 토큰 소비 확인 (duplicate) — 기존 capture_id 동봉
  IF v_token_row.consumed_at IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM ar_captures
    WHERE phone = v_token_row.phone
      AND creature_id = v_token_row.creature_id
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'duplicate',
      'capture_id', v_existing_id
    );
  END IF;

  -- 설정 로드 (geofence / velocity / mission 판정용). 없으면 예외.
  SELECT * INTO v_settings FROM ar_festival_settings WHERE active = true LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active ar_festival_settings row'
      USING HINT = 'seed file 을 먼저 적용하세요 (supabase/seeds/ar_festival_default.sql)';
  END IF;

  -- (4) geofence 재검증
  v_dist_m := haversine_km(
    v_settings.center_lat, v_settings.center_lng,
    p_client_lat, p_client_lng
  ) * 1000.0;
  IF v_dist_m > v_settings.geofence_radius_m THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'outside_geofence',
      'distance_m', floor(v_dist_m)::int
    );
  END IF;

  -- (5) velocity 검증 (해당 phone 의 직전 capture 와의 평균 속도)
  v_velocity_cap := COALESCE(v_settings.velocity_cap_kmh, 50);
  SELECT * INTO v_last_capture
  FROM ar_captures
  WHERE phone = p_phone
  ORDER BY captured_at DESC
  LIMIT 1;
  IF FOUND
     AND v_last_capture.client_lat IS NOT NULL
     AND v_last_capture.client_lng IS NOT NULL THEN
    v_elapsed_sec := EXTRACT(EPOCH FROM (p_captured_at - v_last_capture.captured_at));
    -- 시간차 < 1초 또는 음수(시계 왜곡) → skip
    IF v_elapsed_sec >= 1 THEN
      v_delta_km := haversine_km(
        v_last_capture.client_lat, v_last_capture.client_lng,
        p_client_lat, p_client_lng
      );
      v_speed_kmh := v_delta_km / (v_elapsed_sec / 3600.0);
      IF v_speed_kmh > v_velocity_cap THEN
        RETURN jsonb_build_object(
          'ok', false,
          'reason', 'velocity_anomaly',
          'speed_kmh', floor(v_speed_kmh)::int
        );
      END IF;
    END IF;
  END IF;

  -- (6) ar_captures INSERT + 토큰 consumed_at UPDATE — 동일 트랜잭션
  INSERT INTO ar_captures (
    phone, creature_id, client_lat, client_lng, captured_at, server_verified_at
  )
  VALUES (
    p_phone, v_token_row.creature_id, p_client_lat, p_client_lng, p_captured_at, now()
  )
  RETURNING id INTO v_capture_id;

  UPDATE ar_spawn_tokens SET consumed_at = now() WHERE token = p_token;

  -- creature 정보 로드 (응답 grade 용)
  SELECT * INTO v_creature FROM ar_creatures WHERE id = v_token_row.creature_id;

  -- (7) 미션 집계 · 경품 발급
  SELECT
    COUNT(*) FILTER (WHERE c.rarity = 'common'),
    COUNT(*) FILTER (WHERE c.rarity = 'rare'),
    COUNT(*) FILTER (WHERE c.rarity = 'legendary')
  INTO v_c_count, v_r_count, v_l_count
  FROM ar_captures ac
  JOIN ar_creatures c ON ac.creature_id = c.id
  WHERE ac.phone = p_phone;

  -- common mission
  IF v_settings.mission_common_count > 0
     AND v_c_count >= v_settings.mission_common_count
     AND NOT EXISTS (
       SELECT 1 FROM ar_rewards
       WHERE phone = p_phone AND triggered_by = 'mission:common'
     ) THEN
    v_reward_code := generate_ar_reward_code();
    INSERT INTO ar_rewards (phone, code, reward_type, triggered_by, status)
    VALUES (p_phone, v_reward_code, 'voucher', 'mission:common', 'active');
    v_new_rewards := v_new_rewards
      || jsonb_build_object('grade', 'common', 'code', v_reward_code);
  END IF;

  -- rare mission
  IF v_settings.mission_rare_count > 0
     AND v_r_count >= v_settings.mission_rare_count
     AND NOT EXISTS (
       SELECT 1 FROM ar_rewards
       WHERE phone = p_phone AND triggered_by = 'mission:rare'
     ) THEN
    v_reward_code := generate_ar_reward_code();
    INSERT INTO ar_rewards (phone, code, reward_type, triggered_by, status)
    VALUES (p_phone, v_reward_code, 'voucher', 'mission:rare', 'active');
    v_new_rewards := v_new_rewards
      || jsonb_build_object('grade', 'rare', 'code', v_reward_code);
  END IF;

  -- legendary mission
  IF v_settings.mission_legendary_count > 0
     AND v_l_count >= v_settings.mission_legendary_count
     AND NOT EXISTS (
       SELECT 1 FROM ar_rewards
       WHERE phone = p_phone AND triggered_by = 'mission:legendary'
     ) THEN
    v_reward_code := generate_ar_reward_code();
    INSERT INTO ar_rewards (phone, code, reward_type, triggered_by, status)
    VALUES (p_phone, v_reward_code, 'voucher', 'mission:legendary', 'active');
    v_new_rewards := v_new_rewards
      || jsonb_build_object('grade', 'legendary', 'code', v_reward_code);
  END IF;

  -- (8) 응답
  RETURN jsonb_build_object(
    'ok', true,
    'capture_id', v_capture_id,
    'grade', v_creature.rarity,
    'new_rewards', v_new_rewards
  );
END;
$$;

COMMENT ON FUNCTION capture_creature(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ) IS
  'AR 포획 + 미션 판정 + 경품 발급 원자 RPC (Phase 4). '
  '거절 시 reason ∈ invalid_token | expired | duplicate | outside_geofence | velocity_anomaly. '
  '성공 시 capture_id + grade + new_rewards 동봉. '
  'new_rewards 에는 이번 capture 로 신규 발급된 경품만 포함.';

GRANT EXECUTE ON FUNCTION capture_creature(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ)
  TO anon, authenticated;
