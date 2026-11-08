---
title: CLI 위치인자·플래그 균일 계약
status: todo
ordinal: 18000
created: 2026-11-08
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
모든 llm-wiki 명령이 (a) 설계된 위치인자 개수만 받고 초과분은 이름을 말하고 실패, (b) 알 수 없는 플래그를 거부한다(validateFlags 미적용 명령 포함) — agent-cli-contract 균일 원칙('어디는 엄격, 어디는 관대하면 규칙을 못 배운다')의 위치인자·잔여 플래그 확장. 2026-11-08 스윍 실측: pick(1d52fba)·init(같은 날 가드)만 조용-오실행 부작용 결함이었고 나머지는 무해 삼킴 — lint·board(view·report·video)·monitor·wait는 위치인자 삼킴, compile은 유효 하위명령 뒤 잉여 토큰 삼킴, skills add/remove는 잉여 인자 삼킴, init·search 외 대부분 명령이 알 수 없는 플래그 조용 무시(validateFlags 비적용). 각 명령의 설계 arity를 USAGE에 명시하고 중앙/핸들러 가드로 못박는다. 무해하지만 균일 원칙 위반 — 기능 경계라 카드로.
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 전 명령 스윕 표: 명령별 설계 위치인자 수·플래그 목록·현재 조용 삼킴 여부가 카드에 기록된다
- [ ] #2 조용 삼킴 0건 — 설계 arity 초과 위치인자·알 수 없는 플래그는 이름을 말하고 exit 1(표 기반 회귀테스트)
- [ ] #3 정상 호출 호환 — 기존 테스트 141개 전부 불변 통과
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
