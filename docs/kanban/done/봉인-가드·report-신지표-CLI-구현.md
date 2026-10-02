---
title: 봉인 가드·report 신지표 CLI 구현
status: done
ordinal: 8000
created: 2026-09-21
milestone: 규약 2026-09-21 반영
---

## Goal
<!-- kanban:goal:begin -->
card edit --milestone 의 범위 봉인(--scope-amend)과 board report 의 review 노화·마일스톤 경과일 지표를 구현한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 활성 마일스톤에 card edit --milestone 이 scope-amend 사유 없이 거부된다(exit 1·파일 불변)
- [x] #2 scope-amend 사유와 함께면 통과하고 카드 Notes에 '범위 변경'이 남는다
- [x] #3 board report --json 에 reviewAging(가장 오래된 대기 일수·7일 초과 건수)과 마일스톤 경과일(생성일 기준)이 계산돼 나온다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-21T21:50-07:00 — 무엇을 했는가: kanban-cmd.js cardEdit 에 범위 봉인(멤버 있는 마일스톤에 --milestone 추가는 --scope-amend 사유 없으면 exit 1·파일 불변, 사유 있으면 통과+Notes '범위 변경' 기록), boardReport 에 reviewAging(가장 오래된 대기 일수·7일 초과·미상)·milestoneAges(생성일 기준 경과일)·대기 큐 항목별 waitingDays 를 넣었다. 검증: test/kanban-scope-seal.test.js 5종(거부·통과·어법·review 대기 유지·지표 계산) + 실레포 위반 점검(card edit '웹 뷰 — 드래그 이동' → '규약 2026-09-21 반영' 거부 exit 1 확인) + npm test 81/81. 틀리기 쉬운 곳: 경과일은 localToday 자정差(UTC created 슬라이싱은 하루 어긋난다 — 테스트에서 실측 수정).

## Handoff

## Result
- 2026-09-21T21:50-07:00 — lib/kanban-cmd.js 봉인 가드+report 신지표, bin/llm-wiki.js 도움말, USAGE 갱신. test/kanban-scope-seal.test.js 5종 추가. npm test 81/81 통과, 실보드 위반 사례 exit 1 확인, REVIEW 노화 12일·경과 0일 실측 출력 확인.
