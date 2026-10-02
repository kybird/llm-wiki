---
title: TodoWrite 캡처 조사
status: done
ordinal: 3000
created: 2026-08-29
---

## Goal
<!-- kanban:goal:begin -->
Claude Code 등 하네스에서 네이티브 todo를 훅으로 가로챌 수 있는지 사실 확인(미결 #4)
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [x] #1 가로챔 가능 여부와 방법이 문서로 기록된다
<!-- kanban:ac:end -->

## Plan

## Notes
- 2026-09-09T19:52-07:00 — 조사 결과: 캡처 가능. ① 이 세션 실측 — PreToolUse 훅이 도구 이름별 발화(example-plugin이 매 Bash/Write 호출에 주입 확인). ② 공식 샘플 훅 smoke test가 stdin 계약 명시: {hook_event_name, tool_name, tool_input} — 인자 전체 수신. ③ Claude Code 커뮤니티 실측(#6975, 50+테스트): matcher 'TodoWrite' 발화, parameters.todos 수신(비공식). 방법 = PreToolUse + matcher TodoWrite + process 훅이 stdin을 파일 append. 한계: ZCode에서 TodoWrite 직접 발화는 미들세션 프로브로 부재(설정 훅은 세션 시작 시 로드 추정) — 새 세션 프로브로만 확증 가능. 전체 기록: doc/raw/2026-09-09.md Case 4

## Handoff

## Result
- 2026-09-09T19:52-07:00 — 가로챔 가능 판정 + 방법 문서화 완료. 무엇을 바꿨나: doc/raw/2026-09-09.md Case 4에 조사 결과 기록(PreToolUse + matcher TodoWrite + process 훅이 stdin의 tool_input.todos를 파일 append). 무엇으로 검증했나: ① 이 세션에서 example-plugin PreToolUse 훅이 매 Bash/Write 호출에 실제 발화하는 것을 관측 ② 공식 샘플 훅 pre-tool-use.mjs의 smoke test 주석으로 stdin 페이로드 계약 확인 ③ Claude Code 커뮤니티 실측 이슈 anthropics/claude-code#6975(50+ 테스트)로 TodoWrite 매처 발화·todos 수신 확인. ZCode 직접 발화는 미들세션 프로브로 확인 불가(설정 훅 세션 시작 로드 추정) — 한계로 명시
