---
title: 조건 게이트 — not_before + resume
status: done
ordinal: 2000
created: 2026-08-29
---

## Goal
<!-- kanban:goal:begin -->
조건만족시 진행: 시간 게이트와 대기 복귀 원시형
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 not_before 미래 카드를 pick이 건너뛴다
- [x] #2 review 카드를 resume하면 todo로 복귀한다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-08-29T22:32+09:00 — AC1: 게이트 더미(2026-08-30)가 pick blocked '시작 예정'으로 건너뛰어짐(위 출력). AC2: resume 테스트 — review 카드가 todo 복귀 + RESUMED 노트(세션 로그). 커밋 52605ac
