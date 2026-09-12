---
title: agent-cli-contract
description: 이 CLI의 1차 사용자는 종료 코드와 출력으로만 판단하는 에이전트다 — 성공 보고는 실제 변경에 묶인다.
status: active
created: 2026-09-10
tags: [concept]
aliases: [CLI 계약, silent no-op, 무조건 성공 보고, 모르는 플래그 거부, unknown flag rejection, validateFlags]
---

# agent-cli-contract

> 카드를 쓰는 CLI(개선계획 §3.2 "에이전트는 이 명령들로만 고친다")의 계약: 모르는
> 플래그·값 없는 플래그·바꿀 것 없는 호출은 **이름을 말하고 실패**하며, 성공 문구는
> **실제로 무엇이 바뀌었는지** 말한다. 사람 눈의 편의가 아니라 종료 코드를 읽는
> 기계의 계약이다.

### Grounding
- Git Context: `hash:cc0f4b1` (결함 시점) → 2026-09-10 수정 커밋
- Evidence: doc/raw/2026-09-10.md Case 1 — `Card edited: D:\...\카드.md` 가 종료 코드 0과 함께 나오고 파일은 무변화였다(sugarScan 실사용 접수). lib/kanban-cmd.js validateFlags
- 선행 조각: doc/raw/2026-09-09.md fcd1f4b — parseArgs의 값 없는 플래그 `true` 삼킴 방지(같은 벽의 이전 조각)
- 확장(2026-09-12): `hash:16e7eb9` — doc/raw/2026-09-12.md Case 3 — wait를 auto-update 트리거에서 제외. stdout이 계약인 명령(wait: 0=이벤트 한 줄, 2=침묵)에서 배너 한 줄이 두 계약을 동시에 깼다
- Confidence: 5/5

### Analysis
- 규칙 3개: (1) 모르는 플래그 → 이름 나열 후 실패 (2) 값 필수 플래그의 값 부재(반복
  플래그 배열 원소의 `true` 포함) → 실패 (3) 변경 플래그 자체가 없으면 "바꿀 것이
  지정되지 않았다"로 실패. 성공 출력은 변경 토큰을 붙인다 —
  `Card edited: <경로> (note +1, ac +2, depends +선행 카드)`.
- **멱등 재시도와의 구분이 핵심**: "플래그가 없음"은 실패지만 "값이 같아서 결과적으로
  안 바뀜"은 성공이다(종료 코드 0 + `변경 없음 — 이미 그 상태다`, 파일 재작성 없음).
  후자를 실패로 만들면 재시도가 깨진다.
- 규칙은 명령 전체에 균일해야 한다 — 어디는 엄격하고 어디는 관대하면 사용자(사람과
  에이전트 둘 다)가 규칙을 못 배운다. card new/edit이 공용 validateFlags로 같은
  명세 검증을 공유한다.
- **stdout이 계약인 명령에서는 부가 출력도 예외가 아니다**(2026-09-12, wait): 종료 코드가
  출력과 함께 계약을 이루는 명령의 stdout에는 장식을 섞지 않는다. wait를 auto-update
  트리거에 넣었더니 배너 한 줄이 "타임아웃=완전 침묵" 계약과 `--json` 파싱(JSON.parse
  대상 stdout)을 동시에 깼다. 수습은 출력 억제가 아니라 **트리거 제외** — 관측 전용
  명령은 동기화를 몰고 올 이유가 없고, 갱신은 능동 명령(pick/done/board)이 매 사이클
  발동시킨다. 계약 있는 출력의 전달 자체는 [[flush-before-exit]]이 지킨다.
- **Anti-Pattern**: 무엇이 바뀌었는가와 성공했는가의 분리 — 아는 키만 꺼내 쓰고 모르는
  키는 무시한 채 조건 없이 writeCard + 성공 문구. 지식 그래프의 "근거 없는 검증 기록"
  경고([[always-merge-exact-matching]]의 조기 분기)가 CLI 계층에서 난 모양이다.
- 잔여 갭(2026-09-10 보고, 미처리): `pick --claime` 같은 오타가 unnamed-agent로
  조용히 귀속된다 — card new/edit과 구조가 달라 이번 범위 밖이었음.

### Related Knowledge
- Patterns: [[always-merge-exact-matching]] · [[write-validation-matches-read-semantics]] · [[flush-before-exit]]
- **Anti-Patterns**: [[destructuring-live-getters]]
