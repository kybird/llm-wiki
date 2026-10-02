---
title: write-validation-matches-read-semantics
description: 쓰기 경로의 검증은 읽는 쪽(pick)의 판정과 정확히 같아야 한다 — 더 엄격하면 합법 상태를 입력할 길이 없고, 더 느슨하면 읽는 쪽이 영원히 못 푼다.
status: active
created: 2026-09-10
tags: [pattern]
aliases: [의존성 검증, depends_on 후기 등록, --add-depends, --remove-depends, 순환 거부, cycle rejection, validateDepTargets]
---

# write-validation-matches-read-semantics

> depends_on을 **쓰는** 규칙(검증)을 만들 때는 **읽는** 규칙(pick의 resolved 판정)을
> 기준 삼는다. 쓰기가 읽기보다 엄격하면 검증이 합법적인 상태를 차단하고, 느슨하면
> 검증이 pick을 영구히 막는 끊어진 간선을 발행한다.

### Grounding
- Git Context: `hash:cc0f4b1` (결함 시점) → 2026-09-10 수정 커밋
- Evidence: doc/raw/2026-09-10.md Case 2 — card edit에 의존성 편집(--depends 교체 / --add-depends / --remove-depends, ac 계열 어법) 추가. lib/kanban-cmd.js validateDepTargets·depCyclePath
- Confidence: 5/5

### The Rule
1. **정확한 제목 일치로 존재 검사** — findCard의 슬러그 폴백을 따라주면 pick(정확한
   제목만 비교)이 영원히 못 푸는 의존성을 검증이 승인한다.
2. **순환 판정은 활성(cards/) 카드의 간선만** — 종결 카드를 의존성 **대상**으로 넣는
   것은 허용(pick의 resolved = done/superseded 폴더), 종결 카드 **자신의** depends_on은
   아무도 기다리지 않는 죽은 이력이라 순환을 만들지 않는다. 전체 간선으로 판정하면
   거짓 양성만 생긴다.
3. **새로 들어오는 간선만 검증** — 이미 있던 의존성의 제거는 검증 없이 허용(레거시의
   끊어진 간선 정리 길). 단 제거 대상이 현재 목록에 없으면 오타로 보고 실패 —
   check-ac가 없는 번호를 거부하는 것과 같은 규칙.
4. **락 안에서의 비용** — 카드 전수 로드는 검증당 1회(findCard 1회와 같은 비용).

### Why it works
- 선행 카드가 나중에 생기는 것이 정상 흐름이다 — 의존성은 카드 생성 때가 아니라
  계획하다가 알게 된다. card new 때만 --depends를 받으면 Notes 저널을 잃는 카드
  재생성이나 pick이 못 읽는 자유 텍스트 메모라는 우회가 생긴다.
- 문서가 먼저일 수 있다 — kanban-plan 스킬은 이미 "cycles are rejected"를 약속했고
  이번에 코드가 따라잡았다. 스킬 프롬프트와 CLI 계약이 어긋나면 에이전트가 약속을
  믿고 진행한다.

### Trade-offs
- 멱등성: `--add-depends`가 이미 있는 의존성이면 `변경 없음`(종료 코드 0) — 값이 같다고
  실패로 만들면 재시도가 깨진다([[agent-cli-contract]]).
- 활성 간선 한정 순환 판정은 doing/review 카드가 reopen되는 경로의 일시적 교착을
  완전히 배제하지 않는다 — 그는 읽기 규칙 밖 상태 전이(reopen)의 문제다.

### Anti-Pattern
- 쓰기 검증을 "이상적으로" 만들기 — 종결 카드 경유 경로까지 순환으로 거부하면, 아무
  잘못 없는 사용자(종결 의존성 + 그 카드의 옛 간선)가 합법적인 상태를 입력할 방법이
  없어진다.

### Related Knowledge
- Concepts: [[agent-cli-contract]]
