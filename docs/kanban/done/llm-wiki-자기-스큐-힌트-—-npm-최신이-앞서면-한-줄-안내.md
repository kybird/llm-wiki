---
title: llm-wiki 자기 스큐 힌트 — npm 최신이 앞서면 한 줄 안내
status: done
ordinal: 24000
created: 2026-11-23
milestone: 무소속
outcome: superseded
outcome_at: 2026-11-23T20:19+09:00
---

## Goal
<!-- kanban:goal:begin -->
자동 반영이 사본·qmd만 끌어올리고 llm-wiki 명령 자신은 못 바꾸는 틈을 메운다 — 실행 버전보다 npm 최신이 앞서면 하루 1회 한 줄로 알린다. 잡는 것: 다른 기계가 출시한 수리를 이 기계 전역 CLI가 모르는 상태(출시 뒤처짐). 못 잡는 것: 정본 레포가 출시보다 앞선 스큐(2026-11-07 0.6.0 사고 부류)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 실행 버전이 npm 최신보다 낮으면 버전 두 개와 갱신 명령, 사용자 터미널 지시를 담은 한 줄이 출력된다 — 설치는 하지 않는다
- [x] #2 레포 스탬프가 실행 버전과 같은 정상 상태(자동 반영 패스가 도는 않는 상태)에서도 힌트가 나온다
- [x] #3 기계당 24시간에 1회만 npm view를 부르고, 실패·오프라인은 조용히 넘어가며 매 명령 재시도하지 않는다
- [x] #4 autoUpdate:false · LLM_WIKI_NO_AUTO_UPDATE=1 · LLM_WIKI_STATE_DIR 격리를 존중한다
- [x] #5 README(EN·KO) 업데이트 섹션에 계약을 적는다 — 무엇을 잡고 무엇을 못 잡는지 포함
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-23T19:27+09:00 — AC 근거 — #1: test/auto-update-skew.test.js 코어·배선(버전 두 개·갱신 명령·사용자 터미널 문구) + 가짜 npm 심 종단 1-A. 설치 코드 없음(checkSelfSkew에 installFn 부재). #2: 배선 테스트 '정상 상태(레포 스탬프 == 실행 버전, 패스 스킵)에서도 힌트' + 종단 1-C. #3: 코어 테스트(주기·실패·스탬프 쓰기 실패) + 종단 1-B·3-A·3-B(npm view 호출 수로 확인). #4: 배선 테스트 옵트아웃 3종 + 종단 4-A·4-B + npm test 중 스탬프 재생성 없음 실측. #5: README.md·README.ko.md 업데이트 섹션.

## Handoff

## Result
- 2026-11-23T19:27+09:00 — 자기 스큐 힌트 구현 — lib/auto-update.js의 selfSkewCore·checkSelfSkew. 기계당 하루 1회 시간 스탬프로 레포 스탬프 조기 반환 앞에서 돈다. 테스트 15건 신규(코어 8·배선 7), 전체 188 통과. 가짜 npm 심 + 임시 홈 종단 검증 9/9(실제 홈·레지스트리 무변경). 실제 레지스트리 상대로는 무스큐라 조용. README EN·KO 설치·업데이트 섹션. 한계: 출시 뒤처짐만 잡고 레포가 출시보다 앞선 스큐는 못 잡는다(2026-11-23 Case 4). 정본 레포용 로컬 검사는 제안만 하고 구현하지 않았다.
- 2026-11-23T20:19+09:00 — VERDICT: superseded — 사용자 판정(2026-11-23): 자동 갱신은 설치까지가 기본기능 — '안내만 하고 설치는 안 한다'는 에이전트의 설계 선택이었고 안내만으로는 부족하다. qmd 동반 갱신(B안)이 이미 자동 설치하므로 llm-wiki 자신도 같은 방식으로 끌어올린다. 'llm-wiki 자기 갱신' 카드가 계승
