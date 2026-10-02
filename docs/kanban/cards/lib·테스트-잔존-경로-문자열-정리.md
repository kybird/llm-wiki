---
title: lib·테스트 잔존 경로 문자열 정리
status: todo
ordinal: 14000
created: 2026-10-02
depends_on: ["첫 명령 자동 마이그레이션 — doc을 docs로"]
milestone: docs/ 레이아웃 전환
---

## Goal
<!-- kanban:goal:begin -->
보드 헤더·컴파일 문구·monitor UI 등 lib 곳곳의 doc/ 경로 문자열을 docs/로 정리한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 npm test 전부 통과
- [ ] #2 node bin/llm-wiki.js board 헤더가 docs/kanban을 정본으로 가리킨다
- [ ] #3 wiki-compile 기본 index.md 설명 문구가 docs/raw를 언급한다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-10-02T14:28+09:00 — 지시: 무엇을 — lib/kanban.js 보드 헤더 '정본은 doc/kanban/', wiki-compile 기본 index.md 설명 문구, monitor UI 문자열 등 남은 doc/ 경로 문자열(docs/로 가야 하는 것만). 건드리지 말 것 — 레거시 폴백 관련 의도적 doc/ 언급(C1·C2 산출물), auto-update 버전 스탬프 로직. 틀리기 쉬운 것 — 마이그레이션 안내 문구는 구 레이아웃 이름을 언급해야 하므로 doc/이 남는 게 정상 — grep 전수 치환으로 끝내지 말고 문자열별 판정.

## Handoff

## Result
