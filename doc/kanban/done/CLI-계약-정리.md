---
title: CLI 계약 정리
status: done
ordinal: 9000
created: 2026-09-09
---

## Goal
<!-- kanban:goal:begin -->
LLM 호출자가 종료 코드·플래그로 실패를 구분하게
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 llm-wiki --version이 버전을 출력하고 exit 0이다
- [x] #2 잘못된 compile 서브커맨드가 exit 1이다
- [x] #3 parseArgs가 값 없는 플래그에 다음 플래그를 값으로 삼키지 않는다
- [x] #4 필수 문자열 플래그 누락 시 문자열 'true'가 기록되지 않는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-09T20:28-07:00 — 구현: bin에 --version/-v(package.json 버전 출력), wiki-compile 잘못된 서브커맨드 exit 1(안내는 stderr로), parseArgs는 다음 토큰이 플래그면 값을 삼키지 않음(등호 형식으로 --시작 값 표현), flagString/stringArray 헬퍼로 필수 문자열 플래그(handoff question·done result·abandon reason·reopen why·supersede by)와 선택 플래그(goal·plan·ac·add-ac·note·not-before·claim)에서 boolean true 유입 차단. 검증: AC4건 실측 전부 PASS(0.2.2 출력 exit0·compile bogus exit1·done --result --yes 거부·값없는 --result 거부+true 기록 부재) + 등호 형식 값 허용 + 락 증명 스크립트 10/10 재통과 + 실보드 board/search 회귀

## Handoff

## Result
- 2026-09-09T20:28-07:00 — 무엇을 바꿨나: bin/llm-wiki.js(--version/-v), lib/wiki-compile.js(잘못된 서브커맨드 exit 1), lib/kanban-cmd.js(parseArgs 플래그 삼킴 방지 + flagString/stringArray로 16곳 플래그 소비처 검증). 무엇으로 검증했나: AC 4건 실측 PASS — --version 0.2.2 exit 0, compile bogus exit 1, done --result --yes를 삼키지 않고 거부, 값 없는 --result 거부 및 done 기록에 true 부재. 등호 형식(--result=--x) 값 허용 회귀, 락 증명 10/10, 실보드 회귀 통과
