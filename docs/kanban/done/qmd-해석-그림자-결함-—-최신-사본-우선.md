---
title: qmd 해석 그림자 결함 — 최신 사본 우선
status: done
ordinal: 24000
created: 2026-11-23
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
findQmd가 자기 트리 사구본(예: 2.8.3)이 관리되는 글로벌 신사본(2.9.0)을 가려 CUDA 리랭커 크래시가 재발하는 결함을 막는다 — 채택 처방(글로벌 2.9.0, 2026-11-21 adopted)이 해석 순서에 의해 무력화되지 않게
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 존재하는 qmd 후보 중 package.json 버전이 가장 높은 것을 반환한다(2.8.3 vs 2.9.0 → 2.9.0)
- [x] #2 역방향도 성립: 번들이 더 새면(2.9.1 vs 글로벌 2.9.0) 번들이 이긴다
- [x] #3 QMD_CLI_PATH 명시 오버라이드는 유지된다
- [x] #4 optionalDependencies 하한 ^2.9.0으로 올라 신규 설치가 고친 빌드를 싣는다
- [x] #5 TROUBLESHOOTING.md 런타임 OOM 섹션에 해석-그림자 함정 추가
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-11-23T18:22+09:00 — AC 5/5 — findQmd 최신 사본 우선(pickQmd 분리, 테스트 6건+전체 173 통과), 종단 3회 무크래시(수리 전 매 검색 크래시), optionalDependencies ^2.9.0, TROUBLESHOOTING 함정+체크리스트 3번 규명 정정. 2026-11-23 Case 3 참조
