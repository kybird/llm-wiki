---
title: init 템플릿·스킬에 규약 서술
status: done
ordinal: 9000
created: 2026-09-21
milestone: 규약 2026-09-21 반영
---

## Goal
<!-- kanban:goal:begin -->
init 이 주입하는 AGENTS.md 규격과 kanban-plan·work-loop 스킬에 여섯 규약을 서술한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 init 주입 결과 AGENTS.md 에 규약 1~6 마커가 빠짐없이 들어간다(테스트로 고정)
- [x] #2 kanban-plan 에 봉인·무소속 인터럽트·지시서 3항·계획 문서 수명, work-loop 에 무소속·QA 승격·노화 지표가 반영된다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-21T21:50-07:00 — 무엇을 했는가: templates/AGENTS.md 를 다시 써 산출물 삼분법(SSOT)·범위 봉인·무소속 인터럽트·아침 정기 의식(review 삼진·백로그 셋수('나중에' 금지))·마일스톤 닫힘 승격(DONE.md 류)·계획 문서 수명·카드 지시서 필수 3항을 담았다. kanban-plan(5판): 분해 시점 봉인·무소속·지시서 3항·계획 문서 수명 절 추가. work-loop(9판): 규칙 8 '인터럽트 무소속'·QA pass 에 승격·노화 지표. 검증: test/init-template.test.js — 마커 6규약 전수 + 임시 디렉터리 실제 init 실행 후 주입 파일이 템플릿과 동일함 확인. 주의: 템플릿 문구는 줄바꿈으로 갈라지면 안 된다(식별 문구 '무엇을 건드리지 말 것' 실측 파손 → 수정).

## Handoff

## Result
- 2026-09-21T21:50-07:00 — templates/AGENTS.md 전면 개정(규약 1~6 전수), skills/kanban-plan v5·skills/work-loop v9, 레포 사본 init 동기화(.agents/.claude updated). test/init-template.test.js 2종 추가, npm test 81/81.
