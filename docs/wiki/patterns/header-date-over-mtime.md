---
title: Header Date Over Mtime
description: 로그 신선함 판정은 파일 mtime이 아니라 로그 헤더의 날짜로 한다.
status: active
created: 2026-08-29
tags: [pattern]
aliases: [same-day false positive, mtime 오탐, checkout machine independence]
---

# Header Date Over Mtime

> 로그가 "새 로그"인지 판정할 때 파일 mtime을 쓰면 git checkout이 머신마다 mtime을
> 갈라 중복·누락·same-day 오탐이 생긴다. 로그 헤더의 `# YYYY-MM-DD`를 기준으로 삼는다.

### Grounding
- Git Context: `hash:fd01a03`
- Git Context: `hash:4c5f27c`
- Evidence: lib/wiki-compile.js listNewLogs

### Analysis
- ISO 날짜 문자열 비교는 달력 순서와 일치하므로 정렬이 공짜다.
- 헤더가 없는 파일만 mtime으로 폴백한다 — 로그 작성 규칙(`# YYYY-MM-DD`)에 의존하되
  깨진 경우에도 동작.
- 연장 (2026-08-30): 날짜를 비교하는 **모든** 지점이 같은 시간대 기준이어야 한다.
  lastCompiled를 UTC로 계산하면 KST 자정~9시에 당일 로그가 전부 재보고됐다 —
  판정 기준값 생성도 현지 날짜로 통일(localToday).

### Related Knowledge
- Concepts: [[qmd-optional-dependency]]
- **Anti-Patterns**: [[CUDA-version-coexistence]]
