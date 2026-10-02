---
title: 모니터 플릿 뷰 — monitor --all
status: done
ordinal: 7000
created: 2026-09-18
---

## Goal
<!-- kanban:goal:begin -->

<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 플릿(--all)이 기계 등록부(~/.llm-wiki/projects.json — 능동 명령·monitor 시작이 recordProject로 기록)의 모든 보드를 타일로 집계한다
- [x] #2 P:/<slug>/ 경로가 그 프로젝트의 표준 보드 페이지·API를 그대로 serve한다(상대 경로 fetch)
- [x] #3 플릿 재기동은 멱등(다른 플릿 재사용), 보드 모니터와의 포트 충돌은 상호 안내한다
- [x] #4 회귀 포함 npm test 통과·플릿/보드 페이지 구문 게이트·브라우저 실측
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-18T23:02-07:00 — 교훈: AC 텍스트가 '--'로 시작하면 parseArgs가 플래그로 쪼갠다 — 문장형으로 쓸 것(가드 정상 작동의 자체 사례)

## Handoff

## Result
- 2026-09-18T23:01-07:00 — 완료 — 등록부(auto-update에 recordProject/readProjects, LLM_WIKI_STATE_DIR 밀폐)·collectBoardAt 리팩터·플릿 서버(/·/api/fleet·/p/<slug>/ 표준 보드 재사용, 상대 fetch)·플릿 페이지(타일: WIP·판정대기·마일스톤 진행바·마지막 활동, 변화 시그니처 렌더). 실측: 실레포 llm-wiki 타일→/p/llm-wiki/ 하위 보드 전체(프로젝트 라벨·마일스톤 패널) 확인, 디버그 디렉터리의 등록부 오염 1건 정리. 수습 부수: 종결 마일스톤 소속 가드+--remove-milestone(281d97d). 회귀 2종+등록부 단위 — npm test 74/74
