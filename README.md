# 강릉봄푸드페스타 (GNfesta)

> 강릉, 봄을 빚다 — 한 입 베어물면, 강릉의 봄 바다가 눈앞에 펼쳐집니다

React + TypeScript + Vite 기반의 축제 앱. Supabase 를 백엔드로 사용하며 Vercel 에 배포됩니다.

## 개발 환경 시작

```bash
cp .env.example .env   # 실제 값 입력
npm install
npm run dev
```

## 주요 스크립트

- `npm run dev` — 로컬 개발 서버
- `npm run build` — 프로덕션 빌드 (TS 타입체크 포함)
- `npm run lint` — ESLint
- `npm run preview` — 빌드 결과물 미리보기

## 환경변수

`.env.example` 참조. Vercel 배포 시 동일 변수를 **Environment Variables** 에 등록.

## 스택

- React 19 / React Router 7
- Vite 8
- Supabase (`@supabase/supabase-js`)
- Toss Payments
- TypeScript 5.9
