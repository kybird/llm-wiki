---
title: qmd 리랭커 교체 실험 — 모델 특이성 판정
status: todo
ordinal: 21000
created: 2026-11-21
milestone: qmd 리랭커 CUDA 가짜 OOM 근본 수리
---

## Goal
<!-- kanban:goal:begin -->
리랭커 모델을 바꿔 크래시가 모델 특이적인지 일반 결함인지 판정한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 현행(Qwen3-Reranker-0.6B)과 교체 리랭커 각각 5회 llm-wiki search 실행 로그(CUDA 크래시 마커 유무)가 남는다
- [ ] #2 판정 한 줄(모델 특이/일반)과 근거(재현율 대비)가 카드에 기록된다
- [ ] #3 커밋은 실험 기록만 담고 wiki-search.js(vulkan 강하)는 무변경이다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-21T12:37+09:00 — 할 것: QMD_RERANK_MODEL로 대안 리랭커 GGUF를 지정해 llm-wiki search를 반복 실행한다. 건드리지 말 것: index.yml의 embed(embeddinggemma-300M)·generate(qmd-query-expansion-1.7B) 모델, wiki-search.js 코드. 틀리기 쉬운 곳: 몇 회 안 터짐을 모델 특이 판정으로 읽음 — 현행 리랭커 동일 횟수 대비(AC#1) 없이는 판정 불가.

## Handoff

## Result
