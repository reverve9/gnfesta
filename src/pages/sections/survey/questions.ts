/**
 * 강릉 봄푸드 페스타 만족도 조사 질문 상수.
 * 워드파일(_DEV/reference/강릉봄을빚다_만족도조사.docx) 기반.
 */

// ─── 기본 정보 (Q1~Q4) ────────────────────────────────────────

export const GENDER_OPTIONS = [
  { value: 'male', label: '남자' },
  { value: 'female', label: '여자' },
  { value: 'other', label: '기타 / 응답 거부' },
]

export const AGE_GROUP_OPTIONS = [
  { value: 'teens', label: '10대 이하' },
  { value: '20s', label: '20대' },
  { value: '30s', label: '30대' },
  { value: '40s', label: '40대' },
  { value: '50s', label: '50대' },
  { value: '60plus', label: '60대 이상' },
]

export const AGE_GROUP_REPRESENTATIVE: Record<string, number> = {
  teens: 15,
  '20s': 25,
  '30s': 35,
  '40s': 45,
  '50s': 55,
  '60plus': 65,
}

export const REGION_OPTIONS = [
  { value: 'gangneung', label: '강릉시' },
  { value: 'gangwon', label: '강원도 내 (강릉 제외)' },
  { value: 'capital', label: '수도권 (서울·경기·인천)' },
  { value: 'chungcheong', label: '충청권' },
  { value: 'gyeongsang', label: '경상권' },
  { value: 'jeolla', label: '전라권' },
  { value: 'other', label: '기타' },
]

export const COMPANION_OPTIONS = [
  { value: 'alone', label: '혼자' },
  { value: 'family_child', label: '가족 (자녀 동반)' },
  { value: 'family_no_child', label: '가족 (자녀 미동반)' },
  { value: 'couple', label: '연인/배우자' },
  { value: 'friends', label: '친구/지인' },
  { value: 'group', label: '단체/모임' },
]

// ─── 참여 행태 (Q5~Q8) ────────────────────────────────────────

export const YES_NO_OPTIONS = [
  { value: 'yes', label: '있다' },
  { value: 'no', label: '없다' },
]

export const DECISION_MAKER_OPTIONS = [
  { value: 'self', label: '응답자 본인' },
  { value: 'companion', label: '동반자 (일행)' },
  { value: 'acquaintance', label: '참여하지 않은 지인의 추천' },
  { value: 'other', label: '기타' },
]

export const INFO_SOURCE_OPTIONS = [
  { value: 'sns', label: '인스타그램 / 페이스북 / 틱톡 등 SNS' },
  { value: 'blog', label: '블로그 / 카페 / 포털사이트' },
  { value: 'tv_radio', label: 'TV · 라디오 등 방송' },
  { value: 'newspaper', label: '신문 · 잡지 (온·오프 기사, 광고 포함)' },
  { value: 'official', label: '강릉시 / 강릉문화재단 공식 채널' },
  { value: 'outdoor', label: '옥외 홍보물 (현수막, 포스터 등)' },
  { value: 'word_of_mouth', label: '지인 추천' },
  { value: 'pwa', label: 'PWA 앱 (설악무산·강릉 관련 앱)' },
  { value: 'other', label: '기타' },
]

export const EXPECTATION_OPTIONS = [
  { value: 'localfood', label: '강릉 로컬푸드 및 제철 먹거리 맛보기' },
  { value: 'bread_hangwa', label: '빵 쇼케이스 / 한과 체험 등 체험 프로그램' },
  { value: 'cooking_class', label: '쿠킹클래스 참여' },
  { value: 'market', label: '로컬푸드 마켓 쇼핑' },
  { value: 'performance', label: '공연 · 버스킹 관람' },
  { value: 'seaside', label: '경포 바다와 함께 즐기는 야외 분위기' },
  { value: 'kids', label: '아이들과 함께 즐길 수 있는 체험' },
  { value: 'event', label: '경품 · 이벤트 참여' },
  { value: 'other', label: '기타' },
]

// ─── Q9: 행사 이미지 (양극 7점) ───────────────────────────────

export const IMAGE_ITEMS: { key: string; left: string; right: string }[] = [
  { key: 'ordinary_attractive', left: '평범한', right: '매력적인' },
  { key: 'unpleasant_pleasant', left: '불쾌한', right: '유쾌한' },
  { key: 'uncomfortable_comfortable', left: '불편한', right: '편안한' },
  { key: 'boring_interesting', left: '지루한', right: '흥미로운' },
  { key: 'tacky_stylish', left: '촌스러운', right: '세련된' },
]

// ─── Q10: 프로그램 평가 (7점, 참여 항목만) ────────────────────

export const Q10_ITEMS = [
  { key: 'bread_showcase', label: '10-1. 빵 쇼케이스 내용이 흥미롭고 만족스러웠다' },
  { key: 'hangwa', label: '10-2. 한과 체험은 기대에 부합하였다' },
  { key: 'cooking_class', label: '10-3. 쿠킹클래스 내용과 구성이 적절하였다' },
  { key: 'market_variety', label: '10-4. 로컬푸드 마켓의 상품 다양성이 충분하였다' },
  { key: 'performance', label: '10-5. 공연 · 버스킹은 행사 분위기에 잘 어울렸다' },
  { key: 'stamp_tour', label: '10-6. 패스포트 스탬프 투어가 즐거운 경험이었다' },
  { key: 'local_ingredient', label: '10-7. 강릉 로컬 식재료의 특색이 잘 드러났다' },
  { key: 'food_city_identity', label: '10-8. 창의미식도시 강릉의 정체성이 느껴졌다' },
]

// ─── Q11: 운영 평가 (7점) ─────────────────────────────────────

export const Q11_ITEMS = [
  { key: 'info_access', label: '11-1. 행사 관련 정보를 사전에 쉽게 찾을 수 있었다' },
  { key: 'signage', label: '11-2. 행사장 안내 및 표지판이 충분하고 명확하였다' },
  { key: 'cleanliness', label: '11-3. 부스 및 행사장 환경이 청결하였다' },
  { key: 'staff_kind', label: '11-4. 운영 직원(스태프)의 응대가 친절하였다' },
  { key: 'schedule_fit', label: '11-5. 행사 일정(요일/시간대)이 참여하기에 적절하였다' },
  { key: 'transport', label: '11-6. 행사장까지의 교통 접근성이 편리하였다' },
  { key: 'parking', label: '11-7. 주차 시설이 이용하기 편리하였다' },
]

// ─── Q12: 주관기관 평가 (7점) ─────────────────────────────────

export const Q12_ITEMS = [
  { key: 'staff_attitude', label: '12-1. 주관기관 직원의 태도는 친절하고 만족스러웠다' },
  { key: 'effort', label: '12-2. 행사 구성 및 준비에 대한 노력이 충분히 느껴졌다' },
  { key: 'purpose_fit', label: '12-3. 주관기관은 행사 취지·목적에 적합한 행사를 추진하였다' },
]

// ─── Q13: 종합 만족도 (5점) ───────────────────────────────────

export const SATISFACTION_5_OPTIONS = [
  { value: '1', label: '매우 불만족' },
  { value: '2', label: '불만족' },
  { value: '3', label: '보통' },
  { value: '4', label: '만족' },
  { value: '5', label: '매우 만족' },
]

// ─── Q14: 운영시간 적절성 (5점) ───────────────────────────────

export const APPROPRIATE_5_OPTIONS = [
  { value: '1', label: '매우 부적절했다' },
  { value: '2', label: '부적절했다' },
  { value: '3', label: '보통이다' },
  { value: '4', label: '적절했다' },
  { value: '5', label: '매우 적절했다' },
]

// ─── Q15: 재방문/추천 의향 (7점) ──────────────────────────────

export const Q15_ITEMS = [
  { key: 'revisit', label: '15-1. 내년에 같은 행사에 다시 참여할 의향이 있다' },
  { key: 'similar_event', label: '15-2. 비슷한 유형의 강릉 음식 행사에 참여할 의향이 있다' },
  { key: 'recommend', label: '15-3. 주변 사람들에게 이 행사를 추천할 의향이 있다' },
]

// ─── Q16: 행사 성과 (7점) ─────────────────────────────────────

export const Q16_ITEMS = [
  { key: 'localfood_awareness', label: '16-1. 이번 행사를 통해 강릉 로컬푸드에 대해 더 잘 알게 되었다' },
  { key: 'food_city', label: '16-2. 강릉을 창의미식도시로 인식하게 되었다' },
  { key: 'local_economy', label: '16-3. 이번 행사가 강릉 지역 경제 활성화에 도움이 된다고 생각한다' },
  { key: 'tourism_image', label: '16-4. 이번 행사가 강릉의 관광 이미지 향상에 기여한다고 생각한다' },
  { key: 'seasonal_interest', label: '16-5. 이번 행사를 통해 강릉의 봄 제철 식재료(딸기·감자 등)에 관심이 생겼다' },
]

// ─── Q17: 향후 희망 프로그램 (복수선택) ───────────────────────

export const FUTURE_PROGRAM_OPTIONS = [
  { value: 'chef_demo', label: '더 다양한 쉐프 초청 요리 시연' },
  { value: 'cooking_class', label: '강릉 로컬 식재료 활용 쿠킹클래스 확대' },
  { value: 'hangwa', label: '전통 한과 · 떡 체험 프로그램' },
  { value: 'coffee_dessert', label: '커피 · 디저트 전문 프로그램' },
  { value: 'kids_family', label: '어린이 · 가족 대상 체험 부스' },
  { value: 'performance', label: '공연 · 버스킹 · 문화 프로그램' },
  { value: 'market_expand', label: '로컬푸드 마켓 확대 운영' },
  { value: 'night', label: '야간 행사 연장' },
  { value: 'other', label: '기타' },
]
