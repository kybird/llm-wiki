---
title: board 시각화 폐지 — 텍스트 전용
status: done
ordinal: 7000
created: 2026-09-16
---

## Goal
<!-- kanban:goal:begin -->
board에서 --html과 --json 유도물 경로를 없애 텍스트 출력만 남긴다 — 사람용 시각화는 모니터 뷰어 카드로 이관
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 llm-wiki board --html과 board --json이 종료 코드 1로 실패한다(모르는 플래그 안내)
- [x] #2 lib/kanban-cmd.js의 renderBoardHtml·escapeHtml·terminalRecent와 bin의 --html 추출이 사라진다(grep 0건)
- [x] #3 문서 표면(README·AGENTS.md·.gitignore·kanban-plan 스킬)에 board --html/--json 언급이 없다
- [x] #4 기본 텍스트 출력은 그대로이고 npm test가 통과한다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-16T12:35-07:00 — 설계 리뷰(2026-09-16 subagent): ① bin이 --json/--html을 전역 선추출해 validateFlags를 우회한다 — board 디스패치에서 명시 실패(모르는 플래그, exit 1). ② board report --json은 유지 — README --json 목록에서 board→board report로 정정. ③ 인접 결함 처분: board video가 미검증 플래그를 조용히 무시(같은 결함군) — 같은 커밋에서 validateFlags 균일화. ④ USAGE.board 신설해 --help 가드와 단일 출처 유지.

## Handoff

## Result
- 2026-09-16T12:44-07:00 — 폐지 완료 — board --html·--json은 '모르는 플래그' exit 1(실측), renderBoardHtml·escapeHtml·terminalRecent·bin --html 추출 제거(grep 0건), 표면 갱신(README·AGENTS.md·.gitignore·kanban-plan 스킬 v3 — 미러 동기), 인접 결함 board video 미검증 플래그도 같은 커밋에서 validateFlags로 처분. 회귀 5종 신설(test/kanban-board-flags.test.js, npm test 등록), 전체 53/53 통과
