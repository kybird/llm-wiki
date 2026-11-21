---
title: llama.cpp CUDA 크래시 상류 추적·재시험
status: todo
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
- [ ] #1 llama.cpp·node-llama-cpp 이슈 검색 결과(동일 증상 링크 또는 부재 확인)가 노트에 남는다
- [ ] #2 신버전 node-llama-cpp를 임시 디렉터리에 격리 설치해 최소 재현 하네스를 재실행한 결과가 기록된다
- [ ] #3 상류 수리 존재 시 버전·PR 링크가 노트에 남는다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-21T12:37+09:00 — 할 것: 상류 검색 키워드는 실측 에러 문자열(ggml-cuda.cu·CUDA error·out of memory·win32)로. 신버전 node-llama-cpp는 임시 디렉터리에 격리 설치해 본체와 섞지 않는다. 건드리지 말 것: 글로벌 qmd와 그 node_modules 버전. 틀리기 쉬운 곳: 신버전 1회 통과를 수리 판정으로 읽음 — 카드 1 하네스의 재현율과 비교해야 성립.

## Handoff

## Result
