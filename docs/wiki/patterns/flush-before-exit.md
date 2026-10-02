---
title: Flush Before Exit
description: 종료가 출력을 앞지르지 않게 한다 — Windows 파이프 stdout은 비동기라 쓰기 완료 콜백에서 exit해야 그 한 줄이 유실되지 않는다.
status: active
created: 2026-09-12
tags: [pattern]
aliases: [stdout 유실, 파이프 출력 잘림, process.exit truncation, Windows pipe async stdout, 쓰기 완료 콜백 종료, flush before process.exit]
---

# Flush Before Exit

> 파이프로 연결된 stdout에 찍은 뒤 곧바로 프로세스를 끝내는 CLI에서, 그 한 줄이
> 호출자에게 **가끔 도착하지 않는다**. 종료는 쓰기 완료 뒤에.

### Grounding
- Git Context: `hash:16e7eb9`
- Evidence: doc/raw/2026-09-12.md Case 1 — bash 파이프 프로브에서 배너(t≈0 출력)가 3초 뒤 타임아웃 exit와 함께 **전량 소실**(cat이 받은 파일이 빈 문자열). 재현은 로드·타이밍 의존으로 불안정(단독 재현에서는 도착하기도 함)
- Confidence: 4/5 (유실 실측 확실, 정확한 소실 조건은 미특정 — Node 공식 문서의 플랫폼별 명세가 근거)

### Analysis
- **규칙**: 종료 코드가 계약인 명령의 마지막 출력은 `process.stdout.write(줄, () => process.exit(코드))`로 — 쓰기 완료 콜백에서 종료한다. 콜백 미도차를 대비해 `process.exitCode`를 선심입해 둔다(자연 종료 시에도 코드가 옳게 나간다).
- **왜**: Node 문서 — stdout/stderr의 동기·비동기는 연결 대상과 플랫폼으로 갈린다. 파일=동기(Windows·POSIX), TTY=POSIX만 동기, **파이프=POSIX 동기 / Windows 비동기**. 비동기 쓰기는 이벤트 루프·스레드풀이 돌아야 완료되는데, `process.exit`는 큐에 있는 일을 기다리지 않는다.
- **왜 잡기 어려웠나**: TTY나 파일 리다이렉트로 직접 확인하면 동기 쓰기라 재현이 안 되고, 파이프에서도 매번 유실되지 않아(불안정 재현) "CLI 버그"와 "테스트 버그"(같은 날의 [[destructuring-live-getters]])가 겹쳐 보였다. assert 메시지에 실측값을 심는 습관이 분리의 열쇠.
- **계열**: [[agent-cli-contract]]의 형제 조항 — 계약(종료 코드·출력)은 유실 없이 전달돼야 의미가 있다. doc/raw/2026-09-09.md Case 5(process.exit가 finally를 우회해 락 누출)와 같은 뿌리: process.exit는 대기하지 않는다.
- **적용**: lib/kanban-wait.js finish() — 대기류 명령은 타이머/워치 콜백에서 출력하고 끝나는 경로라 이 패턴의 상수 노출 대상.

### Related Knowledge
- Concepts: [[agent-cli-contract]]
- **Anti-Patterns**: [[destructuring-live-getters]] (이 패턴이 없어도 출력이 도착했다고 착각하게 만드는 테스트 함정)
