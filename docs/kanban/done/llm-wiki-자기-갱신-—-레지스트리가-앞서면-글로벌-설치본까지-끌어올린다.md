---
title: llm-wiki 자기 갱신 — 레지스트리가 앞서면 글로벌 설치본까지 끌어올린다
status: done
ordinal: 26000
created: 2026-11-23
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
실행 버전보다 npm 최신이 앞서면 안내만 하지 않고 글로벌 설치본을 실제로 끌어올린다 (사용자 판정 2026-11-23: 자동 갱신은 설치까지가 기본기능). 대상은 글로벌 npm root의 실제 디렉터리 설치뿐 — npm link(작업 트리를 가리키는 링크)·소스 체크아웃·npx 캐시·레포 로컬 설치는 건드리지 않는다. 계승: 종결 카드 'llm-wiki 자기 스큐 힌트'(superseded)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 글로벌 실제 디렉터리 설치에서 실행 중인 버전이 npm 최신보다 낮으면 npm i -g 로 그 버전을 설치한다 — 설치는 떨어진 프로세스가 하고, 시작 줄을 출력한 뒤 명령은 바로 끝난다
- [x] #2 설치 결과는 다음 명령이 한 번 보고한다 — 성공은 갱신 완료 줄, 실패는 수동 명령 안내 줄
- [x] #3 npm link 링크·소스 체크아웃·npx 캐시·레포 로컬 설치에서는 설치를 시도하지도 않고 말하지도 않는다 (이 레포에서 node bin/llm-wiki.js 로 실행할 때 포함)
- [x] #4 기계당 24시간에 1회만 확인하고, 실패·오프라인은 조용하며 매 명령 재시도하지 않는다. autoUpdate:false · LLM_WIKI_NO_AUTO_UPDATE=1 · LLM_WIKI_STATE_DIR 격리를 존중한다
- [x] #5 레지스트리 응답은 엄격한 semver만 받는다 — 버전 문자열이 셸 명령에 들어가므로 메타문자가 섞이면 설치하지 않는다
- [x] #6 README(EN·KO) 설치·업데이트 섹션이 자기 갱신 계약을 설명한다 (대상·비대상·갱신 중 잠깐 실패 가능성·옵트아웃)
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-23T20:31+09:00 — AC 근거(test/auto-update-self-update.test.js 22건 + 가짜 npm 심·가짜 글로벌 루트 종단 검증 20/20, 실제 글로벌 설치는 무변경). #1: 코어 '스큐 + 글로벌 설치'·배선 2건, 종단 S2-a 시작 줄·S2-b npm i -g @kybird/llm-wiki@99.0.0 정확히 1회. #2: selfUpdateResultLine·배선 '결과 보고 줄이 먼저', 종단 S2-c 완료 보고·S2-d 정적·S3-c 실패+수동 명령. #3: 코어 link·other, 종단 S1 소스 체크아웃·S4 접션(npm link)·S6 실제 홈·실제 레지스트리. #4: 코어 주기·npm view 실패·스탬프 쓰기 실패, 배선 옵트아웃 2종·격리, 종단 S5-a·S5-b npm 0회. #5: 코어 '엄격한 semver' 6사례 전부 설치 0. #6: README.md·README.ko.md 설치·업데이트 섹션 + bin 사용법.

## Handoff

## Result
- 2026-11-23T20:31+09:00 — 글로벌 설치본 자기 갱신 구현 — lib/auto-update.js selfUpdateCore·installKind·startInstall·reportSelfUpdate. 레지스트리가 앞서면 글로벌 npm root의 실제 디렉터리 설치에서만 떨어진 프로세스로 npm i -g를 시작하고, 다음 명령이 결과를 보고한다. npm link·소스 체크아웃·npx 캐시·레포 로컬 설치는 건드리지 않는다. 테스트 22건 신규(안내 버전 15건 교체), 전체 195 통과. 종단 검증 20/20. 안내 카드 'llm-wiki 자기 스큐 힌트'는 superseded. 한계: 레포가 출시보다 앞선 스큐는 여전히 못 잡는다(raw 2026-11-23 Case 5).
