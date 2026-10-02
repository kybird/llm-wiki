---
title: frontmatter 왕복 보존
status: done
ordinal: 8000
created: 2026-09-09
---

## Goal
<!-- kanban:goal:begin -->
직렬화→파싱 왕복이 값 형태를 보존 — 제목·폐기 사유가 변형되지 않게
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 '[a, b]' 꼴 문자열 제목이 왕복 후에도 문자열로 남는다
- [x] #2 쉼표 포함 제목의 depends_on 항목이 분해되지 않는다
- [x] #3 board.yml statuses 파싱이 행내 주석의 ']'에 오염되지 않는다
- [x] #4 AC 센티널 안 비-AC 줄이 왕복에서 소실되지 않는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-09T20:21-07:00 — 구현: ① 배열 직렬화를 JSON 꼴()로 — 원소 쉼표·괄호 왕복 보존, 파싱은 JSON.parse 우선+비인용 레거시  쉼표 분해 폴백 ② 로 시작하는 문자열 스칼라는 JSON.stringify로 감싸 배열 변형 차단, 쌍따옴표 값은 JSON.parse 역이스케이프 ③ 짝이 맞는 따옴표만 박리(비대칭 그대로 보존) ④ statuses 정규식을 \[[^\]]*\]로 — 행내 주석의 ']' 오염 차단 ⑤ AC 센티넬 안 비-AC 줄을 앞 항목 연속행으로 흡수(소실 방지) ⑥ card new에 슬러그 충돌 검사(a/b≡a:b 같은 파일명 덮어쓰기 차단). 검증: 수정 전 4결함 전부 재현(배열 변형·3분해·주석 오염·근거 소실) → 수정 후 왕복 행렬 11케이스 PASS(스칼라 8+배열 3, 이중 왕복 안정) + 레거시 배열 파싱 회귀 PASS + 실보드 board/report 정상 + CLI e2e(쉼표 제목·노트 보존·슬러그 충돌 차단)

## Handoff

## Result
- 2026-09-09T20:21-07:00 — 무엇을 바꿨나: lib/kanban.js — parseFrontmatter/serializeFrontmatter를 값 형태 보존 계약으로 재작성(JSON 배열 직렬화·선행 [ 문자열 인용·쌍따옴표 JSON 역이스케이프·짝따옴표만 박리), loadConfig statuses를 비탐욕 [^\]]*로, parseBody AC 연속행 흡수. lib/kanban-cmd.js — card new 슬러그 충돌 거부. 무엇으로 검증했나: 수정 전 4결함 재현 → 수정 후 왕복 안정 행렬 11/11 PASS, 레거시 비인용 배열 호환, 실보드 회귀(board·report·의존 게이트), CLI e2e(쉼표 제목 생성→편집→조회 왕복, 슬러그 충돌 두 경로 차단)
