---
title: compile 환류와 pick 검색 훅
status: done
ordinal: 22000
created: 2026-10-15
depends_on: ["search 질의 로깅"]
milestone: 에피소드 메모리 회수 가다듬기
---

## Goal
<!-- kanban:goal:begin -->
compile list가 0결과 질의를 단서와 alias 후보로 보고하고 work-loop에 pick 직후 검색 훅을 문서화한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 compile list가 search-queries.jsonl의 0결과 질의를 후보로 나열한다
- [x] #2 work-loop 스킬에 pick 직후 카드 골 키워드와 건드릴 파일명 검색 훅이 있다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-10-15T23:46+09:00 — 완료: compile list가 search-queries.jsonl의 grep 0·semantic 0 질의를 빈도순 최대 10개 missedQueries로 보고(텍스트 '회수 실패 질의(단서·alias 후보)' — 새 로그 없어도 출력), json 스키마 추가. pick 검색 훅은 work-loop 정본 규칙 8a로 반영(pick 직후 Goal 키워드+건드릴 파일명 검색). 139/139 통과
