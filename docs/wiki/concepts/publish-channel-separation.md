---
status: active
version_context: "llm-wiki 원칙 6.2 · 0.5.1 실측(2026-09-24)"
tags: [distribution, concept]
aliases: [publish 분리, 스킬 채널 분리, 언제 퍼블리시, 배포 타이밍, publish timing, skills sync vs publish, 6.2 원칙]
created: 2026-09-24
confidence: 5
---
# publish-channel-separation

스킬 프롬프트 변경은 git 채널(push + 소비 레포 skills sync)로, CLI 코드 변경은 npm publish로 —
배포 통로를 **변경 표면별로 갈라 놓는** 원칙(plan.md 6.2). "기능 추가했으니 publish?" 질문의
기준은 버전 정책 직관이 아니라 변경이 어느 표면에 찍혔는가다.

## First Principles

- 스킬은 프롬프트다 — 소비 레포의 세션이 읽는 텍스트. git에만 있으면 sync로 당겨올 수 있고
  npm tarball을 거칠 이유가 없다.
- 사본 동기화([[auto-update-copy-source]])의 소스는 '설치된 글로벌 패키지'다 — npm에 안 올린
  스킬은 git 채널 없는 소비 레포에는 영원히 닿지 않는다.

## Details

- 채널 지도: 스킬 프롬프트 → git push + 소비 레포 `llm-wiki skills sync`(git-url 등록 필요).
  CLI·템플릿 → `npm version minor` + `npm publish --access public` → `npm update -g` → 각
  소비 레포에서 능동 명령 1회(auto-update 발동).
- publish 불요 판정: `git diff --stat <마지막 릴리스>..HEAD -- lib bin templates`가 비면
  publish 불요(스킬 단독 변경).
- 유보 비용 체크리스트 — 셋 중 하나가 실제로 아프면 publish한다:
  1. git 채널 미등록 소비 레포의 최신 스킬 미도달(그쪽 사본은 전역 패키지 버전에 묶임)
  2. 정본 레포 사본 핑퐁 지속(커밋마다 수동 복원)
  3. 스킬이 참조하는 신규 CLI 명령(`unpick` 등)과 전역 버전 짝 어긋남
- 스킬-CLI 짝 확인: 스킬을 올릴 때 참조 명령의 최소 CLI 버전을 확인한다 — 전역이 낮으면 스킬의
  일부 지시가 실패한다.

## Trade-offs

- 유보는 절차(브라우저 인증)와 버전 번호를 다음 CLI 변경과 묶어 절약하지만 위 비용을 떠안는다.
- **Anti-Pattern**: "기능 추가 = 무조건 minor publish" — lib/bin 0변경인 publish는 npm diff가
  스킬 1파일인 절차만 남는다. 반대 극단("영원히 유보")도 같은 잘못 — 비용 ①③은 시간이 아니라
  사용자가 키운다.

## Related

- [[auto-update-copy-source]] — publish가 사본 핑퐁을 끝내는 지점
- [[quota-watchdog]] — 유보 사례 본체(work-loop v12, raw Case 5)

## Grounding (References)

- [[2026-09-24]] Case 5 — publish 유보 결정 + 유보 비용 3가지 (confidence 5)
- [[2026-09-24]] Case 3 — 사본 소스 = 실행 중인 바이너리 실측
- [[2026-09-24]] Case 4 — 소비 레포에 닿는 채널이 스킬뿐인 이유
