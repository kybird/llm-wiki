---
title: qmd 리랭커 CUDA 가짜 OOM 근본 수리
status: todo
ordinal: 19000
created: 2026-11-21
kind: milestone
---

## Goal
<!-- kanban:goal:begin -->
리랭크 크래시의 트리거를 규명해 vulkan 강하에 의존하지 않는 안정 CUDA 경로를 확정한다
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-11-21T12:37+09:00 — 배경: 2026-10-13 회피(efe4c14 vulkan 강하) 후 5주간 근본 원인 불명 — 2026-11-21 세션 첫 검색에서도 재현(RTX 4070 8GB, 여유 6.4GB, qmd 직렬화 아래). 소거된 축: 리랭크 컨텍스트 축소·MMQ/CUBLAS 강제·node-llama-cpp 3.22·qmd win32 CUDA 컨텍스트 직렬화(#519 대응). 참조: TROUBLESHOOTING.md 런타임 OOM 섹션, qmd llm.js #519 주석.

## Handoff

## Result
