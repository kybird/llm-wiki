---
title: npm Scoped Publishing
description: 스코프 패키지 배포의 세 함정 — 2FA 강제, private 기본값, 404여도 존재하는 패키지.
status: active
created: 2026-08-30
tags: [pattern]
aliases: [403 two-factor, cannot publish over, 스코프 패키지 배포, npm 404 private]
---

# npm Scoped Publishing

> 스코프 패키지(@scope/name) 발행은 세 단계에서 막힌다: 2FA 강제 정책, private 기본값,
> 그리고 비공개 상태의 겉보기 404. 전부 같은 발행 세션에서 만났다.

### Grounding
- Git Context: `hash:d3ba05e`
- Evidence: doc/raw/2026-08-30.md Case 1
- Confidence: 5/5

### Error
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@kybird%2fllm-wiki - Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.

npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@kybird%2fllm-wiki - You cannot publish over the previously published versions: 0.2.0.

### Analysis
- 2025-11 정책: publish엔 계정 2FA 또는 bypass 2FA granular token이 필요하다.
  CLI는 "Authenticate your account at …" 웹 플로우로 이걸 푼다.
- 스코프 패키지 기본값은 **private** — `--access public`을 빠뜨리면 성공 출력("+ pkg@version")
  이 나도 외부 조회는 404다. 무료 계정인데 성공했다고 믿지 말 것.
- 존재 판정 트릭: 레지스트리 문서가 404여도, 재발행 시 "You cannot publish over the
  previously published versions"가 뜨면 그 버전이 존재하는 것이다.
- 기존 비공개 발행을 공개로 뒤집으려면 재발행 말고 access 변경 — 단, npm 11에서
  `npm access public`은 폐기되었다(하위 명령 변경 확인할 것).

### Related Knowledge
- Concepts: [[qmd-optional-dependency]]
