---
title: qmd 리랭커 안정화 처방 적용
status: review
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
- [ ] #1 선택된 처분(리랭커 기본값 교체·버전 고정·백엔드 전환·상류 제보 중 하나)이 커밋으로 반영된다
- [ ] #2 처방 후 llm-wiki search 10회 연속 실행에서 CUDA 크래시 마커가 0회다
<!-- kanban:ac:end -->

## Plan

## Notes

## Handoff
- 2026-11-21T12:37+09:00 — QUESTION: 조건: 최소 재현(카드 1)·모델 판정(카드 2)·상류 재시험(카드 3) 중 하나가 안정 경로를 가리키면 resume --note '근거: …'로 todo로 돌아간다. 그 전까지 처방 후보를 미리 고르지 않는다.

## Result
