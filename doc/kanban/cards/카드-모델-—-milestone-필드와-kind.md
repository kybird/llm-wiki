---
title: 카드 모델 — milestone 필드와 kind
status: todo
ordinal: 7000
created: 2026-09-16
---

## Goal
<!-- kanban:goal:begin -->
멤버 카드의 milestone 필드와 마일스톤 카드의 kind로 소속 관계를 파일에 기록한다 — plan.md 3.8
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 card new --kind milestone이 마일스톤 카드를 만든다(제목 중복 규율·Goal·AC 동일 적용)
- [ ] #2 멤버의 --milestone이 대상을 검증한다 — 존재·kind=milestone·평면 위반(마일스톤이 다른 마일스톤에 속함) 거부
- [ ] #3 card edit --milestone 재지정이 되고 모르는/값 없는 플래그는 기존 규칙대로 실패한다
- [ ] #4 왕복 직렬화가 milestone·kind를 보존한다(회귀 포함 npm test 통과)
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
