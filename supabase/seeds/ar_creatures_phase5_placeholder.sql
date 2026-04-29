-- Phase 5 placeholder: 2D plane primitives.
--
-- ar_creatures.model_url / thumbnail_url 을 클라 측 CreatureLoader (3D plane) ·
-- CollectionPage (단색 썸네일) 양쪽이 인식하는 `primitive:plane:<grade>` 형식으로
-- 갱신한다. 스키마 변경 없음 (마이그 발행 X) — seed UPDATE 만.
--
-- 실 에셋 도입 Phase 에서 본 UPDATE 를 무력화하고 R2 등 호스팅 절대 URL
-- (또는 베이스 URL 상대경로) 로 갱신.

UPDATE ar_creatures
SET model_url = 'primitive:plane:common',
    thumbnail_url = 'primitive:plane:common'
WHERE active = true AND rarity = 'common';

UPDATE ar_creatures
SET model_url = 'primitive:plane:rare',
    thumbnail_url = 'primitive:plane:rare'
WHERE active = true AND rarity = 'rare';

UPDATE ar_creatures
SET model_url = 'primitive:plane:legendary',
    thumbnail_url = 'primitive:plane:legendary'
WHERE active = true AND rarity = 'legendary';
