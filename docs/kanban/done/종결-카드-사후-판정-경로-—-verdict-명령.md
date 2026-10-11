---
title: 종결 카드 사후 판정 경로 — verdict 명령
status: done
ordinal: 14000
created: 2026-10-11
---

## Goal
<!-- kanban:goal:begin -->
lifecycle(작업 완결)과 outcome(노선/제품 판정)을 보드상 구분한다 — 2026-10-11 TTSTextViewer 사고: 마일스톤 전원 종결(milestone-done)을 후속 세션이 채택 성공으로 오독해 잘못 보고. 종결 카드에 판정만 붙이는 append-only 경로가 없던 설계 간극을 메운다.
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 verdict <제목> --outcome adopted|rejected|superseded --why 필수 — 종결 카드 상태·폴더 불변, frontmatter outcome/outcome_at + Result 라인 + 활동 verdict/milestone-verdict; 재판정은 최신이 이기고 이력은 라인으로 누적
- [x] #2 활성 카드 verdict 시도는 거부 — done --result 안내 문구
- [x] #3 자동완결 문구(마일스톤 Result 라인·milestone-done 활동 detail)와 모니터 라벨에 작업 완결·판정 별도 취지 명시
- [x] #4 board report가 판정 붙은 마일스톤을 done 카운트에서 분리해 adopted/rejected/superseded 집계 — outcome 없는 기존 보드는 board/monitor/report 전부 무오류(하위호환)
- [x] #5 USAGE/help·README.ko.md·README.md·AGENTS.md 문서 동기화 + 회귀 테스트
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-10-11T18:54+09:00 — verdict 명령 구현 완료 — 전체 104 테스트 통과(신규 8). 완료 기준 4항 전부 실측: ① 자동완결 Result 라인·milestone-done detail·모니터 라벨(계획 종결(판정 별도))·보드 ✓ 줄이 작업 완결≠판정 구분 ② 종결 마일스톤 verdict rejected → status done·폴더 불변 + frontmatter outcome/outcome_at + Result 라인 + milestone-verdict 활동 + report 분리 집계 ③ outcome 없는 실보드에서 board/report/report --json 무오류(출력 기존 형식 유지) ④ 활성 카드 거부 + done --result 안내(실측 exit 1). 보너스: 보드 ✓ 줄에 판정 병기(오독 방지 최전선). 문서: USAGE·bin help·README ko/en·AGENTS.md 동기화.
