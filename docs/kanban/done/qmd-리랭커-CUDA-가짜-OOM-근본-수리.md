---
title: qmd 리랭커 CUDA 가짜 OOM 근본 수리
status: done
ordinal: 19000
created: 2026-11-21
kind: milestone
outcome: adopted
outcome_at: 2026-11-21T14:39+09:00
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
- 2026-11-21T14:38+09:00 — 전원 종결 자동 반영: 멤버 4장 (done 3 · superseded 0 · abandoned 1) — 작업 완결이지 노선/제품 판정이 아니다(판정은 verdict 명령으로 별도 기록)
- 2026-11-21T14:39+09:00 — VERDICT: adopted — 처방(글로벌 qmd 2.9.0 업그레이드)이 3계층 실측으로 채택 확정: 하네스 S4 공존 3/5→0/5, S1 풀스택 4/5→0/10, llm-wiki search 종단 10연속 무크래시(2026-11-21). 원하는 부산물: 트리거 규명(임베드 컨텍스트 상주 중 rankAll)·소거 행렬 하네스(scripts/qmd-cuda-repro)·TROUBLESHOOTING/wiki-search 주석 정정.
