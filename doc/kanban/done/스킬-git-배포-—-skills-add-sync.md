---
title: 스킬 git 배포 — skills add/sync
status: done
ordinal: 4000
created: 2026-08-29
---

## Goal
<!-- kanban:goal:begin -->
npm publish 없이 git URL로 스킬 배포(plan.md 6.2)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 skills add가 config에 소스를 등록한다
- [x] #2 skills sync가 diff를 보여주고 승인 후 설치한다(6.5)
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-09T20:00-07:00 — 구현: lib/skills.js + bin 연결. add/remove/list/sync 4서브커맨드. sync = 얕은 clone(로컬 경로는 --depth 제외) → SKILL.md 단위 발견(루트 단일 스킬 레포 지원) → LCS diff 제시(파일당 1회, 60줄 캡) → 승인(--yes 또는 TTY y/N; 비TTY 미승인은 거절) → .agents/skills+.claude/skills에 복사. config는 skills.sources/enabled 키만 갈아끼워 다른 키 보존. 검증(임시 git 레포 2개로 실측): ① add→config 등록 확인 ② 비TTY sync 미승인 거절 ③ --yes 설치→양쪽 타겟 반영 ④ 재sync 멱등(변동 없음) ⑤ 소스 수정→diff 5줄 출력→승인 후 덮어쓰기 ⑥ --skill 필터·remove·list·루트 단일 스킬 명명(root-skill)·문법검사 통과

## Handoff

## Result
- 2026-09-09T20:00-07:00 — 무엇을 바꿨나: skills add/remove/list/sync 구현(lib/skills.js 신규, bin/llm-wiki.js 연결+도움말). add는 llm-wiki.config.json의 skills.sources에 등록, sync는 얕은 clone→SKILL.md 발견→diff 제시→승인(--yes/TTY y/N, 비TTY 미승인 거절)→.agents/skills+.claude/skills에 복사 설치. 무엇으로 검증했나: 임시 git 소스 레포 2개(다중 스킬+루트 단일 스킬)로 실측 — add의 config 등록, 비TTY 거절, --yes 양쪽 타겟 설치, 재sync 멱등, 소스 수정 시 diff 출력 후 덮어쓰기, --skill 필터, remove, node --check 전부 통과
