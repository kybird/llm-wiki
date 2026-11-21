---
title: qmd 리랭커 안정화 처방 적용
status: done
ordinal: 23000
created: 2026-11-21
depends_on: ["qmd 리랭커 CUDA 크래시 최소 재현 하네스","qmd 리랭커 교체 실험 — 모델 특이성 판정","llama.cpp CUDA 크래시 상류 추적·재시험"]
milestone: qmd 리랭커 CUDA 가짜 OOM 근본 수리
---

## Goal
<!-- kanban:goal:begin -->
규명 결과를 설정·코드에 반영해 CUDA 경로를 안정화한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 선택된 처분(리랭커 기본값 교체·버전 고정·백엔드 전환·상류 제보 중 하나)이 커밋으로 반영된다
- [x] #2 처방 후 llm-wiki search 10회 연속 실행에서 CUDA 크래시 마커가 0회다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-21T14:29+09:00 — RESUMED: 근거: 카드 1 소거 행렬 S7 — 임베드 컨텍스트만 폐기해도 0/5로 안정 경로 실증(웨이트 상주 무관). 게이트 조건 '카드 1-3 중 하나가 안정 경로' 충족. 처방 1순위는 로컬 패치가 아닌 qmd 2.9.0 업그레이드(llama.cpp 갱신 포함, 2026-11-17 발행) 실측 후 잔여 크래시 시 패치
- 2026-11-21T14:38+09:00 — 처방 확정(2026-11-21): qmd 2.9.0 업그레이드(node-llama-cpp 3.22.3 동봉) — 로컬 패치 불필요하게 상류에서 수리. 검증 3계층: 하네스 S4 공존 0/5(구판 3/5) · S1 풀스택 0/10(구판 4/5) · llm-wiki search 종단 10연속 무크래시(인용 라인 제외 판정). 글로벌 설치 변경이므로 롤백 처방: npm i -g @tobilu/qmd@2.8.3. 레포 내 반영: lib/wiki-search.js 주석·TROUBLESHOOTING.md 해소 정정 — vulkan 자동 강하는 구버전 qmd 기기 안전망으로 유지(소비 레포 각자 qmd 버전을 달 수 있음).

## Handoff
- 2026-11-21T12:37+09:00 — QUESTION: 조건: 최소 재현(카드 1)·모델 판정(카드 2)·상류 재시험(카드 3) 중 하나가 안정 경로를 가리키면 resume --note '근거: …'로 todo로 돌아간다. 그 전까지 처방 후보를 미리 고르지 않는다.

## Result
- 2026-11-21T14:38+09:00 — 처방=qmd 2.9.0 업그레이드로 해소(패치 불필요): S4 공존 3/5→0/5, S1 풀스택 4/5→0/10, llm-wiki search 10연속 무크래시. wiki-search.js 주석·TROUBLESHOOTING.md에 해소·트리거(임베드 컨텍스트 상주 중 rankAll) 정정 반영, 자동 vulkan 강하는 구버전 기기 안전망으로 유지. 커밋: 이 커밋(문서·주석 정정+검증 기록).
