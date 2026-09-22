---
title: 시맨틱 검색 부활 — execFileSync import 누락 수습 + QMD 에러 삼킴 제거
status: done
ordinal: 7000
created: 2026-09-22
---

## Goal
<!-- kanban:goal:begin -->
llm-wiki search의 시맨틱층이 214e8c2(2026-09-09)부터 전면 사망 — execFileSync import 누락으로 ReferenceError가 catch에 삼켜져 'No semantic results.'로 위장. grep만 살아남아 어휘 불일치 질의(교차언어·설명투)의 재현율이 0이었다. 인덱싱(compile index)은 살아있어 '지식은 남는데 못 찾는' 상태가 12일간 지속됐다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 lib/wiki-search.js에 child_process import가 있고 시맨틱 검색이 실제 qmd를 호출해 결과를 반환한다
- [x] #2 qmd 호출 실패가 조용히 사라지지 않고 결과 봉투 errors에 실려 사람용 출력에 드러난다
- [x] #3 stub qmd 회귀 테스트가 두 경로를 게이트한다 — import를 지우면 테스트가 실패한다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-22T12:42-07:00 — 구현: lib/wiki-search.js ① 상단 child_process import(214e8c2 도입 당시 누락 — 시맨틱층 12일 위장 사망) ② catch 삼킴 제거, 실패를 semantic.errors에 실어 '(QMD error on …)' 줄로 출력 ③ test/wiki-search-qmd.test.js 회귀 2건(stub qmd: 정상·고장). 검증: npm test 88/88 · 부정 게이트 실증(import 제거 시 2/2 실패 후 복구) · 실측 부활('검색' → llm-wiki-wiki 83% 2건) · 실측 고장 노출(실패 stub → 에러 줄 출력) · wiki-log doc/raw/2026-09-22.md Case 1·2

## Handoff

## Result
- 2026-09-22T12:42-07:00 — 무엇을 바꿨나: lib/wiki-search.js — execFileSync import 추가 + QMD 호출 실패의 조용한 삼킴 제거(봉투 semantic.errors + 렌더 노출) + stub qmd 회귀 테스트 2건. 무엇으로 검증했나: npm test 88/88, 부정 게이트(import 제거 시 2/2 실패 — 재발 즉시 잡힘), 실측 시맨틱 부활(검색 → 83% 명중)과 고장 노출(QMD error 줄), wiki-log 2026-09-22 Case 1·2 기록
