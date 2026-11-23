---
title: raw 마이그레이션과 문서 정정
status: review
ordinal: 23000
created: 2026-10-15
depends_on: ["wiki-log 스킬 재작성","raw 골격 lint 검사"]
milestone: 에피소드 메모리 회수 가다듬기
---

## Goal
<!-- kanban:goal:begin -->
기존 raw 15개 파일을 새 골격으로 전환하고 README 카파시 링크를 gist로 정정하며 lint 컷오프를 제거한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 docs/raw 전 파일이 새 골격이고 lint가 컷오프 없이 전 파일 엄격 통과한다
- [ ] #2 README의 카파시 인용 링크가 gist 442a6bf555914893e9891c11519de94f를 가리킨다
- [ ] #3 기존 테스트 전량 통과
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff
- 2026-10-15T23:49+09:00 — QUESTION: 잔여: 레거시 raw 12개 파일(08-29·08-30·09-02·09-09·09-10·09-12·09-16·09-18·09-22·09-24·10-02·10-03)을 신규 골격으로 전환. 템플릿=docs/raw/2026-10-15.md·2026-10-13.md(이미 전환됨), 매핑 규칙=docs/superpowers/specs/2026-10-15-episode-memory-retrieval-design.md §6. 전환 완료 후 lib/wiki-lint.js의 RAW_SKELETON_CUTOFF 제거(전 파일 엄격 검사)가 AC 마지막 조각. README 링크 정정은 완료.

## Result
