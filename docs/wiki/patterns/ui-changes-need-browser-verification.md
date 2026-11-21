---
title: ui-changes-need-browser-verification
description: 임베디드 페이지 JS의 런타임 오류는 노드 테스트가 못 잡는다 — UI를 손대는 커밋의 게이트는 브라우저 실측이다.
status: active
version_context: "llm-wiki monitor(임베디드 HTML+JS), Node --test"
tags: [testing, ui, pattern]
aliases: [페이지 JS 테스트 공백, 브라우저 실측, 클라이언트 JS 검증, client JS]
created: 2026-09-16
confidence: 5
---
# ui-changes-need-browser-verification

> 서버가 내주는 페이지(임베디드 HTML+JS)를 고치면 노드 테스트는 서버 API와 페이지
> **문자열**까지만 검증한다 — 페이지 JS의 런타임 오류는 브라우저에서만 잡힌다.

## The Rule

페이지 JS를 바꾸는 커밋의 완료 근거는 브라우저 실측이다: (1) 실제 브라우저에서
로드 (2) 렌더 결과 확인 — DOM 스냅샷·클릭·Esc 등 상호작용까지 (3) 이상 시
요약 줄이 아닌 콘솔 원문 확인. 노드 테스트 통과는 게이트가 아니다.

## Why it works

페이지 스크립트는 서버 입장에선 문자열이라 문법 오류조차 서버 기동을 막지
않는다. 런타임 오류는 더 교묘하다 — 폴링 tick의 catch가 "연결 끊김"으로
뭉뚱그려 **서버 결함으로 위장**한다. 실측 사고: sed 일괄 치환이 종결 컬럼 맵
변수 `t`를 `c`로 바꿔 `c is not defined` ReferenceError가 났는데, 노드 테스트는
55/55 통과(페이지 문자열 골격만 검증), 브라우저(IAB) 실측이 요약 줄 이상으로
30초 안에 포착했다.

## Trade-offs

- 브라우저 실측은 사람/에이전트 손이 든다 ↔ 페이지 회귀를 사용자가 직접 발견하는
  비용. headless 자동화 배관은 아직 금지(작업 원칙 1 "배관을 먼저 깔지 마라") —
  실측 루틴이 무거워지는 시점에 다시 판단한다.
- 짝 규칙: 일괄 치환(sed)은 스코프를 모른다 — 동일 패턴처럼 보이는 네 곳 중 하나가
  다른 파라미터 이름을 쓰는 사고. 치환 후엔 변경 라인 전체를 눈으로 확인한다.

## Anti-Pattern

노드 테스트에 페이지 문자열 포함 여부(`page.includes('modal-title')`)만 확인하고
끝내기 — 골격은 있어도 그 안의 JS가 죽어 있는 걸 못 본다.

## Related

- [[agent-cli-contract]] — 오류가 다른 계층의 결함으로 위장하는 계열
- [[destructuring-live-getters]] — "테스트가 통과했다"가 증거가 아닌 경우
- [[kill-the-tree-not-the-wrapper]] — 옛 서버가 옛 페이지를 계속 줄 때 이 규칙과 겹침

## 추가 규칙 — 임베디드 클라이언트 스크립트엔 백틱 금지 (2026-10-15)

서버 파일 안 큰 템플릿 리터럴에 내장된 클라이언트 JS(예: `lib/kanban-monitor.js`)를 수정할 때 백틱을 넣으면 외부 리터럴이 거기서 닫혀 `SyntaxError: Unexpected identifier` — **bin이 로드 단계에서 죽는다**. 신호: 관련 없어 보이는 테스트 다수 동시 실패 = 로드 실패로 읽는다. 내장 스크립트에는 문자열 연결만 쓴다(실측: 한 줄 교체로 12개 테스트 동시 적화 → 연결로 즉시 133/133 복구).

## Grounding (References)

- Git Context: `hash:fac5062` (수습 포함 커밋)
- Evidence: doc/raw/2026-09-16.md Case 5 — 페이지 요약 줄 `연결 끊김 — 서버가 죽었거나 보드를 읽을 수 없다 (c is not defined)`, 실제 ReferenceError `c is not defined`
- [[2026-10-15]] Case 2 — 임베디드 스크립트 백틱 → 외부 템플릿 조기 종료, bin 로드 사망(lib/kanban-monitor.js:607, 문자열 연결 수습 133/133)
