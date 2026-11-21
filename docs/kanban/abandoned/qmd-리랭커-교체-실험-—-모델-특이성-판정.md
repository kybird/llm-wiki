---
title: qmd 리랭커 교체 실험 — 모델 특이성 판정
status: abandoned
ordinal: 21000
created: 2026-11-21
milestone: qmd 리랭커 CUDA 가짜 OOM 근본 수리
discard_reason: 카드 1 소거 행렬이 원 질문을 기각: S3(리랭커 단독 0/5)·S4(공존 3/5)·S7(컨텍스트만 폐기 0/5)로 트리거는 모델이 아니라 '임베드 컨텍스트 상주'로 확정 — 모델 교체는 해소책이 될 수 없음(교체 모델도 공존하면 동일 축), 특이성 판정도 S3이 이미 답함. 처방은 카드 4로 이동
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
