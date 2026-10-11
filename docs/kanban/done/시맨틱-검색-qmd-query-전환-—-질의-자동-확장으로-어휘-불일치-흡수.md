---
title: 시맨틱 검색 qmd query 전환 — 질의 자동 확장으로 어휘 불일치 흡수
status: done
ordinal: 7000
created: 2026-09-22
---

## Goal
<!-- kanban:goal:begin -->
llm-wiki가 호출하는 qmd search는 BM25 전문검색(2026-09-22 Case 2 실측: '패키지를 공개했는데 찾을 수 없음' → No results). qmd 2.8.3의 query 명령은 하이브리드 + 질의 자동 확장 + 재순위로 어휘 불일치(교차언어·설명투 질의)를 엔진 차원에서 흡수한다 — 이걸로 갈아탄다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 wiki·raw 컬렉션 검색이 qmd query(auto expansion)를 호출한다
- [x] #2 query 미지원 구버전 qmd는 search로 폴백한다(기능 탐지, 에러 아닌 판별)
- [x] #3 어휘 불일치 벤치: 2026-09-22 Case 2의 교차언어 질의가 wiki의 정답 페이지를 명중한다(실패 사례가 회귀 테스트로 남는다)
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-10-11T20:08+09:00 — collectQmdResults가 qmd query(하이브리드+자동확장+재순위) 호출 — 지원 여부는 --help 판별 기능 탐지(구버전 search 폴백, 에러 아님), 봉투 mode 필드·렌더에 모드 표기, query 타임아웃 120s(콜드 모델 적재 ~30s 실측). 벤치(AC#3 실측): 2026-09-22 Case 2 교차언어 질의 '패키지를 공개했는데 찾을 수 없음' → npm-scoped-publishing 1위 76%(2위 38%), llm-wiki search 엔드투엔드 6.8s. stub 테스트 2종 신규(서브커맨드 목격+폴백), 117종 통과. 부수: .gitignore에 .qmd/ 추가, qmd 2.8.3 lock 갱신.
