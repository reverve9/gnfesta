-- =============================================================================
-- Phase 3 테스트용 seed — ar_zones 3개 + ar_creatures 3종
-- =============================================================================
--
-- 목적
--  · 개발 중 DevTools 위치 시뮬레이션으로 구역 진입/퇴장 이벤트 검증
--  · 실외 iPhone 실기 테스트는 Phase 7 QA 범위 (강릉 현장)
--
-- 좌표 기준 (강릉, DevTools 시뮬레이션 시 입력값)
--  · 강릉역               37.7632, 128.8996
--  · 경포대 해변         37.8038, 128.8987
--  · 강릉 중앙시장       37.7525, 128.8781
--  · 인접 간격 >500m → 진입/퇴장 전이 테스트 용이
--
-- 반경 50m (detectZoneEntry TRUST_K=1.5 기준 GPS accuracy 75m 까지 허용)
--  · 실외 GPS 전형 정확도 5~15m → 안정적으로 inside 판정
--  · phase2_build 권장 radius ≥ 30m 충족
--
-- model_url — Phase 2 플레이스홀더 (Khronos CDN)
--  · 상대 경로 저장 → `resolveCreatureModelUrl` 이 `VITE_AR_ASSETS_BASE_URL`
--    (또는 기본 Khronos CDN) 과 결합해 절대 URL 생성
--  · Phase 5 R2 교체 시 env 와 이 row 들의 `model_url` 을 함께 갱신
--
-- 멱등성
--  · `ar_zones` / `ar_creatures` 에 UNIQUE(name) 제약 없음 → 재실행 시 중복 발생.
--    재적용 필요하면 수동 DELETE 후 재실행. README 참조.
-- =============================================================================


INSERT INTO ar_zones (name, center_lat, center_lng, radius_m, spawn_weight, active)
VALUES
  ('강릉역 테스트존',    37.7632, 128.8996, 50, 1.0, true),
  ('경포대 테스트존',    37.8038, 128.8987, 50, 1.0, true),
  ('중앙시장 테스트존',  37.7525, 128.8781, 50, 1.0, true);


INSERT INTO ar_creatures
  (name, rarity, model_url, thumbnail_url, spawn_rate, active, display_order)
VALUES
  ('상자 (일반)',   'common',    'BoxAnimated/glTF-Binary/BoxAnimated.glb',  NULL, 1.0, true, 1),
  ('사람 (희귀)',   'rare',      'CesiumMan/glTF-Binary/CesiumMan.glb',      NULL, 1.0, true, 2),
  ('여우 (전설)',   'legendary', 'Fox/glTF-Binary/Fox.glb',                  NULL, 1.0, true, 3);


-- 검증 쿼리 (참고)
--   SELECT id, name, center_lat, center_lng, radius_m FROM ar_zones WHERE active;
--   SELECT id, name, rarity, model_url FROM ar_creatures WHERE active ORDER BY display_order;
