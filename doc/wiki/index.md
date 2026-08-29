---
tags: [index]

# Wiki Index

llm-wiki 프로젝트의 구조화된 지식 베이스입니다. `doc/raw/` 로그에서 추출한 핵심 개념과 패턴을 정리했습니다.

---

## Concepts

| 개념 | 설명 | 별칭 |
|------|------|------|
| [[qmd-optional-dependency]] | @tobilu/qmd는 선택 의존성 — 없으면 grep으로 강하하고, 있으면 시맨틱이 더해진다. | semantic search optional, findQmd, QMD 설치 위치 |

---

## Patterns

| 패턴 | 설명 | 별칭 |
|------|------|------|
| [[always-merge-exact-matching]] | 하이브리드 검색에서 시맨틱과 정확 매칭은 대체재가 아니라 보완재 — 항상 둘 다 돌린다. | QMD grep merge, semantic fallback bug, 하이브리드 검색 병합 |
| [[header-date-over-mtime]] | 로그 신선함 판정은 파일 mtime이 아니라 로그 헤더의 날짜로 한다. | same-day false positive, mtime 오탐, checkout machine independence |

---

## Anti-Patterns

| 안티패턴 | 설명 | 별칭 |
|------|------|------|
| [[cuda-version-coexistence]] | 여러 CUDA 버전을 공존시키면 prebuilt 바이너리가 깨지고 소스빌드 지옥으로 빠진다. | STL1002, cublas64 DLL conflict, win-x64-cuda load failure |

---

## Answers

| 답변 | 설명 | 별칭 |
|------|------|------|

---

## Statistics

- Total concepts: 1
- Total patterns: 2
- Total anti-patterns: 1
- Total answers: 0
- Last updated: 2026-08-29
