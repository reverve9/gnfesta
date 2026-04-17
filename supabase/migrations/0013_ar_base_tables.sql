-- =============================================================================
-- 0013: AR 모듈 기본 스키마 (테이블 8종 + 인덱스 + RLS + Realtime + seed)
-- =============================================================================
--
-- 배경
--  · GNfesta 에 신규 "AR 포획·수집 미니게임" 모듈 추가. 축제당 1 배포 전제
--    (멀티테넌트 없음, `festival_id` / `ar_game_id` FK 도입 금지).
--  · 기존 쿠폰(`coupons`) · 스탬프(`stamp_prize_claims`) 시스템과 완전 분리.
--    AR 보상은 독립 테이블 `ar_rewards` + 독립 코드 prefix `AR-XXXXXX`.
--  · 상세 브리프: `_DEV/Handoff/AR_MODULE_PROJECT_BRIEF.md` (v0.3)
--
-- 테이블 8종
--  1. ar_games            게임 메타 (단일 row, id=1 고정)
--  2. ar_zones            GPS 구역
--  3. ar_creatures        수집 캐릭터 정의
--  4. ar_spawn_tokens     부정 포획 차단용 일회성 토큰 (TTL 60초)
--  5. ar_captures         성공 포획 (UNIQUE phone, creature_id)
--  6. ar_capture_attempts 전 시도 로그 (부정 패턴 분석용)
--  7. ar_rewards          수집 보상 코드 (AR-XXXXXX)
--  8. ar_prize_claims     완주 경품 수령 (phone UNIQUE)
--
-- 정책
--  · MVP 단계 RLS 전면 개방 (기존 0001~0012 관행 일관). anon 키로 RW.
--    운영 배포 전 admin-only write 강화 예정 (별도 이슈).
--  · `capture_creature` / `claim_ar_prize` RPC 는 0014, 0015 에서 정의.
--  · Realtime publication 에 `ar_captures`, `ar_capture_attempts` 추가 (어드민 모니터용).
--
-- 멱등성
--  · 모든 CREATE 에 IF NOT EXISTS.
-- =============================================================================


-- =============================================================================
-- 1. ar_games — 게임 메타 (단일 row 전제)
-- =============================================================================
-- id 를 SMALLINT CHECK(id=1) 로 고정 → row 2개 생성 불가능. singleton 보장.

CREATE TABLE IF NOT EXISTS ar_games (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'AR 게임 (미정)',
  theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'ended')),
  reward_config JSONB NOT NULL DEFAULT '{"rules":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_ar_games_updated_at ON ar_games;
CREATE TRIGGER trg_ar_games_updated_at
  BEFORE UPDATE ON ar_games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE ar_games IS 'AR 게임 메타. 단일 row (id=1) 전제, 축제당 1 배포.';
COMMENT ON COLUMN ar_games.theme_config  IS '테마 색/폰트/배경 등 프리젠테이션 설정 JSONB';
COMMENT ON COLUMN ar_games.reward_config IS '보상 규칙 JSONB — 브리프 §8 스키마 참조 ({rules:[...]})';
COMMENT ON COLUMN ar_games.status        IS 'draft | scheduled | active | ended';


-- =============================================================================
-- 2. ar_zones — GPS 구역
-- =============================================================================

CREATE TABLE IF NOT EXISTS ar_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL
    CHECK (center_lat BETWEEN -90 AND 90),
  center_lng DOUBLE PRECISION NOT NULL
    CHECK (center_lng BETWEEN -180 AND 180),
  radius_m INTEGER NOT NULL
    CHECK (radius_m > 0 AND radius_m <= 5000),
  spawn_weight NUMERIC NOT NULL DEFAULT 1.0
    CHECK (spawn_weight >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_ar_zones_updated_at ON ar_zones;
CREATE TRIGGER trg_ar_zones_updated_at
  BEFORE UPDATE ON ar_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ar_zones_active ON ar_zones(active);

COMMENT ON TABLE ar_zones IS 'AR 게임 GPS 구역. 캐릭터 출현 판정은 구역(Zone) 단위 (정확 좌표 고정 금지).';
COMMENT ON COLUMN ar_zones.radius_m     IS '구역 반경(m). 상한 5000m (오작동 방지).';
COMMENT ON COLUMN ar_zones.spawn_weight IS '구역별 스폰 가중치. 0 = 사실상 비활성.';


-- =============================================================================
-- 3. ar_creatures — 수집 캐릭터 정의
-- =============================================================================

CREATE TABLE IF NOT EXISTS ar_creatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rarity TEXT NOT NULL
    CHECK (rarity IN ('common', 'rare', 'legendary')),
  model_url TEXT,                                -- R2 glTF URL (Phase 2 연동)
  thumbnail_url TEXT,                            -- R2 썸네일 URL
  spawn_rate NUMERIC NOT NULL DEFAULT 0.5
    CHECK (spawn_rate >= 0 AND spawn_rate <= 1),
  unlock_condition JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_ar_creatures_updated_at ON ar_creatures;
CREATE TRIGGER trg_ar_creatures_updated_at
  BEFORE UPDATE ON ar_creatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_ar_creatures_active_order
  ON ar_creatures(active, display_order);

COMMENT ON TABLE ar_creatures IS 'AR 수집 캐릭터 정의 (3D 에셋은 R2 에 저장, 본 테이블엔 URL 만).';
COMMENT ON COLUMN ar_creatures.rarity           IS 'common(70%) / rare(25%) / legendary(5%) 기본 분포 — 게임별 조정';
COMMENT ON COLUMN ar_creatures.spawn_rate       IS '0.0~1.0. rarity × zone.spawn_weight 와 함께 최종 스폰 확률 산출';
COMMENT ON COLUMN ar_creatures.unlock_condition IS '선공개/조건부 출현 규칙 JSONB (선택). NULL = 조건 없음';


-- =============================================================================
-- 4. ar_spawn_tokens — 일회성 포획 토큰 (TTL 60초)
-- =============================================================================
-- 서버가 `/api/ar/spawn` 에서 발급. `/api/ar/capture` 시 토큰 제시 → 서버 검증.
-- 없거나 만료면 `invalid_token` 거절. GPS 스푸핑 기반 부정 포획 차단 핵심.
-- 구 row (expires_at < now()-1d) 정리는 Phase 7 운영 작업 예정 (인덱스만 둠).

CREATE TABLE IF NOT EXISTS ar_spawn_tokens (
  token TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  creature_id UUID NOT NULL REFERENCES ar_creatures(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES ar_zones(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ar_spawn_tokens_phone_expires
  ON ar_spawn_tokens(phone, expires_at);

CREATE INDEX IF NOT EXISTS idx_ar_spawn_tokens_cleanup
  ON ar_spawn_tokens(expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE ar_spawn_tokens IS '일회성 포획 토큰. TTL 60초. capture_creature RPC 가 검증+소비.';
COMMENT ON COLUMN ar_spawn_tokens.consumed_at IS 'NULL = 미사용 (유효). now() 세팅 시 소비 완료 (재사용 금지).';


-- =============================================================================
-- 5. ar_captures — 성공 포획 기록 (1인 1종 1회)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ar_captures (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  creature_id UUID NOT NULL REFERENCES ar_creatures(id) ON DELETE RESTRICT,
  zone_id UUID REFERENCES ar_zones(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_lat DOUBLE PRECISION,
  client_lng DOUBLE PRECISION,
  server_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone, creature_id)
);

CREATE INDEX IF NOT EXISTS idx_ar_captures_phone_time
  ON ar_captures(phone, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_captures_zone_time
  ON ar_captures(zone_id, captured_at DESC);

COMMENT ON TABLE ar_captures IS '성공 포획 기록. UNIQUE(phone, creature_id) = 1인 1종 1회 (수집형 도감).';
COMMENT ON COLUMN ar_captures.server_verified_at IS 'capture_creature RPC 가 검증 통과한 시각 (클라 위변조 방지 기준).';


-- =============================================================================
-- 6. ar_capture_attempts — 전 시도 로그 (실패 포함, 부정 패턴 분석용)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ar_capture_attempts (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  creature_id UUID REFERENCES ar_creatures(id) ON DELETE SET NULL,
  zone_id UUID REFERENCES ar_zones(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT NOT NULL
    CHECK (result IN ('success', 'invalid_token', 'rate_limit', 'velocity', 'zone_rate_limit', 'duplicate', 'unknown_error')),
  client_lat DOUBLE PRECISION,
  client_lng DOUBLE PRECISION,
  detail JSONB
);

CREATE INDEX IF NOT EXISTS idx_ar_capture_attempts_phone_time
  ON ar_capture_attempts(phone, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_capture_attempts_result_time
  ON ar_capture_attempts(result, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_capture_attempts_zone_time
  ON ar_capture_attempts(zone_id, attempted_at DESC)
  WHERE zone_id IS NOT NULL;

COMMENT ON TABLE ar_capture_attempts IS '전 포획 시도 로그. 거절도 반드시 기록 (부정 패턴 분석). success 도 여기에 남음.';
COMMENT ON COLUMN ar_capture_attempts.result IS 'success / invalid_token / rate_limit (5초) / velocity (30km/h) / zone_rate_limit (10분5회) / duplicate / unknown_error';
COMMENT ON COLUMN ar_capture_attempts.detail IS '거절 세부 JSONB (계산된 속도, 직전 포획 시각 등). 어드민 분석용.';


-- =============================================================================
-- 7. ar_rewards — AR 수집 보상 (AR-XXXXXX 코드)
-- =============================================================================
-- 쿠폰(`coupons` 테이블, MS-XXXXXX) 과 완전 분리. 독립 API `/api/ar/rewards/validate`.
-- code 생성 로직은 0014 의 generate_ar_reward_code() 함수가 담당.

CREATE TABLE IF NOT EXISTS ar_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  reward_type TEXT NOT NULL
    CHECK (reward_type IN ('voucher', 'prize_claim_trigger')),
  amount INTEGER
    CHECK (amount IS NULL OR amount > 0),
  triggered_by TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired')),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ar_rewards_phone_status
  ON ar_rewards(phone, status);
CREATE INDEX IF NOT EXISTS idx_ar_rewards_code
  ON ar_rewards(code);

COMMENT ON TABLE ar_rewards IS 'AR 수집 보상 발급 기록. 코드 prefix "AR-" (쿠폰 "MS-" 와 구분).';
COMMENT ON COLUMN ar_rewards.reward_type  IS 'voucher = 할인 보상 / prize_claim_trigger = 완주 경품 트리거 마커 (실제 수령은 ar_prize_claims)';
COMMENT ON COLUMN ar_rewards.amount       IS 'voucher 의 할인액. prize_claim_trigger 는 NULL';
COMMENT ON COLUMN ar_rewards.triggered_by IS 'reward_config rule 식별 — first_capture / collect_n:5 / rarity:legendary / collect_all 등';


-- =============================================================================
-- 8. ar_prize_claims — 완주 경품 수령 (1인 1회)
-- =============================================================================
-- 기존 stamp_prize_claims 와 분리. 한 사람이 양쪽 모두 수령 가능 (정책 명시).

CREATE TABLE IF NOT EXISTS ar_prize_claims (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reward_type TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ar_prize_claims_claimed_at
  ON ar_prize_claims(claimed_at DESC);

COMMENT ON TABLE ar_prize_claims IS 'AR 도감 완주 경품 수령 (1인 1회). stamp_prize_claims 와 별도 탭.';


-- =============================================================================
-- 9. RLS — MVP 전면 개방 (기존 관행)
-- =============================================================================

ALTER TABLE ar_games            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_zones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_creatures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_spawn_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_captures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_capture_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_rewards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_prize_claims     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ar_games', 'ar_zones', 'ar_creatures',
    'ar_spawn_tokens', 'ar_captures', 'ar_capture_attempts',
    'ar_rewards', 'ar_prize_claims'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%I_all" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_all" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;


-- =============================================================================
-- 10. Realtime publication — ar_captures + ar_capture_attempts (어드민 모니터용)
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['ar_captures', 'ar_capture_attempts'])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;  -- 이미 등록됨
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;


-- =============================================================================
-- 11. Seed — ar_games singleton (id=1, status='draft')
-- =============================================================================

INSERT INTO ar_games (id, name, status)
VALUES (1, 'AR 게임 (미정)', 'draft')
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 끝. 검증 쿼리 (참고)
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'ar\_%' ORDER BY table_name;
-- SELECT * FROM ar_games;
-- SELECT pubname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename LIKE 'ar\_%';
