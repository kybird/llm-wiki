---
title: auto-update에 qmd 동반 갱신
status: done
ordinal: 19000
created: 2026-11-21
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
llm-wiki npm 업데이트의 자동 반영 패스가 설치된 qmd도 최신으로 끌어올린다(미설치 시 설치하지 않는다)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 qmd 설치·구버전 환경에서 auto-update 패스가 npm i -g @tobilu/qmd@latest를 실행하고 from→to를 보고한다
- [x] #2 qmd 미설치·이미 최신·기계 스탬프 완료 조건에서는 npm을 호출하지 않는다(조용한 no-op 아님 — 출력 없음은 합법)
- [x] #3 npm 실패가 명령을 막지 않고 경고 한 줄로 끝난다(스탬프 미기입 → 다음 기회 재시도)
- [x] #4 동반 갱신 테스트가 STATE_DIR 밀폐+가짜 npm으로 회귀를 게이트한다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-11-21T15:06+09:00 — auto-update 패스가 설치된 qmd를 npm i -g @tobilu/qmd@latest로 끌어올린다(미설치 시 설치 안 함). 기계 단위 스탬프(qmd.version)로 첫 레포만 비용 부담, 실패는 경고 후 재시도(스탬프 미기입), STATE_DIR 격리는 전역 부작용도 격리. 순수 로직 syncQmdCore 주입 테스트 9종+전체 162/162 통과. README 양언어 갱신. 동기: qmd 2.9.0의 CUDA 크래시 수리가 수동 npm i -g에 의존하던 전파 구멍을 닫음.
