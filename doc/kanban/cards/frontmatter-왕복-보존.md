---
title: frontmatter 왕복 보존
status: todo
ordinal: 8000
created: 2026-09-09
---

## Goal
<!-- kanban:goal:begin -->
직렬화→파싱 왕복이 값 형태를 보존 — 제목·폐기 사유가 변형되지 않게
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 '[a, b]' 꼴 문자열 제목이 왕복 후에도 문자열로 남는다
- [ ] #2 쉼표 포함 제목의 depends_on 항목이 분해되지 않는다
- [ ] #3 board.yml statuses 파싱이 행내 주석의 ']'에 오염되지 않는다
- [ ] #4 AC 센티널 안 비-AC 줄이 왕복에서 소실되지 않는다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
