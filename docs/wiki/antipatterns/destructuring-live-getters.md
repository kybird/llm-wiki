---
title: Destructuring Live Getters
description: 게터를 포함한 반환 객체를 구조 분해하면 그 순간 평가된 스냅샷 원시값이 복사된다 — 살아있는 값이 죽은 값으로 위장한다.
status: active
created: 2026-09-12
tags: [anti-pattern]
aliases: [게터 구조 분해, getter destructuring, out 스냅샷, 빈 stdout 오인, destructuring getter snapshot]
---

# Destructuring Live Getters

> `const { out } = spawnWait(...)` — 게터 `get out()`이 그 순간의 빈 문자열을
> **복사**한다. 이후 'data' 이벤트가 값을 갱신해도 복사본은 영영 초기값이다.

### Grounding
- Git Context: `hash:16e7eb9`
- Evidence: doc/raw/2026-09-12.md Case 2 — test/kanban-wait.test.js. 자식 프로세스의 종료 코드·종료 시각은 전부 정확했는데 out만 빈 문자열 → "CLI가 출력을 잃었다"로 오인해 디버깅 4런 소모
- Confidence: 5/5 (원인 직접 확인, 수정 후 전량 통과)

### Analysis
**실패 양상**:
- 살아있는 값을 받았다고 착각하게 만드는 문법 — 객체 그대로 쓰면(`w.out`) 게터가 **접근 시점에** 평가되는데, 구조 분해는 평가 시점을 선언으로 앞당긴다.
- 증상이 진짜 결함([[flush-before-exit]]의 Windows 파이프 유실)과 똑같아 보인다 — 두 원인이 겹치면 테스트 수정으로는 안 풀리고, CLI 수정으로는 안 풀리는 지옥이 된다.

**예방 체크리스트**:
1. 게터를 돌려주는 헬퍼는 **객체 속성 접근으로만** 소비한다 — 구조 분해 금지. (헬퍼 정의에 주석으로 함정 명시)
2. assert 메시지에 실측값을 심는다(`assert.ok(x.includes('…'), \`stdout=[${x}]\`)`) — 빈 값이 찍히는 순간 "캡처 버그"와 "출력 버그"가 갈린다.
3. 비동기 spawn 테스트는 'exit'이 아니라 **'close'** 후에 판정한다 — 'exit'은 파이프 잔여 데이터가 부모에게 전달되기 전에 발생한다.
4. "유실" 가설을 세울 땐 먼저 캡처 경로의 단위 실험(미니 재현)을 만들어 CLI와 테스트를 분리한다.

### Related Knowledge
- Patterns: [[flush-before-exit]] (진짜 유실 — 이 함정과 겹쳐 보였다) · [[write-validation-matches-read-semantics]] (쓰는 쪽과 읽는 쪽의 의미 어긋남이 조용히 빗나가는 계열)
- Concepts: [[agent-cli-contract]]
