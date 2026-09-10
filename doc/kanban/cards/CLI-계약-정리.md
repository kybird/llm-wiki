---
title: CLI 계약 정리
status: todo
ordinal: 9000
created: 2026-09-09
---

## Goal
<!-- kanban:goal:begin -->
LLM 호출자가 종료 코드·플래그로 실패를 구분하게
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 llm-wiki --version이 버전을 출력하고 exit 0이다
- [ ] #2 잘못된 compile 서브커맨드가 exit 1이다
- [ ] #3 parseArgs가 값 없는 플래그에 다음 플래그를 값으로 삼키지 않는다
- [ ] #4 필수 문자열 플래그 누락 시 문자열 'true'가 기록되지 않는다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
