---
title: 질의 로그 테스트 누수 — npm test가 진짜 search-queries.jsonl에 고정 질의를 쓴다
status: done
ordinal: 26000
created: 2026-11-23
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
test/wiki-search-qmd.test.js 가 doc root를 격리하지 않고 search()를 불러, 2026-10-15에 추가된 질의 로깅이 테스트 고정 질의를 진짜 docs/raw/search-queries.jsonl에 쓴다. npm test마다 5줄씩 쌓이고(2026-11-23 push 시점 커밋된 65줄 중 60줄이 고정 질의) 작업 트리를 더럽히며 회수 경향 측정 데이터를 잡음으로 만든다. 이 레포의 docs/는 테스트가 절대 건드리지 않는다는 규칙 위반
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 npm test 를 돌린 뒤 git status 에 docs/raw/search-queries.jsonl 이 나타나지 않는다 (실행 전 뒤 내용 동일)
- [x] #2 wiki-search-qmd 테스트는 임시 doc root 로 돈다 — 진짜 레포 docs/를 읽거나 쓰지 않고 기존 주장 5건은 그대로 통과한다
- [x] #3 재발 가드: 이 테스트 파일이 진짜 질의 로그를 바꾸면 테스트가 실패한다
- [x] #4 docs/raw/search-queries.jsonl 에서 테스트 고정 질의 줄을 제거한다 — 진짜 질의 줄은 보존
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-23T20:49+09:00 — AC 근거. #1: 격리 뒤 전체 스위트 실행 전후 진짜 로그 해시 동일(86d9aa41a741) — 커밋 뒤 npm test 한 번 더 돌려 git status 무변경 재확인. #2: wiki-search-qmd 5/5 통과, 임시 doc root(LLM_WIKI_ROOT)+임시 cwd. #3: 가드만 넣은 실행은 종료 코드 1·로그 70→75줄로 누수 재현(실패 확인 뒤 격리 추가). #4: 75줄 중 고정 질의 70줄 제거, 진짜 질의 5줄 보존·전줄 유효 JSON. raw 2026-11-23 Case 6.

## Handoff

## Result
- 2026-11-23T20:49+09:00 — wiki-search-qmd 테스트를 임시 doc root(LLM_WIKI_ROOT)+임시 cwd로 격리하고, 진짜 질의 로그를 시작 때와 비교하는 재발 가드를 after 훅에 둠(가드만 넣은 실행은 실패·로그 70→75줄 재현 확인). 진짜 search-queries.jsonl에서 테스트 고정 질의 70줄 제거 — 진짜 질의 5줄 보존(push 시점 커밋된 65줄 중 60줄이 노이즈였다). 전체 195 통과, 스위트 뒤 로그 해시 불변. 후보: activity.jsonl 등 다른 자원에도 같은 가드.
