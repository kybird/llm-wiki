---
name: wiki-log
description: Record knowledge into raw memory with a fixed Case skeleton (header line + Grounding/검색 단서/상황/가설/판정/조치, free prose inside). Captures errors, decisions, and discoveries with high-density grounding.
skill-version: 4
---
# When to use
- After an error occurs or a bug is fixed
- After making a design decision or architectural choice
- After verifying a hypothesis or benchmarking performance
- When discovering non-obvious behavior (library quirk, platform limitation)
- When documenting "why" something was done a certain way

# The one skeleton (2026-10-15 계약 — 4타입 템플릿은 폐지됐다)

모든 Case는 **하나의 골격**을 쓴다. 타입(error·design·verification·discovery)은
본문 골격을 바꾸지 않는다 — **회수 필터용으로 헤더 라인에만 산다.** 섹션 본문은
자유 산문이다. 골격은 에피소드→시맨틱 승격(compile)의 인터페이스 계약이자
회수(search)의 기계 계약이다(lint가 검사한다).

```markdown
## [YYYY-MM-DD type] Case N: 제목
(예: ## [2026-10-15 error] Case 2: win32 CUDA 리랭커 가짜 OOM)

### Grounding
- Git Context: `hash:<git_hash>`
- Evidence: [path/to/artifact or log — 측정값 포함]
- Confidence: [1-5]/5

### 검색 단서
모르던 시점의 내가 검색창에 쳤을 단어들 — 에러 문자열 조각, 파일명, 명령어,
증상어. 기록은 "안 상태의 나"(교훈에 이름 붙인 어휘)가 하고 검색은 "모르는
상태의 나"(증상의 어휘)가 한다는 간극이 구조적으로 존재한다. 이 어휘는 작성
직후 증발하므로 지금, 이 순간에 남긴다.

### 상황
무엇을 마주했나 — 문제·갈림길·놀람·질문 전부 이 한 칸에 담는다. error 타입이면
증상 첫 줄에 **에러 메시지를 문자 그대로**(copy-paste, 요약 금지) 붙인다 — 실무
검색어는 에러 붙여넣기가 대부분이고, 요약된 메시지는 정확히 걸릴 문자열을 지운다.

### 가설
그때 뭐라고 생각했나 — 세운 추측, 검토한 대안, 그리고 **기각된 것들과 그 근거**.
기각 이력이 안티패턴의 본체다(같은 그럴듯한 설명의 재변론을 막는다).

### 판정
실제로 참이었던 것 — 루트코즈(error), 선택 근거(design), 확정/기각(verification),
메커니즘(discovery)이 모두 이 칸이다. 근거(측정·출처)를 함께.

### 조치
그래서 뭘 했나 — 픽스, 구현, 수습, 활용. 되돌릴 수 있는 경로를 남긴다.

### Related Knowledge
- Concepts: [[concept-name]] / Patterns: [[pattern-name]] / Anti-Patterns: [[what-to-avoid]]
(선택 — 그래프 간선만 적는다)
```

# Action
1. Determine Date Filename
- Use current date in format: YYYY-MM-DD.md
- File path: docs/raw/YYYY-MM-DD.md
- **Layout contract**: `docs/` (plural) is the canonical doc root — a legacy `doc/` is a
  fallback, never the write target. When both exist, judge by `docs/`.
- 새 Case면 N은 파일 안 순번을 이어간다.

2. Concept Drift Protection (MANDATORY)
- **Search before naming**: Use `llm-wiki search` or `ls docs/wiki/concepts/` to find
  existing concepts. Reuse existing names to maintain a dense knowledge graph.
- **Collect aliases**: note every other name the same concept travels under
  (Korean/English variants, error codes, product shorthand) — compile puts
  `aliases: [...]` in the wiki page frontmatter (plan.md 5.1(3)).

3. 검색 단서 작성 (MANDATORY — 승격·회수가 의존하는 필드)
- Case를 쓰기 **직전**, 아직 문제를 모르던 자신이 되어봐라: 뭘 검색했겠는가.
- 그 단어들을 그대로 나열한다(에러 문자열 조각·파일명·명령어·증상어). 다듬지
  마라 — 미래의 검색은 다듬어진 말을 치지 않는다.

4. Create Entry — 위 골격 그대로. 본문 산문은 자유지만 **6개 섹션 이름은 고정**이다
   (lint가 검사한다). 본문 길이는 판정의 밀도가 정한다.

# Output
- File created or updated: docs/raw/YYYY-MM-DD.md
- Case anchor for direct linking: #case-N
- **Index Update**: Run `llm-wiki compile index` to make the new case searchable
  (rebuilds wiki index + syncs QMD search index). If QMD is not installed, the case
  is still found via grep fallback.
