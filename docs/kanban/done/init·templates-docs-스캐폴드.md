---
title: init·templates docs/ 스캐폴드
status: done
ordinal: 12000
created: 2026-10-02
depends_on: ["find-doc-root — docs/ 우선 이중 해석"]
milestone: docs/ 레이아웃 전환
---

## Goal
<!-- kanban:goal:begin -->
새 init은 docs/ 골격을 만들고 기존 레포 init 재실행도 docs/를 상대한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 임시 레포에서 init 실행 시 doc/이 아니라 docs/(wiki·raw·kanban) 생성
- [x] #2 생성된 AGENTS.md 시드와 githooks pre-commit이 docs/ 경로를 언급
- [x] #3 마이그레이션된 레포에서 init 재실행하면 갱신이 docs/에 반영되고 doc/을 재생성하지 않는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-10-02T14:27+09:00 — 지시: 무엇을 — lib/init.js docDir·templatesDoc·loadConfig 호출 인자(cwd,'doc') 2곳, templates/doc 디렉토리를 templates/docs로 git mv(히스토리 유지), templates/AGENTS.md·githooks/pre-commit 내용 갱신. 건드리지 말 것 — 마커 갱신 로직·SKILL_TARGETS(.agents/.claude)·qmd 충돌 검사·스킬 복사 경로. 틀리기 쉬운 것 — templates/doc 안 파일 경로가 골격 구조를 그대로 미러링하므로 디렉토리 rename만으로는 안 되고 참조 문자열도 함께, init 재실행이 doc/을 되살리는 회귀가 AC 3번.

## Handoff

## Result
- 2026-10-02T14:52+09:00 — 커밋 bf0aec2. templates/doc→docs git mv + 시드 3종 내용 갱신 + init docs/ 스캐폴드·레거시 경유·옵트아웃 유지 + LLM_WIKI_ROOT basename 무관 일반화. AC#1: init-docs-layout 테스트 '새 init은 docs/ 골격' — docs/wiki·raw·kanban 생성, doc/ 부재 확인. AC#2: 같은 테스트 AGENTS.md 시드 docs/kanban 언급 + githooks pre-commit docs/raw/*.md 경로(grep 검증). AC#3: '레거시 doc/ 레포의 init 재실행' 테스트 — 마이그레이션 발화 후 doc/ 재생성 없음. npm test 103종 통과.
