---
title: 카드 모델 — milestone 필드와 kind
status: done
ordinal: 7000
created: 2026-09-16
---

## Goal
<!-- kanban:goal:begin -->
멤버 카드의 milestone 필드와 마일스톤 카드의 kind로 소속 관계를 파일에 기록한다 — plan.md 3.8
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 card new --kind milestone이 마일스톤 카드를 만든다(제목 중복 규율·Goal·AC 동일 적용)
- [x] #2 멤버의 --milestone이 대상을 검증한다 — 존재·kind=milestone·평면 위반(마일스톤이 다른 마일스톤에 속함) 거부
- [x] #3 card edit --milestone 재지정이 되고 모르는/값 없는 플래그는 기존 규칙대로 실패한다
- [x] #4 왕복 직렬화가 milestone·kind를 보존한다(회귀 포함 npm test 통과)
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-09-16T15:46-07:00 — 완료 — CARD_NEW/EDIT_FLAGS에 kind·milestone 추가, validateMilestoneTarget 공용 검증(존재·kind=milestone·평면 위반은 쓰기 전에 거부, 실패는 파일 미생성), card edit 재지정은 활성 카드만(종결 소속은 회고 이력 — depends와 같은 규칙). 왕복은 제네릭 프론트매터 직렬화 태생 보존, 노트 재작성 유발 편집으로 실측. 회귀 4종(test/kanban-milestone.test.js, scripts.test 등록) — npm test 59/59. 표면: USAGE·헤더 주석·bin 사용법·README
