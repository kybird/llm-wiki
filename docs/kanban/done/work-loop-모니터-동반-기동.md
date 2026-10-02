---
title: work-loop 모니터 동반 기동
status: done
ordinal: 7000
created: 2026-09-16
---

## Goal
<!-- kanban:goal:begin -->
루프 시작이 모니터를 띄운다(멱등) — 사람이 밤중에 들어와도 보드가 산다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 이미 모니터가 떠 있는 포트로 재기동하면 exit 0으로 URL 재사용을 보고한다(멱등 재시도는 실패가 아니다)
- [x] #2 포트를 다른 프로세스가 잡고 있으면 지금처럼 exit 1로 안내한다
- [x] #3 work-loop 스킬(v7) 시작 단계에 모니터 기동 포함 — 정지 규칙은 모니터를 남기고, 기동 실패가 루프를 막지 않는다
- [x] #4 회귀 포함 npm test 통과·미러 동기
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-09-16T16:27-07:00 — 완료 — monitor가 고정 포트 재기동을 멱등 처리(/api/board kind 검사로 우리 몸 확인 → exit 0·URL 재사용 보고, 남의 포트는 기존대로 exit 1 안내, 임시 포트 0은 검사 제외). monitor가 async가 되어 bin 디스패치에 catch 추가. work-loop v7: 시작 단계 '모니터 기동' 절(멱급·환경이 안 되면 건너뜀 — 관측이지 의존성 아님)·정지 규칙은 모니터 잔존. README 멱등 문구·미러 동기. 실측: 실레포에서 재기동 exit 0·URL 재보고 확인. 회귀 1종(재사용+남의 포트) — npm test 69/69
