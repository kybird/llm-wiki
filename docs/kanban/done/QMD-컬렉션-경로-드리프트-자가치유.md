---
title: QMD 컬렉션 경로 드리프트 자가치유
status: done
ordinal: 18000
created: 2026-11-07
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
0.6.0 doc->docs 마이그레이션 후 QMD 재등록이 조용히 실패하는 3결함 수정(B 최우선). 실측 사고: TTSTextViewer 2026-10-29 수동 마이그레이션(1a4432e5) 후 9일간 ttswiki Files:0·의미검색 누락 — 힌트는 발화 기회 자체가 없었다(수동 경로, hintQmdIfStale은 자동 이동 성공 시 1회: lib/migrate-doc-dir.js:43-61,94), syncQmd는 이름 존재만 체크해 죽은 경로 영구 방치(lib/wiki-compile.js:354-361), 370행은 무조건 ✓ synced. 수정: B=collection show가 노출하는 Path:로 등록 경로 검증 후 불일치 시 remove+add 업서트(수동·자동 마이그레이션 모두 다음 compile에서 치유), C=update 뒤 collection list의 Files: N으로 '디렉터리 비었지 않은데 0건' 경고(update 출력 캡처 불요 — stdio inherit 보존), A=hintQmdIfStale을 안내에서 수행으로(B 헬퍼 재사용, 실패해도 명령 안 죽임·migrateDocDir:false 존중). 검증 2026-11-07 확정: npm 0.7.0·git 0.8.0 모두 동일 결함(v0.6.0 이후 해당 파일 커밋 278a391뿐·syncQmd 무관). 소비 레포 scripts/compile.js는 llm-wiki 배포물 아님 — 그 레포 자체 레거시이자 lib의 원조(lib/wiki-compile.js:2 주석)라 수정 범위는 이 레포 lib만. 참고: sugarscan·supertonicstudio·lossfunction·pocketgauage 컬렉션은 전환 전(Files>0) — B 선행 배포가 예방.
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 드리프트 상태(등록 경로≠기대 경로)에서 llm-wiki compile index 1회로 경로 교정 + 실제 색인 발생(Files>0)
- [x] #2 0건 색인(대상 디렉터리에 .md 있는데 Files:0)이면 ⚠ 경고 출력, ✓ synced 금지, json 봉투 qmdSynced:false
- [x] #3 자동 마이그레이션 종료 시점에 레지스트리가 신규 docs/ 경로를 가리키거나 실패 시 다음 compile의 B가 치유하는 상태로 종료 — 옵트아웃·명령 불사 계약 유지
- [x] #4 기존 qmd 목킹 패턴(test/wiki-compile-unpromoted.test.js) 확장으로 B·C 단위 테스트 — 전역 등록부 쓰기 재현은 승인 후 국소적으로
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
- 2026-11-08T13:38+09:00 — B: syncQmd가 collection show로 등록 경로 검증→불일치 remove+add 업서트(lib/qmd-collections.js ensureCollections) — 수동·자동 마이그레이션 모두 compile 1회 치유(회귀테스트: 드리프트 시드→경로 교정+Files>0+멱등). C: update 뒤 list Files 검증 — .md 있는데 0건이면 ⚠·✓금지·qmdSynced:false(+파싱 불능 공허통과 차단). A: 마이그레이션이 안내 대신 재등록 수행, 감지는 죽은 doc 경로에 한정(형제레포 과대매치 수습), qmd 없으면 수동 안내 강하·실패해도 명령 불사. 검수: subagent 리뷰 수용조건부→P2 6건 전부 반영(공백이름 파싱·감지 경계·공허통과·stub 충실도·문구 구분·diff 위생). 별건: pick 위치인자 함정 재발(10-15 문서화 결함 2회차) — 위치인자 거부 가드 별도 커밋. 테스트 140/140.
