---
title: board report 헤더 날짜 로컬화
status: done
ordinal: 7000
created: 2026-09-21
---

## Goal
<!-- kanban:goal:begin -->
보고서 헤더 날짜를 UTC 슬라이싱(generatedAt.split)에서 localToday 유도로 바꿔 board 뷰·경과일 계산과 정합을 맞춘다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 헤더 날짜가 localToday 와 일치한다(UTC 날짜 하루 앞섬 회귀 테스트)
- [x] #2 JSON generatedAt 은 UTC ISO 절대 시각으로 그대로다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-21T22:24-07:00 — 무엇을 했는가: kanban-cmd.js 보고서 헤더를 generatedAt(UTC ISO).split 대신 localToday() 로. JSON generatedAt 은 건드리지 않았다(절대 시각은 기계용). 검증: kanban-board-flags.test.js 에 회귀 테스트 추가(자정 경계 전후 날짜 같으면 헤더=로컬 오늘 몫박) + 실측 로컬 2026-09-21 22:24(-0700)에 헤더 09-21(수정 전 09-22) + npm test 86/86. 어디서 틀리기 쉬운가: UTC 문자열을 잘라 달력 날짜로 쓰는 층위 위반 — 로컬 도메인 값은 localToday 로 유도해야 추이·경과일과 정합이다.

## Handoff

## Result
- 2026-09-21T22:24-07:00 — board report 헤더 localToday() 전환. board 뷰·추이·경과일과 날짜 도메인 통일. npm test 86/86.
