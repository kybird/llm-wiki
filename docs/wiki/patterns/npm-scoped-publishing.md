---
title: npm Scoped Publishing
description: 스코프 패키지 배포의 네 함정 — 2FA 강제(비-TTY에선 인증 URL 마스킹), private 기본값, 404여도 존재하는 패키지, whoami≠발행권한.
status: active
created: 2026-08-30
tags: [pattern]
aliases: [403 two-factor, cannot publish over, 스코프 패키지 배포, npm 404 private, EOTP, one-time password publish, 토큰 없는 publish 404]
---

# npm Scoped Publishing

> 스코프 패키지(@scope/name) 발행은 네 단계에서 막힌다: 2FA 강제 정책(비-TTY 셸에선
> 인증 URL이 `***`로 마스킹돼 자동화 불가), private 기본값, 비공개 상태의 겉보기 404,
> 그리고 로그인 세션(whoami)과 발행 권한(OTP)의 혼동. 전부 실제 발행 세션에서 만났다.

### Grounding
- Git Context: `hash:d3ba05e`
- Evidence: doc/raw/2026-08-30.md Case 1
- 확장(2026-09-19): v0.4.1·v0.4.2 발행 시도 — doc/raw/2026-09-18.md Case 5 — `whoami kybird`가 통과하는 세션에서도 publish는 EOTP로 실패, 비-TTY 출력의 인증 URL이 리터럴 `***`로 레드닥트돼 감시자·브라우저 자동화 불가
- Confidence: 5/5

### Error
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@kybird%2fllm-wiki - Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.

npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@kybird%2fllm-wiki - You cannot publish over the previously published versions: 0.2.0.

```
npm error code EOTP
npm error This operation requires a one-time password.
npm error Open this URL in your browser to authenticate:
npm error   https://www.npmjs.com/auth/cli/******
```

### Analysis
- 2025-11 정책: publish엔 계정 2FA 또는 bypass 2FA granular token이 필요하다.
  TTY에서는 CLI가 "Authenticate your account at …" 웹 플로우로 이걸 푼다. **비-TTY
  셸(에이전트 백그라운드)에서는 위 Error 인용의 `******`처럼 인증 URL이 리터럴
  별표로 가려진 채 EOTP로 실패한다** — 발행 마지막 한 발은 사람 터미널에서
  `npm publish --access public`으로. 발행 완료 감지는 `npm view <pkg> version`
  폴링으로 자동화한다(2026-09-19 실측 워크플로).
- **whoami 통과 ≠ 발행 권한**: 토큰 없음(E404 위장, 2026-09-10)·로그인됨·OTP 통과는
  서로 다른 단계다. whoami가 `kybird`를 내도 publish는 EOTP로 막힌다.
- 스코프 패키지 기본값은 **private** — `--access public`을 빠뜨리면 성공 출력("+ pkg@version")
  이 나도 외부 조회는 404다. 무료 계정인데 성공했다고 믿지 말 것.
- 존재 판정 트릭: 레지스트리 문서가 404여도, 재발행 시 "You cannot publish over the
  previously published versions"가 뜨면 그 버전이 존재하는 것이다.
- 기존 비공개 발행을 공개로 뒤집으려면 재발행 말고 access 변경 — 단, npm 11에서
  `npm access public`은 폐기되었다(하위 명령 변경 확인할 것).

### Related Knowledge
- Concepts: [[qmd-optional-dependency]]
