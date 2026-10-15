---
title: search 질의 로깅
status: done
ordinal: 19000
created: 2026-10-15
milestone: 에피소드 메모리 회수 가다듬기
---

## Goal
<!-- kanban:goal:begin -->
search가 모든 질의와 결과 수를 search-queries.jsonl에 남겨 회수 경향을 측정 가능하게 한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 질의 실행마다 ts와 query와 grep과 semantic 결과 수가 docs/raw/search-queries.jsonl에 append된다
- [x] #2 10k줄 상한을 넘기면 오래된 줄부터 절단된다(activity.jsonl과 같은 규율)
- [x] #3 기존 테스트 전량 통과
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-10-15T23:37+09:00 — 할 것: lib/wiki-search.js에 질의 append. 건드리지 말 것: 검색 결과 본체와 qmd 호출 경로. 틀리기 쉬운 곳: jsonl이 compile과 lint의 .md 스캔에 끼는가(안 끼임 실측), 결과 수는 머지 전 원시 카운트로

## Handoff

## Result
- 2026-10-15T23:39+09:00 — 구현+테스트 완료: logQuery가 모든 질의를 docs/raw/search-queries.jsonl에 append(ts·query·grep files 수·semantic collections 수, 10k줄 상한 절단, 실패해도 검색은 안 죽음). 디버깅 1건: collectGrepResults 반환형이 배열이 아니라 {keywords, files} — 카운트를 files.length로. 신규 회귀 2개 포함 136/136 통과
