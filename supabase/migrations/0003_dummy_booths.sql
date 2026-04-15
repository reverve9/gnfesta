-- =============================================================================
-- 0003: etc → beverage(음료) 카테고리 전환 + 더미 부스 50개 시드
-- =============================================================================
--
-- 구성
--  · food_categories: 'etc'(기타) → 'beverage'(음료) 로 교체
--  · food_booths: 50개 더미 투입 (category 별 분류, festival_id = food)
--    - B01~B20 bakery  (베이커리 20)
--    - L01~L10 localfood (로컬푸드 10)
--    - D01~D10 dessert  (디저트 10)
--    - V01~V10 beverage (음료 10)
--
-- 멱등성
--  · food_categories: 기존 row UPDATE (slug 기준)
--  · food_booths: booth_no + festival_id 기준 NOT EXISTS 로 이중 삽입 방지
-- =============================================================================

-- ─── 1) etc → beverage ─────────────────────────────────────────────────────

UPDATE food_categories
   SET slug = 'beverage', label = '음료', sort_order = 4
 WHERE slug = 'etc';


-- ─── 2) 50 더미 부스 ────────────────────────────────────────────────────────

INSERT INTO food_booths (festival_id, booth_no, name, description, category, sort_order, is_active, is_open, is_paused)
SELECT f.id, d.booth_no, d.name, d.description, d.category, d.sort_order, true, true, false
  FROM festivals f,
       (VALUES
         -- ─── Bakery 20 (B01~B20) ───
         ('B01', '초당 빵집',         '초당옥수수 크루아상과 발효종 식빵',         'bakery',    1),
         ('B02', '경포 베이커리',     '해변 풍경이 보이는 프렌치 베이커리',         'bakery',    2),
         ('B03', '강릉 소금빵',       '동해 소금을 쓴 소금빵 전문',                 'bakery',    3),
         ('B04', '안목 스콘하우스',   '버터리한 영국식 스콘 10종',                  'bakery',    4),
         ('B05', '오죽헌 제빵소',     '전통 호두파이와 밤식빵',                     'bakery',    5),
         ('B06', '솔향 베이글',       '뉴욕 스타일 수제 베이글',                    'bakery',    6),
         ('B07', '봄비 브리오슈',     '버터 향 가득한 브리오슈 번',                 'bakery',    7),
         ('B08', '주문진 바게트',     '장작 화덕 바게트 전문',                      'bakery',    8),
         ('B09', '사천진 도넛 공방',  '수제 도넛 12종',                             'bakery',    9),
         ('B10', '강릉 앙버터',       '대표 메뉴 앙버터·쑥앙버터',                  'bakery',   10),
         ('B11', '정동진 치아바타',   '이탈리안 치아바타·포카치아',                 'bakery',   11),
         ('B12', '연곡 크림번',       '크림 가득한 부드러운 번 전문',               'bakery',   12),
         ('B13', '영진 타르트',       '제철 과일 타르트 스튜디오',                  'bakery',   13),
         ('B14', '사천 머핀',         '블루베리·초코 수제 머핀 전문',               'bakery',   14),
         ('B15', '순두부 마들렌',     '초당 순두부 마들렌이 시그니처',              'bakery',   15),
         ('B16', '남대천 호밀빵',     '저당 호밀·통곡물 빵 전문',                   'bakery',   16),
         ('B17', '강릉 카스테라',     '수제 대왕 카스테라',                         'bakery',   17),
         ('B18', '경포대 크루아상',   '겹겹이 층을 살린 크루아상',                  'bakery',   18),
         ('B19', '대관령 모닝빵',     '버터 향 가득한 모닝빵',                      'bakery',   19),
         ('B20', '봄비 스콘스',       '플레인·초코·쑥 스콘',                        'bakery',   20),

         -- ─── Localfood 10 (L01~L10) ───
         ('L01', '초당 순두부',       '강릉 대표 초당 순두부 정식',                 'localfood', 21),
         ('L02', '강릉 황태',         '대관령 덕장 황태구이·황태해장국',            'localfood', 22),
         ('L03', '오징어 순대',       '동해 직송 오징어로 만든 속초식 순대',        'localfood', 23),
         ('L04', '감자옹심이',        '강원 감자로 빚은 쫄깃한 옹심이',             'localfood', 24),
         ('L05', '경포 메밀전',       '구수한 메밀전과 메밀국수',                   'localfood', 25),
         ('L06', '정동진 곤드레',     '곤드레 나물밥과 산채정식',                   'localfood', 26),
         ('L07', '안반데기 감자전',   '고랭지 감자로 만든 감자전',                  'localfood', 27),
         ('L08', '강릉 한과',         '전통 약과·유과 등 한과 모둠',                'localfood', 28),
         ('L09', '오죽헌 떡집',       '강릉 전통 떡 모둠과 절편',                   'localfood', 29),
         ('L10', '주문진 회국수',     '동해 회덮밥과 회국수',                       'localfood', 30),

         -- ─── Dessert 10 (D01~D10) ───
         ('D01', '안목 젤라또',       '이탈리안 수제 젤라또',                       'dessert',   31),
         ('D02', '초당 아이스크림',   '초당옥수수 아이스크림',                      'dessert',   32),
         ('D03', '경포 빙수',         '제철 과일 팥빙수·우유빙수',                  'dessert',   33),
         ('D04', '강릉 티라미수',     '라벤더 티라미수가 시그니처',                 'dessert',   34),
         ('D05', '솔향 마카롱',       '커피향 풍부한 수제 마카롱',                  'dessert',   35),
         ('D06', '봄비 푸딩',         '크림브륄레·바스크 푸딩',                     'dessert',   36),
         ('D07', '초당 추로스',       '스페인식 추로스와 초콜릿 딥 소스',            'dessert',   37),
         ('D08', '사천진 수플레',     '일본식 수플레 팬케이크',                     'dessert',   38),
         ('D09', '남대천 초콜릿',     '카카오 72% 수제 봉봉',                       'dessert',   39),
         ('D10', '주문진 치즈케이크', '바스크 치즈케이크 전문',                     'dessert',   40),

         -- ─── Beverage 10 (V01~V10) ───
         ('V01', '강릉 드립커피',     '스페셜티 핸드드립 전문',                     'beverage',  41),
         ('V02', '안목 에스프레소',   '이탈리안 에스프레소 바',                     'beverage',  42),
         ('V03', '초당 우유',         '초당옥수수 라떼',                            'beverage',  43),
         ('V04', '봄비 티룸',         '한국 전통차·녹차 라떼',                      'beverage',  44),
         ('V05', '경포 에이드',       '제철 과일 에이드',                           'beverage',  45),
         ('V06', '오미자 청',         '수제 오미자청·자몽청',                       'beverage',  46),
         ('V07', '강릉 수제 맥주',    '크래프트 맥주 탭 6종',                       'beverage',  47),
         ('V08', '정동진 과일주스',   '생과일 착즙 주스',                           'beverage',  48),
         ('V09', '솔향 스무디',       '비건 과일 스무디',                           'beverage',  49),
         ('V10', '남대천 발효 음료',  '콤부차·케피어 등 발효 음료',                 'beverage',  50)
       ) AS d(booth_no, name, description, category, sort_order)
 WHERE f.slug = 'food'
   AND NOT EXISTS (
     SELECT 1 FROM food_booths fb
      WHERE fb.festival_id = f.id AND fb.booth_no = d.booth_no
   );


-- ─── 검증 쿼리 (참고) ──────────────────────────────────────────────────────
-- SELECT slug, label, sort_order FROM food_categories ORDER BY sort_order;
--   → bakery/localfood/dessert/beverage 4행
-- SELECT category, COUNT(*) FROM food_booths GROUP BY category ORDER BY category;
--   → bakery 20, dessert 10, beverage 10, localfood 10
-- SELECT COUNT(*) FROM food_booths;   → 50
