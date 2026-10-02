---
title: 시맨틱 검색 qmd query 전환 — 질의 자동 확장으로 어휘 불일치 흡수
status: todo
ordinal: 7000
created: 2026-09-22
---

## Goal
<!-- kanban:goal:begin -->
llm-wiki가 호출하는 qmd search는 BM25 전문검색(2026-09-22 Case 2 실측: '패키지를 공개했는데 찾을 수 없음' → No results). qmd 2.8.3의 query 명령은 하이브리드 + 질의 자동 확장 + 재순위로 어휘 불일치(교차언어·설명투 질의)를 엔진 차원에서 흡수한다 — 이걸로 갈아탄다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 wiki·raw 컬렉션 검색이 qmd query(auto expansion)를 호출한다
- [ ] #2 query 미지원 구버전 qmd는 search로 폴백한다(기능 탐지, 에러 아닌 판별)
- [ ] #3 어휘 불일치 벤치: 2026-09-22 Case 2의 교차언어 질의가 wiki의 정답 페이지를 명중한다(실패 사례가 회귀 테스트로 남는다)
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
