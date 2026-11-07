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
- **등록 검증의 인터페이스 지도**(2026-11-07 실측, qmd 2.8.3): `collection list`는 이름
  (qmd:// URI)·Pattern·Files·Updated만 노출하고 **경로가 없다** — syncQmd가 경로 드리프트에
  장님이 된 구조적 이유. 경로는 `collection show <name>`의 `Path:` 행에만 있다. `collection
  list`의 `Files: N`(컬렉션별 색인 파일 수)는 update 직후 재조회로 "디렉터리에 .md 있는데
  0건 색인" 경고를 update 출력 캡처 없이 검출하는 통로다. 하위명령: add/list/remove/rename/show.
  관련 사고: [[layout-migration]]의 9일 조용한 실패 — 경로·카운트 검증 없는 "✓ synced"는
  성공이 아니라 침묵이다.

### Grounding
- Evidence: lib/find-qmd.js · `qmd collection list`/`collection show ttswiki` 실측 출력
- [[2026-11-07]] Case 2 — list 미노출·show 노출 분리 발견, Files 파싱 통로 (confidence 5)

### Related Knowledge
- Patterns: [[always-merge-exact-matching]]
