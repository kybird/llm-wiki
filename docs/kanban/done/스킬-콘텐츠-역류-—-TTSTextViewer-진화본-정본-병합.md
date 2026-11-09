---
title: 스킬 콘텐츠 역류 — TTSTextViewer 진화본 정본 병합
status: done
ordinal: 19000
created: 2026-11-10
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
TTSTextViewer에서 독자 진화한 스킬 지시문(work-loop 무소속/retro-bundle/8a, kanban-plan 2026-10-15 규약, wiki-compile 규범 문장)을 이 레포 skills/ 정본에 병합하고 skill-version을 단일 진실 원천(llm-wiki)에서만 범프한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 skills/work-loop/SKILL.md가 무소속 자동편입(2026-10-15)·retro-bundle 금지 조항·8a pick 직후 검색을 포함하고 skill-version이 15다
- [ ] #2 skills/kanban-plan/SKILL.md가 2026-10-15 규약(사후 편입 --retro·무소속 legal resting state·종결 마일스톤 불변)을 포함하고 skill-version이 8이다
- [ ] #3 wiki-compile은 프로젝트 고유 기여(머신 특이 진단은 스킬 밖 규벝 문장)만 채택해 v4; wiki-log/wiki-lint/wiki-search는 무변경 — 프로젝트판이 구판 하위집합임을 diff로 실측 완료
- [ ] #4 TTSTextViewer 쪽 파일은 읽기만 했다(쓰기 없음)
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-10T00:01+09:00 — 무엇을: 프로젝트판 파일을 정본에 이식(work-loop 148-161 hunk 전체, kanban-plan 97-107 hunk 전체) 후 버전 범프(work-loop 14→15, kanban-plan 7→8, wiki-compile 3→4). 무엇을 건드리지 말 것: syncQmd 경로 드리프트 수정(이미 0.10.0 발행본)·wiki-search scripts/ 역류(레포 CLI 판이 정본)·wiki-log/lint/search 본문(프로젝트판이 구판 하위집합). 어디서 틀리기 쉬운가: 프로젝트판 전체를 그대로 덮으면 안 됨 — 버전 라인만 정본 범프로 유지해야 단일 진실 원천이 지켜진다; .agents/.claude 미러 갱신은 node bin/llm-wiki.js init으로.

## Handoff

## Result
- 2026-11-10T00:02+09:00 — work-loop v15(무소속 자동편입·retro-bundle·8a pick 직후 검색 이식)·kanban-plan v8(2026-10-15 규약 --retro 사후 편입 이식)·wiki-compile v4(머신 특이 진단은 프로젝트 위키 규범 문장 채택) — 잔여 diff 프로젝트↔정본: work-loop·kanban-plan은 버전 라인만. wiki-log/lint/search는 실측 결과 프로젝트판이 구판 하위집합(script-era qmd 하드코딩 포함)이라 무변경. 미러 6면 node bin/llm-wiki.js init으로 갱신. TTSTextViewer 쓰기 0회
