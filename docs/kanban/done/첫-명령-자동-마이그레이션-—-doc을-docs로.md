---
title: 첫 명령 자동 마이그레이션 — doc을 docs로
status: done
ordinal: 11000
created: 2026-10-02
depends_on: ["find-doc-root — docs/ 우선 이중 해석"]
milestone: docs/ 레이아웃 전환
---

## Goal
<!-- kanban:goal:begin -->
레거시 레포에서 첫 llm-wiki 명령이 doc/를 docs/로 git mv한다(옵트아웃 가능)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 doc/wiki만 있는 임시 git 레포에서 board 실행 시 docs/로 이동 + doc/ 소멸 + git 인덱스에 rename 반영
- [x] #2 llm-wiki.config.json에 migrateDocDir:false면 이동 없이 doc/로 계속 동작
- [x] #3 wait 명령은 마이그레이션을 트리거하지 않는다(stdout 계약 보호)
- [x] #4 doc/wiki가 없는 doc/ 디렉토리는 건드리지 않는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-10-02T14:27+09:00 — 지시: 무엇을 — lib/migrate-doc-dir.js 신설(마커 불요: docs/ 존재 자체가 완료 신호), bin/llm-wiki.js 진입점에서 명령 dispatch 전 호출, loadConfig에 migrateDocDir(기본 true), git 레포면 git mv doc docs·아니면 fs.renameSync, 실패(EBUSY 등) 시 한 줄 안내 후 다음 명령으로 연기, qmd index.yml에 /doc/ 잔존 경로 있으면 재등록 안내 한 줄. 건드리지 말 것 — findDocRoot는 사이드이펙트 없는 순수 리졸버로 유지(마이그레이션 호출은 진입점에서), wait는 아예 트리거 제외(stdout 계약 — hash:16e7eb9 선례), 성공 출력은 요약 수 줄로 제한. 틀리기 쉬운 것 — Windows에서 모니터가 doc/을 열어두면 rename EPERM(try-catch 연기), 문서 루트는 주 워크트리에 있으므로 링크 워크리 실행에도 주 워크트리 기준 이동(findDocRoot 반환값 그대로 쓰면 됨), 마이그레이션 판정은 'doc/wiki 존재 + docs/ 부재'만.

## Handoff

## Result
- 2026-10-02T14:44+09:00 — 커밋 38b8f5d. lib/migrate-doc-dir.js 신설 + bin 진입점 연결(auto-update와 동일 트리거·동일 제외 사유) + loadConfig migrateDocDir(기본 true). AC#1: 종단 테스트 — 임시 git 레포 board 1발에 doc 소멸·docs/wiki 존재·git status R 스테이징 확인. AC#2: config migrateDocDir:false 테스트로 이동 없음 확인. AC#3: wait --timeout 1 → exit 2·침묵·doc 불변 테스트. AC#4: wiki 없는 일반 doc/ 무변화 테스트. 추가: docs/ 선점 시 보류 안내, git 없는 폴더 rename 폴백. npm test 100종 전부 통과(신규 파일 2종 npm test 목록 편입 포함 — C1 레이아웃 테스트가 목록 밖이던 결함도 여기서 수습).
