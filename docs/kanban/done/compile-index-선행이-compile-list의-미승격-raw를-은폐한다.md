---
title: compile index 선행이 compile list의 미승격 raw를 은폐한다
status: done
ordinal: 12000
created: 2026-10-02
---

## Goal
<!-- kanban:goal:begin -->
raw 로그를 승격 없이 compile index만 돌려도 compile list가 미승격 상태를 계속 보고하게 한다(밤샘 커밋 절차 wiki-log→compile에서 발화하는 갭)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 재현이 테스트로 못박힌다: raw 기록 후 승격 없이 compile index → compile list가 해당 raw를 보고하지 않는 현재 동작
- [x] #2 수습 후 같은 시나리오에서 compile list가 미승격 raw를 다시 보고한다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-10-11T19:52+09:00 — 승격을 상태가 아니라 유도로 판정한다 — wiki가 [[날짜]] 또는 raw/<날짜>.md로 참조하면 승격. 참조 없는 raw는 index를 돌려도 [unpromoted]로 list에 계속 보고(재현 테스트 못박음: 기존 newLogs=[]). wiki-compile-unpromoted.test.js 3종 통과, 실레포에서 승격 백로그 09-02·09-22 드러남. 부수: npm test를 glob으로 전환(9a3b498) — verdict 테스트 8종이 목록 밖이었던 재발 수습, 117종 통과.
