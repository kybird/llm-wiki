---
title: docRoot 일관성
status: done
ordinal: 10000
created: 2026-09-09
---

## Goal
<!-- kanban:goal:begin -->
LLM_WIKI_ROOT 오버라이드가 모든 명령에서 존중 — 안내 무한루프 제거
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 init이 LLM_WIKI_ROOT가 가리키는 루트를 스캐폴드하거나 requireBoard 에러가 실제 루트와 환경변수값을 함께 보고한다
- [x] #2 board video가 kanbanDir 기준 절대경로로 렌더한다
- [x] #3 video/ 프로젝트 없는 npm 소비자가 board video 실패 메시지로 안내받는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-09T20:32-07:00 — 구현: ① init이 LLM_WIKI_ROOT 존중 — doc 루트의 부모를 레포 루트로 삼아 스캐폴드(안내 무한루프 제거) ② requireBoard 에러가 실제 탐색 경로와 LLM_WIKI_ROOT 값을 함께 보고 ③ board video 렌더 명령을 kanbanDir 기준 절대경로+따옴표로(../doc 하드코딩 제거), video 없는 경우 npm 패키지 미포함 안내 추가. 검증: 임시 오버라이드 루트에서 init 스캐폴드 위치 PASS, requireBoard 에러에 두 경로 표기 확인, npx 셸 시간(stub)으로 가로챈 렌더 명령의 출력·props 경로가 오버라이드 절대경로인 것 확인, video 부재 안내 문구 확인, 실보드 board·compile 회귀

## Handoff

## Result
- 2026-09-09T20:32-07:00 — 무엇을 바꿨나: lib/init.js(LLM_WIKI_ROOT 존중 스캐폴드), lib/kanban-cmd.js(requireBoard 에러 맥락 보고, board video 절대경로 렌더·npm 소비자 안내). 무엇으로 검증했나: AC 3건 실측 — 임시 LLM_WIKI_ROOT에 init이 그 루트에 골격 생성, board 에러가 경로+환경변수 표기, npx 스텁 가로채기로 렌더 명령 인자가 kanbanDir 절대경로임 확인, video 부재 안내 출력. 실보드 board·compile list 회귀 통과
