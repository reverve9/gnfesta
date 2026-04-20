-- =============================================================================
-- AR Phase 3-R1 기본 seed — ar_festival_settings 활성 row 1개
-- =============================================================================
--
-- 배경 (phase3_redesign.md v1.0)
--  · 다중 zone 모델 폐기 → 축제장 단일 geofence + 런타임 파라미터.
--  · 초기값은 phase3_redesign.md §3 표 기준.
--  · 중심 좌표는 경포해변 중앙광장 여행자센터 인근 추정값 — Phase 7 QA 전 실측 교체 필요.
--
-- 멱등성
--  · `active = true` 는 partial unique index 로 1행만 허용되므로 재실행 안전.
--  · `ON CONFLICT DO NOTHING` 은 uuid PK 충돌이 사실상 없으므로 효과 제한적 →
--    "이미 active row 가 있으면 skip" 패턴을 WHERE NOT EXISTS 로 구현.
-- =============================================================================

INSERT INTO ar_festival_settings (
  name,
  center_lat, center_lng, geofence_radius_m,
  spawn_interval_sec, movement_bonus_distance_m,
  rarity_weight_common, rarity_weight_rare, rarity_weight_legendary,
  capture_token_ttl_sec, capture_cooldown_sec,
  mission_common_count, mission_rare_count, mission_legendary_count,
  movement_outlier_cap_m,
  active
)
SELECT
  '경포해변 봄푸드페스타',
  37.7985, 128.8990, 200,
  45, 50,
  75, 22, 3,
  60, 0,
  10, 3, 1,
  100,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ar_festival_settings WHERE active = true
);


-- =============================================================================
-- 검증
-- =============================================================================
-- SELECT id, name, center_lat, center_lng, geofence_radius_m, spawn_interval_sec
--   FROM ar_festival_settings WHERE active = true;
-- SELECT get_festival_settings();
