---
title: 스킬 정본 6종 docs/ 경로 갱신
status: done
ordinal: 13000
created: 2026-10-02
milestone: docs/ 레이아웃 전환
---

## Goal
<!-- kanban:goal:begin -->
스킬 프롬프트가 소비 레포의 docs/ 레이아웃을 안내하도록 정본을 고친다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 skills/ 6개 SKILL.md에서 doc/raw·doc/wiki·doc/kanban 문자열이 docs/로 교체돼 있다(grep 검증)
- [x] #2 각 SKILL.md의 skill-version이 bump돼 있다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-10-02T14:28+09:00 — 지시: 무엇을 — skills/{kanban-plan,wiki-log,wiki-search,wiki-compile,wiki-lint,work-loop}/SKILL.md의 doc/raw·doc/wiki·doc/kanban 문자열을 docs/로 교체 + 프론트매터 skill-version bump(전파 규약). 건드리지 말 것 — .agents/skills·.claude/skills 설치 사본(커밋 훅이 전역 버전으로 되돌림 — 정본 skills/만 고치고 전파는 publish 후 skills sync), work-loop v12 밤샘 부트스트랩 로직. 틀리기 쉬운 것 — 역사 서술 등 문맥상 경로가 아닌 doc/은 기계적 치환하지 않기(판단은 문맥), 스킬 본문이 소비 레포를 상대한다는 시점 유지.

## Handoff

## Result
- 2026-10-02T14:53+09:00 — 커밋 c8e287f. 6종 SKILL.md의 doc/raw·doc/wiki·doc/kanban 17곳 → docs/ 전면 교체(문맥 검토 — 전부 살아있는 경로 지시, 역사 서술 속 경로 없음) + skill-version bump(각 +1: kanban-plan 6·wiki-compile 3·wiki-lint 3·wiki-log 3·wiki-search 3·work-loop 13). AC#1: grep skills/*/SKILL.md doc/(raw|wiki|kanban) 결과 0. AC#2: frontmatter skill-version bump 6종 확인. .agents/.claude 사본 미수정(커밋 훅 되돌림 규약 — 전파는 publish 경유).
