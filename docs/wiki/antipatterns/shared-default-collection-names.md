---
title: shared-default-collection-names
description: 두 프로젝트가 QMD 기본 컬렉션 이름을 공유하면 에러 없이 검색이 교차 오염된다.
status: active
created: 2026-08-30
tags: [anti-pattern, antipattern]
aliases: [QMD 컬렉션 충돌, 검색 교차 오염, collection name collision]
---

# shared-default-collection-names

> 여러 프로젝트가 같은 기본 QMD 컬렉션 이름을 쓰면 전역 설정(~/.config/qmd/index.yml)에서
> 충돌해 서로의 로그가 검색에 뒤섞인다. 에러가 없어서 더 나쁘다.

### Grounding
- Evidence: doc/raw/2026-08-29.md Case 3, lib/find-doc-root.js
- Confidence: 5/5

### Error
이름이 충돌해, 서로의 raw 로그가 검색에 뒤섞인다.

### Analysis
- 증상이 조용하다 — 에러 없이 "0 new"만 찍히고 엉뚱한 프로젝트 결과가 나온다.
  모든 검색 측정을 오염시키는 조용한 실패의 전형.
- 예방: 컬렉션 기본값을 리포 폴더명 기반으로 생성(find-doc-root) + init 시점 충돌 경고.
- 같은 종류의 교훈: 스코프 npm 패키지의 private 기본값([[npm-scoped-publishing]]) —
  "기본값이 의도와 다르고 실패가 조용한" 조합은 발행/등록 계층에서 반복된다.

### Related Knowledge
- Concepts: [[qmd-optional-dependency]]
