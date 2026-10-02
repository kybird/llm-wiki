---
title: Question Timing Follows Answerability
description: 질문 타이밍은 "누가 대답할 수 있는가"가 결정한다 — 사람 있으면 시작 전, 무인이면 벽에서 park.
status: active
created: 2026-08-30
tags: [pattern]
aliases: [질문 타이밍, handoff 질문, 시작 전 질문, pre-work question]
---

# Question Timing Follows Answerability

> "보통 에이전트는 시작 전에 묻는데, 이건 끝나고 묻는다" — 둘 다 맞다. 질문 타이밍은
> 세션 모드가 아니라 **답변 가능 여부**의 함수다.

### Grounding
- Git Context: `hash:7c03105`
- Evidence: doc/raw/2026-08-30.md Case 2
- Confidence: 4/5

### Analysis
- 사람이 있는 세션(기획): 시작 전에 묻는다 — 답 하나로 카드 자체가 달라질 수 있어 제일 싸다.
- 사람이 없지만 비동기 답변 가능: 카드 생성 즉시 `handoff --question`으로 대기 → 답이
  오면 `resume --note "답: …"` → work-loop가 집는다.
- 무인 루프: 시작 전에 물어볼 상대가 없다(plan.md 2.1 — 승인 대기는 오프피크 낭비).
  벽에 닿은 순간 park하고 다음 카드 — 질문은 밤새 축적돼 아침에 일괄 답변된다.
- handoff 질문은 "끝나고 물어보기"가 아니라 "판정을 사람에게 넘기기"다.
- 대기 큐는 제목만 나열하지 않는다 — Handoff 섹션의 마지막 QUESTION을
  board/report/HTML/영상이 함께 노출한다(아침의 사람이 한 화면으로 읽는다).

### Related Knowledge
- Patterns: [[always-merge-exact-matching]]
