---
title: kill-the-tree-not-the-wrapper
description: Windows에선 래퍼(셸·작업)만 죽여도 node 자식이 살아 포트를 계속 잡는다 — 정지 피드백을 믿지 말고 포트를 확인한다.
status: active
version_context: "Windows 10 (10.0.26200), Git Bash, ZCode 백그라운드 작업"
tags: [windows, process, pattern]
aliases: [고아 프로세스, 포트 점유, EADDRINUSE 대응, taskkill, 작업 정지 잔존]
created: 2026-09-16
confidence: 5
---
# kill-the-tree-not-the-wrapper

> 백그라운드로 띄운 서버를 "작업 정지"로 멈춰도 Windows에서는 래퍼 셸만 죽고 node
> 자식이 살아남아 포트를 계속 점유한다. 정지 성공 피드백을 믿지 말고 **재기동 전에
> 포트를 확인**한다.

## The Rule

서버 재기동 직전 순서:

```bash
netstat -ano | grep ":4747" | grep LISTEN   # 점유자 PID 확인
tasklist //FI "PID eq <PID>"                 # node.exe인지 확인
taskkill //PID <PID> //F                     # 자식까지 강제
```

## Why it works

Windows에는 POSIX 프로세스 그룹 시그널이 없어 부모 사망이 자식에게 전파되지
않는다. 그래서 "정지 완료" 피드백과 실제 생존이 어긋난다 — 죽었다고 믿은 서버가
옛 코드로 계속 응답하고, 사용자는 옛 화면을 보며 원인을 코드에서 찾는다(이 날
모니터 사용자가 옛 화면을 본 원인). 다행히 같은 포트 재기동은 EADDRINUSE로 즉시
실패하므로, `server.on('error')`에서 이름 붙여 안내하면 발견이 빠르다:
`✗ 포트 4747가 이미 쓰이고 있다 — --port <다른 번호>로 바꿔라.`

## Trade-offs

- 항상 netstat 확인은 번거롭다 ↔ 포트 충돌 디버깅 비용. 재기동 직전 1회면 족하다.
- 도구가 언젠가 프로세스 트리를 죽여주면 이 규칙은 불필요 — 도구를 믿지 말고
  실측. (반대 방향 함정도 있다: 정지가 자식까지 죽였다고 방심하면 이 규칙 자체가
  썩는다 — 확인 비용이 1줄이므로 그냥 확인한다.)

## Anti-Pattern

"정지 완료" 피드백만 보고 재기동 — 새 서버만 EADDRINUSE로 죽고 옛 서버는 계속
산다. 죽은 서버의 페이지가 마지막 데이터를 보여주는 것(폴링 실패 = 화면 유지)과
겹쳐 "새 코드가 안 먹힌다"는 오독으로 이어진다.

## Related

- [[flush-before-exit]]와 같은 Windows 프로세스 경계 계열
- [[agent-cli-contract]] — 오류 메시지가 다음 행동을 지시하는 계열
- [[ui-changes-need-browser-verification]] — "옛 서버 화면" 오독의 짝

## Grounding (References)

- Git Context: `hash:d709748` 작업 중 실측
- Evidence: doc/raw/2026-09-16.md Case 4 — 새 monitor 서버가 `✗ 포트 4747가 이미 쓰이고 있다 — --port <다른 번호>로 바꿔라.`와 함께 종료 1, netstat에 node.exe 잔존
