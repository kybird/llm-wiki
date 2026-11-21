---
title: llama.cpp CUDA 크래시 상류 추적·재시험
status: done
ordinal: 22000
created: 2026-11-21
depends_on: ["qmd 리랭커 CUDA 크래시 최소 재현 하네스"]
milestone: qmd 리랭커 CUDA 가짜 OOM 근본 수리
---

## Goal
<!-- kanban:goal:begin -->
상류의 동일 결함 사례·수리 상태를 매핑하고 최신 node-llama-cpp에서 재시험한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 llama.cpp·node-llama-cpp 이슈 검색 결과(동일 증상 링크 또는 부재 확인)가 노트에 남는다
- [x] #2 신버전 node-llama-cpp를 임시 디렉터리에 격리 설치해 최소 재현 하네스를 재실행한 결과가 기록된다
- [x] #3 상류 수리 존재 시 버전·PR 링크가 노트에 남는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-21T12:37+09:00 — 할 것: 상류 검색 키워드는 실측 에러 문자열(ggml-cuda.cu·CUDA error·out of memory·win32)로. 신버전 node-llama-cpp는 임시 디렉터리에 격리 설치해 본체와 섞지 않는다. 건드리지 말 것: 글로벌 qmd와 그 node_modules 버전. 틀리기 쉬운 곳: 신버전 1회 통과를 수리 판정으로 읽음 — 카드 1 하네스의 재현율과 비교해야 성립.
- 2026-11-21T14:37+09:00 — 실측(2026-11-21): qmd 2.8.3(n-l-c 3.20.0)→2.9.0(n-l-c 3.22.3) 업그레이드 후 소거 행렬 재실행(results-2026-11-21T05-31-25-939Z.json) — S3 리랭크만 0/5·S4 임베드 상주+리랭크 0/5(구판 3/5) — 상류 llama.cpp 갱신으로 공존 크래시 해소. AC#2의 '임시 디렉터리 격리' 대신 사용자 승인 글로벌 업그레이드로 실측(롤백 npm i -g @tobilu/qmd@2.8.3 한 줄). 상류 매핑: withcatai/node-llama-cpp #519(qmd llm.js 주석의 원 인용 — win32 CUDA 동시 컨텍스트 불안, ggml-cuda.cu:98)·#632(context disposal race crash)·context shift 수정군이 후보; llama.cpp #10958(context shift 크래시) 계열은 인접. 정확 수리 PR 특정 실패(릴리스 노트 스니펫 한정) — 판정 근거는 버전 대조 실측(3.20.0 크래시 ↔ 3.22.3 클린).

## Handoff

## Result
- 2026-11-21T14:37+09:00 — 상류 해소 확인: qmd 2.9.0 동봉 n-l-c 3.22.3에서 공존 크래시 소거(S4 3/5→0/5, S1 풀스택 4/5→0/10, llm-wiki search 종단 무크래시). 후보 수정: n-l-c #632(context disposal race)·context shift 군, 원 인용 #519. lib/wiki-search.js 주석의 '3.22로도 못 막는다'는 3.22.3 실측으로 무효화 — 카드 4에서 문서 정정 예정.
