-- =============================================================================
-- 0016: AR 축제 설정 — ar_festival_settings 테이블 + get/update RPC
-- =============================================================================
--
-- 배경
--  · Phase 3 재설계 (phase3_redesign.md v1.0): 다중 zone 모델 폐기 →
--    축제장 단일 geofence + 런타임 조정 가능 파라미터.
--  · 전 파라미터를 DB 한 곳(`ar_festival_settings`) 에 모아 어드민에서 실시간 편집.
--  · 활성 row 1개 전제 (singleton, partial unique index 로 강제).
--
-- RPC 2종
--  · get_festival_settings()           — 활성 row 반환. 공개 (anon 호출 가능).
--  · update_festival_settings(jsonb)   — 활성 row 갱신 + 유효성 검증.
--
-- 보안 노트 (Phase 3-R1 γ 결정)
--  · 현재 GNfesta 어드민 전체가 sessionStorage 기반 클라 인증.
--  · update_festival_settings 를 SECURITY DEFINER + anon 호출 허용 (공개 RPC) 로 둠.
--  · 전체 어드민 서버 인증 체계 도입 시 service_role 전용으로 전환 예정.
--    (phase3_build.md §후속 보안 작업)
-- =============================================================================


-- =============================================================================
-- 1. ar_festival_settings — 축제 설정 singleton
-- =============================================================================

CREATE TABLE IF NOT EXISTS ar_festival_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '경포해변 봄푸드페스타',

  -- Geofence
  center_lat DOUBLE PRECISION NOT NULL
    CHECK (center_lat BETWEEN -90 AND 90),
  center_lng DOUBLE PRECISION NOT NULL
    CHECK (center_lng BETWEEN -180 AND 180),
  geofence_radius_m INTEGER NOT NULL
    CHECK (geofence_radius_m > 0 AND geofence_radius_m <= 5000),

  -- Spawn scheduling
  spawn_interval_sec INTEGER NOT NULL DEFAULT 45
    CHECK (spawn_interval_sec > 0),
  movement_bonus_distance_m INTEGER NOT NULL DEFAULT 50
    CHECK (movement_bonus_distance_m > 0),

  -- Rarity weights (합 100 강제)
  rarity_weight_common INTEGER NOT NULL DEFAULT 75
    CHECK (rarity_weight_common BETWEEN 0 AND 100),
  rarity_weight_rare INTEGER NOT NULL DEFAULT 22
    CHECK (rarity_weight_rare BETWEEN 0 AND 100),
  rarity_weight_legendary INTEGER NOT NULL DEFAULT 3
    CHECK (rarity_weight_legendary BETWEEN 0 AND 100),
  CONSTRAINT rarity_weights_sum_100
    CHECK (rarity_weight_common + rarity_weight_rare + rarity_weight_legendary = 100),

  -- Capture token
  capture_token_ttl_sec INTEGER NOT NULL DEFAULT 60
    CHECK (capture_token_ttl_sec > 0),
  capture_cooldown_sec INTEGER NOT NULL DEFAULT 0
    CHECK (capture_cooldown_sec >= 0),

  -- 경품 미션 조건 (Phase 3-R3 이후 활용, Phase 4 에서 판정 로직 구현)
  mission_common_count INTEGER NOT NULL DEFAULT 10
    CHECK (mission_common_count >= 0),
  mission_rare_count INTEGER NOT NULL DEFAULT 3
    CHECK (mission_rare_count >= 0),
  mission_legendary_count INTEGER NOT NULL DEFAULT 1
    CHECK (mission_legendary_count >= 0),

  active BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 활성 row 1개 전제 강제 (inactive row 는 여러 개 허용 — 과거 설정 아카이빙 여지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_festival_settings_active
  ON ar_festival_settings (active) WHERE active = true;

DROP TRIGGER IF EXISTS trg_ar_festival_settings_updated_at ON ar_festival_settings;
CREATE TRIGGER trg_ar_festival_settings_updated_at
  BEFORE UPDATE ON ar_festival_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE ar_festival_settings IS
  'AR 축제 런타임 설정. 활성 row 1개 (active=true). 어드민 UI 에서 실시간 편집.';
COMMENT ON COLUMN ar_festival_settings.geofence_radius_m IS
  '축제장 전체 단일 geofence 반경(m). 축제장 50×150m + 여유 → 200m 권장.';
COMMENT ON COLUMN ar_festival_settings.spawn_interval_sec IS
  '스폰 스케줄러 주기(초). R2 클라 훅이 참조.';
COMMENT ON COLUMN ar_festival_settings.movement_bonus_distance_m IS
  '이동 보너스 스폰 발동 임계 거리(m). R2 이후 사용.';
COMMENT ON COLUMN ar_festival_settings.capture_cooldown_sec IS
  '포획 쿨다운(초). 0 = 없음. 실제 적용은 R3.';
COMMENT ON COLUMN ar_festival_settings.mission_common_count IS
  '경품 미션 — common N 조건. 판정 로직은 Phase 4.';


-- =============================================================================
-- 2. RLS — 공개 읽기 + 기존 ar_* 패턴 일관 전면 개방
-- =============================================================================

ALTER TABLE ar_festival_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ar_festival_settings_all" ON ar_festival_settings;
CREATE POLICY "ar_festival_settings_all"
  ON ar_festival_settings
  FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 3. get_festival_settings — 활성 설정 조회 (공개)
-- =============================================================================
-- SECURITY NOTE: Public RPC (SECURITY DEFINER, anon 호출 허용).

CREATE OR REPLACE FUNCTION get_festival_settings()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT to_jsonb(s.*)
  FROM ar_festival_settings s
  WHERE s.active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION get_festival_settings() IS
  '활성 ar_festival_settings row 를 JSONB 로 반환. 없으면 NULL.';


-- =============================================================================
-- 4. update_festival_settings — 설정 갱신 + 유효성 검증
-- =============================================================================
-- SECURITY NOTE: Public RPC (SECURITY DEFINER, anon 호출 허용).
-- 어드민 전용 접근 제한은 현재 클라이언트 sessionStorage 인증에 의존.
-- 전체 어드민 서버 인증 체계 도입 시 service_role 전용으로 전환 예정.
-- (see _DEV/Handoff/phase3_build.md §후속 보안 작업)
--
-- 입력 jsonb 의 키 중 전달된 것만 갱신 (생략 키는 기존 값 유지 — partial update).
-- rarity 3값 합 100 은 필수 (부분 업데이트 시도 차단).

CREATE OR REPLACE FUNCTION update_festival_settings(p_settings JSONB)
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
  v_updated_by TEXT;
  v_row       ar_festival_settings%ROWTYPE;
BEGIN
  -- 현재 활성 row 로드 (partial update 의 기본값)
  SELECT * INTO v_current FROM ar_festival_settings WHERE active = true LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active ar_festival_settings row to update'
      USING HINT = 'seed file 을 먼저 적용하세요 (supabase/seeds/ar_festival_default.sql)';
  END IF;

  -- 각 필드: 전달 시 파싱, 미전달 시 기존값 유지
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
  v_updated_by := COALESCE(p_settings->>'updated_by', v_current.updated_by);

  -- 유효성 검증 (테이블 CHECK 제약이 2차 방어선 역할이지만, 가독성 높은 에러 메시지)
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

  -- 원자 갱신
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
    updated_by                = v_updated_by,
    updated_at                = now()
  WHERE active = true
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION update_festival_settings(JSONB) IS
  '활성 ar_festival_settings row 의 partial update. rarity 합 100 강제. 공개 RPC (어드민 서버 인증 미도입 상태).';


-- =============================================================================
-- 끝. 검증 쿼리
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='ar_festival_settings';
-- SELECT proname FROM pg_proc
--   WHERE proname IN ('get_festival_settings','update_festival_settings');
