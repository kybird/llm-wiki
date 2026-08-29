---
title: always-merge-exact-matching
description: 하이브리드 검색에서 시맨틱과 정확 매칭은 대체재가 아니라 보완재 — 항상 둘 다 돌린다.
status: active
created: 2026-08-29
tags: [pattern]
aliases: [QMD grep merge, semantic fallback bug, 하이브리드 검색 병합]
---

# always-merge-exact-matching

> 검색 엔진이 유사도 결과를 반환했다고 정확 매칭을 건너뛰면, 실무 검색어(에러 메시지
> 붙여넣기)가 못 맞힌다. 시맨틱과 grep은 항상 둘 다 돌려 병합한다 — grep 결과를 먼저.

### Grounding
- Git Context: `hash:b795e4e`
- Evidence: lib/wiki-search.js

### Analysis
- 시맨틱은 표현이 달라도 잡고, grep은 정확한 문자열을 잡는다 — 잃는 것 없이 합친다.
- "성공 시 fallback 건너뜀" 구조의 역설: 색인이 싱싱할수록(시맨틱이 뭐라도 반환할수록)
  재현율이 떨어진다. 성실한 유지보수가 품질을 깎는 신호는 구조 버그다.
- grep에도 순위를 준다 — 매칭 키워드 수 내림차순 + 매칭 줄 스니펫. 파일명만 나오면
  무엇을 열어야 할지 모른다.
- **Anti-Pattern**: 부분 성공을 전체 성공으로 취급하는 조기 분기.

### Related Knowledge
- Concepts: [[qmd-optional-dependency]]
