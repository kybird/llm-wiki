---
title: raw 골격 lint 검사
status: done
ordinal: 21000
created: 2026-10-15
depends_on: ["wiki-log 스킬 재작성"]
milestone: 에피소드 메모리 회수 가다듬기
---

## Goal
<!-- kanban:goal:begin -->
lint가 raw Case 골격 위반(헤더 라인 형식과 6개 고정 섹션)을 지적한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 lint json에 골격 위반이 보고된다(헤더 형식 위반과 고정 섹션 누락 구분)
- [x] #2 2026-10-16 이후 날짜 파일만 엄격 검사한다(마이그레이션 전 레거시 보호 컷오프)
- [x] #3 골격을 갖춘 파일은 위반 없이 통과한다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-10-15T23:44+09:00 — 구현+테스트 완료: collectRawSkeletonIssues — 헤더 라인 정규식([날짜 type] Case N)과 6고정섹션(Grounding/검색 단서/상황/가설/판정/조치) 검사, 빈 에피소드 파일 지적, 컷오프 2026-10-16(레거시 보호, 마이그레이션 카드에서 제거). lint json에 rawSkeleton 필드+텍스트 섹션. 138/138 통과
