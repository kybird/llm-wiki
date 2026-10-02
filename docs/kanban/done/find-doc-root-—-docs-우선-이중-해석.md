---
title: find-doc-root — docs/ 우선 이중 해석
status: done
ordinal: 10000
created: 2026-10-02
milestone: docs/ 레이아웃 전환
---

## Goal
<!-- kanban:goal:begin -->
docs/를 정본으로 찾고 레거시 doc/은 폴백으로 해석해 이중 레이아웃을 모두 읽게 한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 doc/wiki만 있는 레포에서 findDocRoot가 <root>/doc을 돌려준다(레거시 폴백) — test/find-doc-root-layout.test.js '레거시 doc/wiki만 있으면 doc/을 돌려준다'
- [x] #2 docs/wiki가 있으면 docs/가 doc/보다 우선한다 — 같은 파일 '둘 다 있으면 docs/가 이긴다'
- [x] #3 init 전 폴백이 cwd/doc이 아니라 cwd/docs를 돌려준다 — 같은 파일 'init 전 폴백은 cwd/docs다'
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-10-02T14:27+09:00 — 지시: 무엇을 — lib/find-doc-root.js 해석 3단계(주 워크트리·상위 탐색·폴백) 모두 docs/wiki 우선, doc/wiki 폴백. 건드리지 말 것 — LLM_WIKI_ROOT 오버라이드 의미(그대로 반환), LLM_WIKI_WORKTREE_LOCAL, defaultCollectionNames(경로 무관). 틀리기 쉬운 것 — 존재 신호는 doc/wiki와 동일하게 docs/wiki로만 판정(다른 doc/ 폴더를 건드리지 않는 안전장치의 기저), test/find-doc-root-worktree.test.js·auto-update.test.js가 여전히 통과해야 한다.
- 2026-10-02T14:46+09:00 — 정정: C1 Result의 'npm test 88종 전부 통과'는 사실이지만 신규 레이아웃 테스트 파일이 npm test 명시 목록 밖이었다(스위트 미포함 상태로 통과 표기 — 과장). C2 커밋 38b8f5d에서 목록 편입 + 폴백 테스트 realpath 결함(존재하지 않는 경로) 수정으로 완전 편입됐다. npm test 100종 기준 재검증 완료.

## Handoff

## Result
- 2026-10-02T14:32+09:00 — 커밋 444f8bb. docLayoutRoot(dir) 신설 — docs/wiki 정본·doc/wiki 레거시 폴백, wiki 하위 존재가 유일 판정 신호. 주 워크트리·상위 탐색·폴백 3단계 모두 적용(폴백 cwd/doc→cwd/docs). AC 검증: test/find-doc-root-layout.test.js 6종 신설(레거시 폴백·docs 우선·양쪽 존재 시 docs 승리·git 아닌 상위 탐색 양쪽·폴백 cwd/docs) — npm test 88종 전부 통과.
