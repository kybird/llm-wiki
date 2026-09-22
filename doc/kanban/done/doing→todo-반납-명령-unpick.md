---
title: doing→todo 반납 명령 unpick
status: done
ordinal: 7000
created: 2026-09-21
---

## Goal
<!-- kanban:goal:begin -->
pick의 역수 명령을 추가한다: doing 카드를 사유와 함께 todo로 반납해, handoff 오용(review 큐 오염)·만료 대기(WIP 묶임) 우회로를 없앤다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 unpick 이 doing 카드를 todo로 되돌리고 클레임을 해제한다(Notes에 UNPICKED 사유, activity에 unpicked)
- [x] #2 why 사유 없으면 거부하고, todo·review·done·종결은 저맞는 명령을 안내해 거부한다
- [x] #3 반납 직후 WIP 칸이 비어 다음 pick이 바로 가능하다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-21T22:10-07:00 — UNPICKED: 실측 스모크 — 반납 후 재집기 왕복 확인
- 2026-09-21T22:10-07:00 — 무엇을 했는가: lib/kanban-cmd.js 에 unpick(USAGE·UNPICK_FLAGS·본체·export), bin 디스패치 4곳(도움말·KNOWN_SUBCOMMANDS·auto-update 트리거·case), README 양쪽 표, work-loop v10(루프 그래프·규칙 1 '잘못 집으면 unpick, handoff 오용 금지'), 안티패턴 페이지에 현행 수습책 갱신. 사유는 reopen(--why) 관례대로 필수. 검증: test/kanban-unpick.test.js 4종(전이+클레임 해제+UNPICKED 기록·사유 필수·상태 가드 4종·WIP 즉시 반납) + 실보드 왕복 스모크(unpick→TODO 확인→재집기) + npm test 85/85. 틀리기 쉬운 곳: 값 없는 --why는 validateFlags 앞 USAGE 가드가 먼저 걸린다(done·reopen과 같은 경로 — 테스트도 그 관례로 고정).

## Handoff

## Result
- 2026-09-21T22:10-07:00 — unpick <제목> --why 사유 필수 반납 명령 추가(doing→todo·클레임 해제·WIP 즉시 반납). handoff 오용(review 큐 오염) 대체 — 2026-09-12 이중 사고의 수습책이 드디어 전용 원시형을 얻었다. npm test 85/85.
