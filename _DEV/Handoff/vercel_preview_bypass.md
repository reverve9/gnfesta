# Vercel Preview 인증 우회 (자동화 테스트용)

Phase 3 수동 테스트에서 확립. **Phase 4~7 curl 테스트에서 매번 재사용**.

---

## 배경

GNfesta 팀 Vercel 프로젝트에 **SSO 기반 Deployment Protection** 이 걸려 있음 → 프리뷰 URL 에 curl 직접 호출 시 **401 Unauthorized** (또는 HTML 로그인 페이지 리턴). 브라우저 세션 수동 우회는 자동화 테스트 부적합.

공식 권장 경로는 **Protection Bypass for Automation** — Vercel 이 발급한 비밀 token 을 쿼리 파라미터로 한 번 넘기면 응답 쿠키가 세팅되어 이후 모든 요청이 통과.

---

## 1회 설정 (관리자)

1. Vercel 대시보드 → 해당 프로젝트 → **Settings → Deployment Protection**
2. **Protection Bypass for Automation** → **Add Secret**
3. 생성된 secret 복사 → 로컬 셸 환경변수 또는 비밀 저장소에 보관.
   **git 커밋 금지** (.env, 셸 rc 파일 등 gitignored 경로만).

---

## curl 사용 패턴

### 첫 요청 — 쿠키 세팅

쿼리 파라미터 2개로 bypass token 전달 + 쿠키 세팅 요청.

```bash
PREVIEW_URL="https://<preview-deployment-url>"
BYPASS="<1회 설정에서 발급받은 secret>"

curl -sL -c /tmp/vcookie \
  "$PREVIEW_URL/<path>?x-vercel-protection-bypass=$BYPASS&x-vercel-set-bypass-cookie=true" \
  -b /tmp/vcookie | jq
```

- `-c /tmp/vcookie` — Vercel 이 내려주는 `_vercel_jwt` 쿠키를 파일에 저장.
- `x-vercel-set-bypass-cookie=true` — 쿠키 발급 지시. `true` / `samesitenone` 두 값 — 대부분 `true` 로 충분.
- 첫 응답은 200 OK + 쿠키 세팅 헤더. 페이로드도 정상 반환되므로 그대로 파이프 가능.

### 이후 요청 — 쿠키 재사용

쿼리 파라미터 없이 쿠키 파일만 넘기면 통과.

```bash
# GET
curl -sL -b /tmp/vcookie "$PREVIEW_URL/api/..." | jq

# POST
curl -sL -b /tmp/vcookie -c /tmp/vcookie \
  -X POST "$PREVIEW_URL/api/..." \
  -H 'Content-Type: application/json' \
  -d '{"...":"..."}' | jq
```

- `-b` 읽기, `-c` 업데이트 — 쿠키 수명 연장을 위해 양쪽 지정 권장.
- 쿠키 만료 시 "401 다시 로그인" 신호 받으면 **첫 요청 절차 재실행**.

---

## 주의

- **Secret 은 비밀**: Git/GitHub Actions 로그/채팅에 노출 금지. 팀 단위 회수·재발급 가능.
- **Scope**: Bypass for Automation 은 같은 프로젝트의 **모든 preview 및 production 배포**에 적용. 특정 배포만 노출하고 싶다면 Vercel 의 per-deployment protection 을 확인.
- **쿠키 파일 위치**: `/tmp/vcookie` 는 재부팅 시 사라짐 — 장기 세션이면 home 디렉토리로 옮기거나 CI 에서는 `$RUNNER_TEMP` 등 사용.
- **HEAD 요청으로 쿠키만 세팅 가능**: 대용량 응답 피하려면 `curl -sL -I -c /tmp/vcookie "$PREVIEW_URL/?…bypass…=true"` 한 번 실행 후 본 요청 분리.
- **프로덕션 도메인 (gnfesta.com 등)에는 사용하지 않음**: Protection Bypass 는 preview 환경 자동화 전용으로만 사용하는 것이 기본 원칙.

---

## 이력

- **2026-04-19** — Phase 3-A~F 배포 후 수동 테스트에서 확립. 5건 curl 검증 통과.
