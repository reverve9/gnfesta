-- =============================================================================
-- 0015: AR 완주 경품 수령 RPC — claim_ar_prize
-- =============================================================================
--
-- 배경
--  · 도감 완주 (ar_captures 카운트 = 활성 ar_creatures 카운트) 시 수령.
--  · phone UNIQUE 제약 (1인 1회). 재시도 시 23505 감지 → 친절 메시지.
--  · ar_rewards.prize_claim_trigger 마커는 이미 capture_creature 가 발급했을 수 있음.
--    수령은 유저가 명시 액션으로 claim_ar_prize 호출해야 기록됨.
--
-- 반환 JSONB:
--   성공: { ok:true, result:'claimed', claim_id }
--   거절: { ok:false, result:'not_completed'|'already_claimed'|'unknown_error', detail? }
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_ar_prize(
  p_phone TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_capture_count INT;
  v_active_count  INT;
  v_claim_id      BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_capture_count
  FROM ar_captures WHERE phone = p_phone;

  SELECT COUNT(*) INTO v_active_count
  FROM ar_creatures WHERE active = true;

  -- 완주 미달
  IF v_active_count = 0 OR v_capture_count < v_active_count THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'not_completed',
      'detail', jsonb_build_object(
        'captured', v_capture_count,
        'required', v_active_count
      )
    );
  END IF;

  -- 수령 insert (phone UNIQUE 위반 시 already_claimed)
  BEGIN
    INSERT INTO ar_prize_claims (phone)
    VALUES (p_phone)
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'result', 'already_claimed');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'claimed',
    'claim_id', v_claim_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'result', 'unknown_error',
    'detail', jsonb_build_object('sqlstate', SQLSTATE, 'sqlerrm', SQLERRM)
  );
END;
$$;

COMMENT ON FUNCTION claim_ar_prize(TEXT)
  IS 'AR 도감 완주 경품 수령. phone UNIQUE 1인 1회. 미완주 → not_completed / 재시도 → already_claimed.';
