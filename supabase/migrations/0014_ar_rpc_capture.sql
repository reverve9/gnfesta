-- =============================================================================
-- 0014: AR 포획 RPC — capture_creature + 보조 함수
-- =============================================================================
--
-- 배경
--  · GPS 스푸핑은 브라우저 개발자도구로 즉시 가능 → 클라 신뢰 불가.
--  · 브리프 §6-1 의 6단계 검증을 한 트랜잭션(RPC) 안에서 원자 처리.
--  · 거절 경로는 RAISE 대신 JSONB `{ok:false, result:'...'}` 반환.
--    그래야 ar_capture_attempts 에 거절 로그를 남긴 채로 commit 된다
--    (RAISE 시 attempts insert 까지 롤백되어 부정 패턴 분석 불가).
--
-- 임계치 (함수 상단 상수로 선언 — 추후 조정 용이)
--  · RATE_LIMIT_SEC      = 5  (직전 포획 최소 간격)
--  · VELOCITY_KMH_MAX    = 30 (직전 포획→현재 이동속도 상한)
--  · ZONE_WINDOW_MIN     = 10 (존별 시도 카운트 윈도우)
--  · ZONE_WINDOW_MAX_TRY = 5  (윈도우 내 최대 시도)
--  · TOKEN_TTL_SEC       = 60 (issue_spawn_token)
-- =============================================================================


-- =============================================================================
-- 1. haversine_km — 두 좌표간 거리 (km). PostGIS 없이 간이식.
-- =============================================================================

CREATE OR REPLACE FUNCTION haversine_km(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371 * asin(sqrt(
    sin(radians((lat2 - lat1) / 2)) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) *
    sin(radians((lng2 - lng1) / 2)) ^ 2
  ));
$$;


-- =============================================================================
-- 2. generate_ar_reward_code — AR-XXXXXX 형식 (0/1/O/I 제외 32자)
-- =============================================================================
-- 쿠폰 `MS-XXXXXX` 생성 로직(src/lib/coupons.ts)과 동일 알파벳·길이.
-- 내부에 UNIQUE 충돌 체크 루프 (최대 8회 재시도).

CREATE OR REPLACE FUNCTION generate_ar_reward_code()
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code TEXT;
  v_exists BOOLEAN;
  v_i INT;
  v_attempt INT;
BEGIN
  FOR v_attempt IN 1..8 LOOP
    v_code := 'AR-';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    END LOOP;

    SELECT EXISTS(SELECT 1 FROM ar_rewards WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_code;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'AR 보상 코드 생성 실패 (8회 충돌)';
END;
$$;


-- =============================================================================
-- 3. issue_spawn_token — 포획 토큰 발급 (TTL 60초)
-- =============================================================================
-- Phase 3 의 `/api/ar/spawn` 가 호출. 현재 파일에 같이 두어 의존 테이블 일관.

CREATE OR REPLACE FUNCTION issue_spawn_token(
  p_phone       TEXT,
  p_creature_id UUID,
  p_zone_id     UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  TOKEN_TTL_SEC CONSTANT INT := 60;
  v_token TEXT;
BEGIN
  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');

  INSERT INTO ar_spawn_tokens (token, phone, creature_id, zone_id, expires_at)
  VALUES (v_token, p_phone, p_creature_id, p_zone_id,
          now() + make_interval(secs => TOKEN_TTL_SEC));

  RETURN v_token;
END;
$$;


-- =============================================================================
-- 4. capture_creature — 포획 원자 처리 (6단계 검증 + 포획 + 보상 + 토큰 소비)
-- =============================================================================
-- 반환 JSONB 스키마:
--   성공: { ok:true, result:'success', capture_id, rewards:[{code, reward_type, amount, triggered_by}, ...] }
--   거절: { ok:false, result:'invalid_token'|'rate_limit'|'velocity'|'zone_rate_limit'|'duplicate'|'unknown_error', detail? }

CREATE OR REPLACE FUNCTION capture_creature(
  p_token      TEXT,
  p_phone      TEXT,
  p_client_lat DOUBLE PRECISION,
  p_client_lng DOUBLE PRECISION
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  RATE_LIMIT_SEC       CONSTANT INT := 5;
  VELOCITY_KMH_MAX     CONSTANT NUMERIC := 30;
  ZONE_WINDOW_MIN      CONSTANT INT := 10;
  ZONE_WINDOW_MAX_TRY  CONSTANT INT := 5;

  v_token_row     ar_spawn_tokens%ROWTYPE;
  v_last_capture  ar_captures%ROWTYPE;
  v_zone_attempts INT;
  v_dt_sec        NUMERIC;
  v_dist_km       DOUBLE PRECISION;
  v_speed_kmh     NUMERIC;
  v_already_exists BOOLEAN;
  v_creature      ar_creatures%ROWTYPE;

  v_capture_id    BIGINT;
  v_capture_count INT;
  v_active_count  INT;

  v_reward_config JSONB;
  v_rule          JSONB;
  v_rewards_out   JSONB := '[]'::jsonb;
  v_reward_code   TEXT;
  v_reward_id     UUID;
  v_rule_trigger  TEXT;
  v_triggered_by  TEXT;
  v_reward_type   TEXT;
  v_reward_amount INT;
BEGIN
  ------------------------------------------------------------
  -- 1. 토큰 검증
  ------------------------------------------------------------
  SELECT * INTO v_token_row
  FROM ar_spawn_tokens
  WHERE token = p_token
    AND phone = p_phone
    AND consumed_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    INSERT INTO ar_capture_attempts (phone, result, client_lat, client_lng, detail)
    VALUES (p_phone, 'invalid_token', p_client_lat, p_client_lng,
            jsonb_build_object('token_present', p_token IS NOT NULL));
    RETURN jsonb_build_object('ok', false, 'result', 'invalid_token');
  END IF;

  ------------------------------------------------------------
  -- 2. 직전 포획과의 최소 간격 (rate_limit)
  ------------------------------------------------------------
  SELECT * INTO v_last_capture
  FROM ar_captures
  WHERE phone = p_phone
  ORDER BY captured_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_dt_sec := EXTRACT(EPOCH FROM (now() - v_last_capture.captured_at));

    IF v_dt_sec < RATE_LIMIT_SEC THEN
      INSERT INTO ar_capture_attempts
        (phone, creature_id, zone_id, result, client_lat, client_lng, detail)
      VALUES
        (p_phone, v_token_row.creature_id, v_token_row.zone_id,
         'rate_limit', p_client_lat, p_client_lng,
         jsonb_build_object('dt_sec', v_dt_sec, 'limit_sec', RATE_LIMIT_SEC));
      RETURN jsonb_build_object('ok', false, 'result', 'rate_limit',
                                'detail', jsonb_build_object('dt_sec', v_dt_sec));
    END IF;

    ----------------------------------------------------------
    -- 3. 이동 속도 (velocity) — 직전 포획 좌표가 있을 때만
    ----------------------------------------------------------
    IF v_last_capture.client_lat IS NOT NULL
       AND v_last_capture.client_lng IS NOT NULL
       AND p_client_lat IS NOT NULL
       AND p_client_lng IS NOT NULL
       AND v_dt_sec > 0 THEN

      v_dist_km := haversine_km(
        v_last_capture.client_lat, v_last_capture.client_lng,
        p_client_lat, p_client_lng);
      v_speed_kmh := (v_dist_km / v_dt_sec) * 3600;

      IF v_speed_kmh > VELOCITY_KMH_MAX THEN
        INSERT INTO ar_capture_attempts
          (phone, creature_id, zone_id, result, client_lat, client_lng, detail)
        VALUES
          (p_phone, v_token_row.creature_id, v_token_row.zone_id,
           'velocity', p_client_lat, p_client_lng,
           jsonb_build_object('speed_kmh', v_speed_kmh,
                              'dist_km', v_dist_km,
                              'dt_sec', v_dt_sec,
                              'limit_kmh', VELOCITY_KMH_MAX));
        RETURN jsonb_build_object('ok', false, 'result', 'velocity',
                                  'detail', jsonb_build_object('speed_kmh', v_speed_kmh));
      END IF;
    END IF;
  END IF;

  ------------------------------------------------------------
  -- 4. 존별 레이트리밋 (최근 10분 시도 5회 이상이면 거절)
  ------------------------------------------------------------
  SELECT COUNT(*) INTO v_zone_attempts
  FROM ar_capture_attempts
  WHERE phone = p_phone
    AND zone_id = v_token_row.zone_id
    AND attempted_at > now() - make_interval(mins => ZONE_WINDOW_MIN);

  IF v_zone_attempts >= ZONE_WINDOW_MAX_TRY THEN
    INSERT INTO ar_capture_attempts
      (phone, creature_id, zone_id, result, client_lat, client_lng, detail)
    VALUES
      (p_phone, v_token_row.creature_id, v_token_row.zone_id,
       'zone_rate_limit', p_client_lat, p_client_lng,
       jsonb_build_object('window_min', ZONE_WINDOW_MIN,
                          'attempts', v_zone_attempts,
                          'limit', ZONE_WINDOW_MAX_TRY));
    RETURN jsonb_build_object('ok', false, 'result', 'zone_rate_limit',
                              'detail', jsonb_build_object('attempts', v_zone_attempts));
  END IF;

  ------------------------------------------------------------
  -- 5. 중복 포획 사전 체크 (duplicate)
  ------------------------------------------------------------
  SELECT EXISTS(
    SELECT 1 FROM ar_captures
    WHERE phone = p_phone AND creature_id = v_token_row.creature_id
  ) INTO v_already_exists;

  IF v_already_exists THEN
    INSERT INTO ar_capture_attempts
      (phone, creature_id, zone_id, result, client_lat, client_lng)
    VALUES
      (p_phone, v_token_row.creature_id, v_token_row.zone_id,
       'duplicate', p_client_lat, p_client_lng);
    RETURN jsonb_build_object('ok', false, 'result', 'duplicate');
  END IF;

  ------------------------------------------------------------
  -- 6. 성공 경로 — 포획 + 토큰 소비 + 보상 발급
  ------------------------------------------------------------
  BEGIN
    INSERT INTO ar_captures
      (phone, creature_id, zone_id, client_lat, client_lng)
    VALUES
      (p_phone, v_token_row.creature_id, v_token_row.zone_id,
       p_client_lat, p_client_lng)
    RETURNING id INTO v_capture_id;
  EXCEPTION WHEN unique_violation THEN
    -- 레이스 컨디션으로 5번 체크 이후 중복 insert → duplicate 로 처리
    INSERT INTO ar_capture_attempts
      (phone, creature_id, zone_id, result, client_lat, client_lng, detail)
    VALUES
      (p_phone, v_token_row.creature_id, v_token_row.zone_id,
       'duplicate', p_client_lat, p_client_lng,
       jsonb_build_object('race', true));
    RETURN jsonb_build_object('ok', false, 'result', 'duplicate');
  END;

  -- 토큰 소비
  UPDATE ar_spawn_tokens
  SET consumed_at = now()
  WHERE token = p_token;

  -- 포획 캐릭터 정보 (rarity rule 적용에 필요)
  SELECT * INTO v_creature FROM ar_creatures WHERE id = v_token_row.creature_id;

  -- 현재 포획 누적 카운트 (collect_n / collect_all 판정)
  SELECT COUNT(*) INTO v_capture_count FROM ar_captures WHERE phone = p_phone;
  SELECT COUNT(*) INTO v_active_count  FROM ar_creatures WHERE active = true;

  -- reward_config.rules 순회
  SELECT reward_config INTO v_reward_config FROM ar_games WHERE id = 1;
  IF v_reward_config IS NOT NULL THEN
    FOR v_rule IN SELECT * FROM jsonb_array_elements(v_reward_config->'rules')
    LOOP
      v_rule_trigger := v_rule->>'trigger';
      v_triggered_by := NULL;
      v_reward_type  := NULL;
      v_reward_amount := NULL;

      IF v_rule_trigger = 'first_capture' AND v_capture_count = 1 THEN
        v_triggered_by := 'first_capture';
      ELSIF v_rule_trigger = 'collect_n'
            AND v_capture_count = (v_rule->>'n')::int THEN
        v_triggered_by := 'collect_n:' || (v_rule->>'n');
      ELSIF v_rule_trigger = 'rarity'
            AND v_rule->>'rarity' = v_creature.rarity THEN
        v_triggered_by := 'rarity:' || v_creature.rarity;
      ELSIF v_rule_trigger = 'collect_all'
            AND v_active_count > 0
            AND v_capture_count = v_active_count THEN
        v_triggered_by := 'collect_all';
      ELSE
        CONTINUE;  -- 미지의 trigger 또는 미달
      END IF;

      -- 보상 타입 매핑: prize_claim → prize_claim_trigger (마커)
      IF (v_rule->'reward'->>'type') = 'prize_claim' THEN
        v_reward_type := 'prize_claim_trigger';
      ELSE
        v_reward_type := 'voucher';
        IF v_rule->'reward' ? 'amount' THEN
          v_reward_amount := (v_rule->'reward'->>'amount')::int;
        END IF;
      END IF;

      v_reward_code := generate_ar_reward_code();

      INSERT INTO ar_rewards
        (phone, code, reward_type, amount, triggered_by)
      VALUES
        (p_phone, v_reward_code, v_reward_type, v_reward_amount, v_triggered_by)
      RETURNING id INTO v_reward_id;

      v_rewards_out := v_rewards_out || jsonb_build_array(jsonb_build_object(
        'id', v_reward_id,
        'code', v_reward_code,
        'reward_type', v_reward_type,
        'amount', v_reward_amount,
        'triggered_by', v_triggered_by
      ));
    END LOOP;
  END IF;

  -- 성공 로그
  INSERT INTO ar_capture_attempts
    (phone, creature_id, zone_id, result, client_lat, client_lng)
  VALUES
    (p_phone, v_token_row.creature_id, v_token_row.zone_id,
     'success', p_client_lat, p_client_lng);

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'success',
    'capture_id', v_capture_id,
    'creature_id', v_token_row.creature_id,
    'rewards', v_rewards_out
  );

EXCEPTION WHEN OTHERS THEN
  -- 예상치 못한 에러: attempts 에 로그 (이 INSERT 는 새로운 subtxn)
  INSERT INTO ar_capture_attempts
    (phone, result, client_lat, client_lng, detail)
  VALUES
    (p_phone, 'unknown_error', p_client_lat, p_client_lng,
     jsonb_build_object('sqlstate', SQLSTATE, 'sqlerrm', SQLERRM));
  RETURN jsonb_build_object(
    'ok', false, 'result', 'unknown_error',
    'detail', jsonb_build_object('sqlstate', SQLSTATE)
  );
END;
$$;

COMMENT ON FUNCTION capture_creature(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION)
  IS 'AR 포획 원자 RPC. 토큰/레이트/속도/존레이트/중복 검증 → 포획 insert → 보상 발급 → 토큰 소비. 거절은 JSONB 반환 (throw 금지).';
COMMENT ON FUNCTION issue_spawn_token(TEXT, UUID, UUID)
  IS '포획 토큰 발급 (TTL 60초). Phase 3 /api/ar/spawn 에서 호출 예정.';
COMMENT ON FUNCTION generate_ar_reward_code()
  IS 'AR-XXXXXX 보상 코드 생성 (쿠폰 MS-XXXXXX 와 동일 컨벤션, 0/1/O/I 제외).';
COMMENT ON FUNCTION haversine_km(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  IS '두 좌표간 대원거리(km). PostGIS 없이 간이식.';
