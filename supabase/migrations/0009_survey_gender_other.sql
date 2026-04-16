-- 0009: surveys.gender 에 'other' (기타/응답거부) 허용
-- 강릉 봄푸드 페스타 설문에서 성별 선택지가 남/여/기타로 확장됨.

ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_gender_check;
ALTER TABLE surveys ADD CONSTRAINT surveys_gender_check
  CHECK (gender IN ('male', 'female', 'other'));
