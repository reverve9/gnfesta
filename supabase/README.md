# GNfesta Supabase 마이그레이션

## 초기 셋업 (신규 프로젝트 1회만)

1. Supabase Studio 로그인 → 프로젝트 선택 (`kjtplptbkjlchfmovgph`)
2. 왼쪽 메뉴 **SQL Editor** 진입
3. `migrations/` 하위 파일을 **순번대로** 복사 → 붙여넣기 → **Run**
   - `0001_gnfesta_initial.sql` — 전체 스키마 + 시드 (festivals/food_categories)
   - `0002_food_categories_gnfesta.sql` — 카테고리 GNfesta 용으로 교체 (한·중·일·퓨전 → 베이커리·로컬푸드·디저트·기타)
   - `0003_dummy_booths.sql` — `etc` → `beverage`(음료) + 더미 부스 50개 시드
   - `0004_menus_and_accounts.sql` — 메뉴 100 + 부스 계정 50 시드
   - `0005_menu_type.sql` — 메뉴/주문 타입 분기 (instant / cook)
   - `0006_coupon_sources.sql` — 쿠폰 소스 확장 (payment/program) + client_id + 회수 지원
   - `0007_event_coupon_config.sql` — festival_events 쿠폰 설정(enabled/discount/시간창)
   - `0008_toss_order_id_timestamp.sql` — generate_toss_order_id() 타임스탬프 조합으로 교체 (orderId 충돌 방지)
   - `0009_survey_gender_other.sql` — surveys.gender 에 'other' 허용 (봄푸드 설문 성별 3선택)
   - `0010_menu_stock.sql` — food_menus.stock 컬럼 + decrement_menu_stock RPC (instant 재고 관리)
   - `0011_order_picked_up_at.sql` — orders.picked_up_at (instant 수령 확인)
   - `0012_stamp_prize_claims.sql` — stamp_prize_claims 테이블 (경품 수령 기록)
   - `0013_ar_base_tables.sql` — AR 모듈 Phase 1 기본 스키마 (ar_games + ar_creatures + ar_spawn_tokens + ar_captures + ar_capture_attempts + ar_rewards + ar_prize_claims. ※ 0013 의 ar_zones 는 0017 에서 제거됨)
   - `0014_ar_rpc_capture.sql` — issue_spawn_token / haversine_km / generate_ar_reward_code / capture_creature (※ capture_creature 는 0017 에서 DROP — Phase 4 재설계)
   - `0015_ar_rpc_claim_prize.sql` — claim_ar_prize RPC
   - `0016_ar_festival_settings.sql` — Phase 3-R1 재설계. ar_festival_settings 싱글톤 + get/update RPC
   - `0017_ar_drop_zones.sql` — Phase 3-R1 재설계. ar_zones 폐기 + zone_id 컬럼 DROP + issue_spawn_token 2파라미터로 축소 + capture_creature DROP
4. 에러 없이 완료되면 검증:
   ```sql
   SELECT slug, name FROM festivals;           -- gnfesta / food 2행
   SELECT slug, label FROM food_categories ORDER BY sort_order;
   -- bakery/localfood/dessert/beverage 4행 (0003 적용 후)
   SELECT category, COUNT(*) FROM food_booths GROUP BY category ORDER BY category;
   -- bakery 20 / dessert 10 / beverage 10 / localfood 10 (0003 적용 후)
   SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name;
   ```

## 현재 스키마 (14 테이블 + 1 뷰)

| 테이블 | 역할 |
|---|---|
| `festivals` | 축제 메타 (gnfesta + food 2 row) |
| `festival_events` | 개·폐막식 / 기타 이벤트 |
| `festival_guests` | 스페셜 게스트 |
| `notices` | 공지사항 |
| `food_categories` | 매장 카테고리 마스터 |
| `food_booths` | 푸드 부스 |
| `food_menus` | 부스별 메뉴 |
| `payments` | Toss 결제 헤더 |
| `orders` | 부스별 주문 (1 payment = N orders) |
| `order_items` | 주문 라인 아이템 |
| `coupons` | 번호입력식 쿠폰 (설문/수동/결제/프로그램 — 스탬프랠리 포함) |
| `booth_order_counters` | 부스별 누적 주문번호 카운터 |
| `booth_accounts` | 부스 직원 로그인 (bcrypt) |
| `surveys` | 만족도 조사 (JSONB answers) |
| 뷰 `booth_waiting_counts` | 부스별 미확인 주문 건수 |

## Moosan 대비 변경점

- **제거**: `programs`, `applications`, `participants`, `form_contents` (청소년축전 전용)
- **통합**: 원본 24개 마이그레이션의 모든 ALTER를 최종 CREATE TABLE 에 병합
- **시드 축소**: festivals 2행 + food_categories 4행만 (더미 부스/메뉴/설문 제외)
- **슬러그 리네이밍**: `musan` → `gnfesta`

## RLS 정책

**⚠️ MVP 단계 전면 개방**: anon 키로 모든 테이블 읽기·쓰기 가능.
Supabase Auth 대신 `sessionStorage` + UI 가드로 어드민 보호.
운영 배포 전에 admin-only write 로 강화 필요.

## 실시간 (Realtime)

다음 테이블이 `supabase_realtime` publication 에 등록됨:
- `payments`, `orders`, `order_items` (주문/결제 흐름)
- `food_booths`, `food_menus` (영업상태·품절 토글)
- `coupons`, `surveys` (어드민 통계)

모두 `REPLICA IDENTITY FULL` 로 UPDATE 이벤트의 old row payload + non-PK 컬럼 필터 동작.

## Storage

- 버킷: `festival-assets` (public, 10MB, image/* 만)
- 경로 컨벤션:
  - `festivals/<slug>/poster.png`
  - `festivals/<slug>/layout.png` (푸드 배치도)
  - `festivals/gnfesta/guests/<uuid>.png` (게스트 사진)
  - `booths/<booth_id>/...`, `menus/<menu_id>/...`, `notices/<uuid>.png` 등 자유

## Phase 3-R1 seed — AR 축제 설정 (ar_festival_settings)

Phase 3 재설계(`_DEV/Handoff/phase3_redesign.md` v1.0)로 다중 zone 모델을 폐기하고
축제장 단일 geofence + 런타임 파라미터 모델로 전환. seed 는 활성 설정 row 1개만.

**선행 마이그레이션**: `0016_ar_festival_settings.sql` + `0017_ar_drop_zones.sql`

**파일**: `supabase/seeds/ar_festival_default.sql`

**내용**:
- `ar_festival_settings` 1 row — 경포해변 봄푸드페스타 (center `37.7985, 128.8990`, 반경 200m, 스폰 45s, rarity 75/22/3)
- `ar_creatures` 는 별도 seed (Phase 2 BoxAnimated/CesiumMan/Fox) 유지 — 본 파일 범위 아님.

**실행**:

1. Studio SQL Editor 에서 실행 (권장):
   - 프로젝트 `kjtplptbkjlchfmovgph` → SQL Editor → 파일 내용 복붙 → Run
2. 또는 Supabase CLI:
   ```bash
   psql "$DATABASE_URL" -f supabase/seeds/ar_festival_default.sql
   ```

**멱등**: `WHERE NOT EXISTS (SELECT 1 FROM ar_festival_settings WHERE active=true)` 가드로
재실행 안전. active row 1개가 이미 있으면 INSERT 스킵.

**검증**:
```sql
SELECT id, name, center_lat, center_lng, geofence_radius_m, spawn_interval_sec
  FROM ar_festival_settings WHERE active = true;
SELECT get_festival_settings();
```

**파라미터 변경 경로**: 어드민 `/admin/ar/settings` 페이지에서 편집 → 저장 시
`update_festival_settings(jsonb)` RPC 호출로 즉시 반영.

**DevTools 위치 시뮬레이션 좌표** (Chrome `Sensors` 패널 또는 Safari `Simulate Location`):
- 경포해변 축제장 중심:  `37.7985, 128.8990` (geofence 내부)
- 축제장 외곽 100m:      `37.7995, 128.8998` (geofence 내부, 경계 근처)
- 축제장 멀리 밖:        `37.7632, 128.8996` (강릉역 — geofence 외부)

---

## 참고 — 원본 Moosan Seeds

원본 마이그레이션 파일은 `_DEV/reference/moosan_seeds/` 에 백업됨 (gitignore).
구조 차이 / 과거 결정 이유 확인이 필요하면 이 폴더 참조.
