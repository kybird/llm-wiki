---
title: 무소속 뷰·리포트·lint
status: done
ordinal: 15000
created: 2026-10-15
depends_on: ["무소속 자동 생성과 기본 부착"]
milestone: 무소속 마일스톤과 사후 편입
---

## Goal
<!-- kanban:goal:begin -->
board와 monitor가 무소속을 영구 버퍼로 표시하고 report가 마일스톤 통계에서 분리하며 lint가 전원 종결 활성 마일스톤을 지적한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 board 마일스톤 패널에 무소속 N장이 영구 표기로 나온다(완료율 아님)
- [x] #2 board report가 무소속을 마일스톤 통계에서 제외하고 미정산 인터럽트 수로 보고한다
- [x] #3 lint가 멤버 전원 종결인 활성 마일스톤을 지적한다
- [x] #4 monitor 웹 뷰에 무소속 마일스톤 패널이 표시된다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-10-15T14:20+09:00 — 구현+테스트 완료: board 뷰 무소속 영구 줄(마일스톤 개수 분리, 대기·누적 표기), board report 무소속 통계 분리+unassigned{pending,total}+staleBundles(방치 묶음 ⚠), lint에 boardIssues 섹션(전원 종결 활성 마일스톤 지적, wiki-lint가 lib/kanban 파서 재사용), monitor ● 무소속 대기·누적 렌더(msView에 conclusion 전파, /api/board 실측). 백틱 중첩으로 모니터 내장 스크립트 외부 템플릿 깨진 사고 1건 즉시 수습(문자열 연결로). 133/133 통과
