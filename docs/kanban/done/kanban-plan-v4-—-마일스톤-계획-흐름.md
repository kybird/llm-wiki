---
title: kanban-plan v4 — 마일스톤 계획 흐름
status: done
ordinal: 10000
created: 2026-09-16
depends_on: ["카드 모델 — milestone 필드와 kind"]
milestone: 마일스톤 구현
---

## Goal
<!-- kanban:goal:begin -->
계획 스킬이 마일스톤 1장+카드 N장 분해 흐름을 안내한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 스킬이 계획=마일스톤 1장+카드 N장 흐름·평면 규칙·게이트 비전파를 기술한다(skill-version bump)
- [x] #2 AGENTS.md 계획 라인에 마일스톤이 반영된다
- [x] #3 미러(.agents·.claude)가 동기된다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-09-16T16:03-07:00 — 완료 — 스킬 v4: 'Milestones — 계획 단위 소속' 절(2장 이상 분해 = 마일스톤 1장, 대의는 Goal에, 소속은 --milestone, 상태는 손대지 않는다 — 자동 종결·유도), 분해 규칙에 '마일스톤은 사다리 위의 그루핑이지 깊이가 아니다', 감시 화면에 monitor 추가. AGENTS.md 계획 절에 마일스톤 한 줄, 미러 .agents·.claude 동기(v4 확인). npm test 68/68
