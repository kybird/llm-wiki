---
title: qmd-optional-dependency
description: @tobilu/qmd는 선택 의존성 — 없으면 grep으로 강하하고, 있으면 시맨틱이 더해진다.
status: active
created: 2026-08-29
tags: [concept]
aliases: [semantic search optional, findQmd, QMD 설치 위치]
---

# qmd-optional-dependency

> `@tobilu/qmd`는 optionalDependencies다. 설치 위치는 셋(이 패키지/cwd/전역 npm) +
> QMD_CLI_PATH 오버라이드 — findQmd()가 순서대로 찾고, 못 찾으면 null을 돌려준다.

### Grounding
- Evidence: lib/find-qmd.js
- Confidence: 5/5

### Analysis
- null은 오류가 아니라 정상 경로다 — 호출측은 grep-only로 강하한다(설치 강요 없음).
- 컬렉션은 전역 설정(~/.config/qmd)에 등록되므로 프로젝트별 고유 이름이 필수 —
  **Anti-Patterns**: [[shared-default-collection-names]] (init이 폴더명 기본값 + 충돌 경고).
- embed는 GPU를 쓴다(선택): 빌드/실행 문제는 TROUBLESHOOTING.md,
  **Anti-Patterns**: [[cuda-version-coexistence]].

### Related Knowledge
- Patterns: [[always-merge-exact-matching]]
