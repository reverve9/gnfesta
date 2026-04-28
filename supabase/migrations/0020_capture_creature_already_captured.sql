-- =============================================================================
-- 0020: capture_creature — (phone, creature_id) UNIQUE 사전 체크
--        (Phase 4 Fix 01 — F2)
-- =============================================================================
--
-- 배경 (PHASE_4_FIX01_PROMPT.md §1-1, checkpoint_d_result.md §5 F2)
--  · 0019 의 capture_creature 는 step 6 INSERT 시점에 ar_captures(phone, creature_id)
--    UNIQUE 제약을 처음 만남 → SQLSTATE 23505 가 API 핸들러에 server_error 500 으로
--    버블. 의미상 duplicate 와 다른 케이스 (다른 토큰으로 같은 creature 재포획) 이므로
--    별개 reason 으로 분리하여 사전 체크 후 명시적 reason 반환.
--
-- 결정 (F2-1 ~ F2-4 + 부가 1~3)
--  · 사전 체크 위치: step 3 (token consumed_at 체크) 직후, step 4 (geofence) 진입 전
--    → 주석상 "step 3.5"
--  · 신규 reason: 'already_captured' (duplicate 와 분리). HTTP 409 (duplicate 동일).
--  · 토큰 소비: already_captured 분기에서도 consumed_at = now() UPDATE.
--    이유: 동일 토큰 재탭이 step 3 duplicate 분기로 흡수되어 응답 일관성 유지.
--  · spawn API 측 (phone, creature_id) 사전 체크는 추가 안 함 (scope creep 회피).
--    등급별 다종 에셋 도입 시 동일 등급 내 다종 분포로 자연 해소 가능.
--
-- 스키마 변경 없음. CREATE OR REPLACE FUNCTION 으로 본문 갱신.
-- 시그니처(p_token TEXT, p_phone TEXT, p_client_lat DOUBLE PRECISION,
--          p_client_lng DOUBLE PRECISION, p_captured_at TIMESTAMPTZ DEFAULT now())
-- 불변. velocity / mission / token consume / geofence 본문 동작 무변경.
--
-- 멱등성: CREATE OR REPLACE 로 재실행 안전.
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

  -- (3) 토큰 소비 확인 (duplicate) — 동일 토큰 재탭. 기존 capture_id 동봉
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

  -- (3.5) (phone, creature_id) 사전 UNIQUE 체크 — 다른 토큰으로 같은 creature 재포획
  --       차단. 0019 까지 step 6 INSERT 시점 SQLSTATE 23505 로 버블하던 케이스를
  --       명시적 reason 으로 분리 (Phase 4 Fix 01 / F2).
  --
  --       토큰도 함께 consumed_at = now() 로 마킹 → 동일 토큰 재탭은 다음 호출에서
  --       step 3 duplicate 로 흡수되어 응답 일관성 유지.
  SELECT id INTO v_existing_id
  FROM ar_captures
  WHERE phone = p_phone
    AND creature_id = v_token_row.creature_id
  LIMIT 1;
  IF FOUND THEN
    UPDATE ar_spawn_tokens SET consumed_at = now() WHERE token = p_token;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_captured',
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
  'AR 포획 + 미션 판정 + 경품 발급 원자 RPC (Phase 4 + Fix 01). '
  '거절 시 reason ∈ invalid_token | expired | duplicate | already_captured | outside_geofence | velocity_anomaly. '
  'duplicate = 동일 토큰 재탭. already_captured = 다른 토큰으로 같은 creature 재포획 (Fix 01 추가). '
  '성공 시 capture_id + grade + new_rewards 동봉. '
  'new_rewards 에는 이번 capture 로 신규 발급된 경품만 포함.';

GRANT EXECUTE ON FUNCTION capture_creature(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ)
  TO anon, authenticated;
