# Phase 3 빌드 핸드오프 (작성 중 — D+E 완료, G+H 대기)

> **상태**: Phase 3-A~F + D+E 커밋 완료, E2E 검증 대기. 본 문서는 초안 — 체크포인트 ⓒ 통과 후 H 단계에서 확장.
> **작성 기준**: `AR_MODULE_PROJECT_BRIEF.md` v0.3, `PHASE_3_PROMPT.md` v1.0, `phase2_build.md` v1.2

---

## 🚧 초안 범위

이 초안은 Phase 3 진행 중 남겨야 할 **메모 2건**을 잃지 않기 위해 먼저 작성. Phase 3 완료 시 H 단계에서 phase1/2 build.md 구조로 확장 예정:
- 확정 결정사항 표
- 산출물 상세 (A~H)
- 기술 부채 / 알려진 이슈
- 실기 검증 대기 항목
- Phase 4 착수 전 운영 정보

---

## 📝 메모 (현 시점 기록 필요)

### M-1. PlayPage 포획 UI — Phase 2 잔존

PlayPage 의 **로컬 captured state / 포획 토스트 / HUD 포획 완료** 는 Phase 2 잔존 로직. Phase 4 에서 서버 `/api/ar/capture` RPC 응답으로 대체 예정.

- 현재 포획 터치는 **서버 미호출**, 로컬 UI 전환만 발생.
- Phase 3 D+E 수정에서 이 부분을 유지만 하고 서버 연결하지 않음 (범위 준수).
- Phase 4 진입 시 `handleCanvasPointerDown` 내부의 `setActiveSpawn({ captured: true })` 블록을 `capture_creature` RPC 호출 + 응답 분기로 교체.
- 관련 파일: `src/features/ar/pages/PlayPage.tsx` `handleCanvasPointerDown`.

### M-2. iOS gesture chain 순서 — Phase 7 QA 실기 튜닝

현재 `handleStart` 에서 `requestGyro → requestCamera → requestGps` 순으로 호출. Phase 3 는 코드 작성 단계 기준이며, 실기 단말에서 프롬프트 수용성·사용자 당황도·권한 거부율은 **Phase 7 QA 현장 테스트에서 튜닝 항목**.

- 대안 순서 후보: gyro → gps → camera (카메라가 가장 큰 UX 임팩트이므로 마지막 제시) / camera → gyro → gps (시각 피드백 우선).
- 현재 순서 근거: Phase 2 이미 gyro → camera 검증 완료 (iOS 16.4+ 에서 OK). Phase 3 는 gps 만 끝에 추가.
- 관련 파일: `src/features/ar/pages/PlayPage.tsx` `handleStart`.

---

## 🔜 H 단계에서 확장할 섹션 (자리만 예약)

- ✅ Phase 3 확정 결정사항 (프롬프트 §사전 확정 사항 + 실제 구현 결정)
- ✅ 산출물 A~H 상세
- ✅ 번들 분석 (Leaflet 청크 분리)
- ✅ 실기 검증 결과 (DevTools 위치 시뮬레이션 E2E 11건)
- ✅ Phase 4 착수 전 운영 정보 (포획 API · 도감 UI · spawn token → capture 연결 규약)

---

*Phase 3 빌드 핸드오프 v0.1 (초안) — 2026-04-19*
