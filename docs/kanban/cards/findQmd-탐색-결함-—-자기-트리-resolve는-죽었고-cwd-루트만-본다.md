---
title: findQmd 탐색 결함 — 자기 트리 resolve는 죽었고 cwd 루트만 본다
status: todo
ordinal: 25000
created: 2026-11-23
milestone: 무소속
---

## Goal
<!-- kanban:goal:begin -->
qmd CLI 진입점 탐색(lib/find-qmd.js)이 실제로는 cwd 루트와 글로벌 두 곳만 본다. 2단계 require.resolve(@tobilu/qmd)는 qmd 2.5.3·2.8.3·2.9.0 공통으로 ERR_PACKAGE_PATH_NOT_EXPORTED를 내며 죽은 코드다(exports의 . 가 import·types 전용 — 소스 주석의 'main은 exports에 노출되어 안전'은 틀린 서술). 3단계는 process.cwd()만 본다. 그 결과 리포 루트에 qmd가 있어도 cwd가 하위 디렉터리이고 글로벌 qmd가 없으면 findQmd()가 null — 시맨틱 검색이 조용히 건너뛰어진다. 2026-11-23 실측: 가짜 npm root -g(글로벌 qmd 없는 기계) 조건에서 cwd=lib/ 이면 null, cwd=레포 루트이면 레포 사본. 이 머신은 글로벌 qmd가 있어 가려진 상태
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 자기 트리 후보가 exports와 무관하게 발견된다 — 파일 경로 검사(모듈 위치 기준) 또는 단계 제거, 어느 쪽이든 주석이 실제 동작과 일치한다
- [ ] #2 cwd가 리포 하위 디렉터리여도 리포 루트 node_modules의 qmd를 찾는다 — 글로벌 qmd 없는 조건 + cwd=lib/ 에서 레포 루트 qmd 경로를 반환한다
- [ ] #3 회귀 테스트가 네 위치(자기 트리·cwd·cwd 상위 리포 루트·글로벌)를 가짜 패키지로 검증하고 기존 find-qmd 테스트와 전체 테스트가 통과한다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff

## Result
