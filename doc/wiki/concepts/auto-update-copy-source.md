---
status: active
version_context: "llm-wiki auto-update(accbb2b) · 정본 0.5.1/글로벌 0.4.2 실측(2026-09-24)"
tags: [distribution, concept]
aliases: [사본 핑퐁, skill copy ping-pong, modified since read, 사본 재동기화, skill-version 회귀, auto-update 사본 동기화, 커밋 훅 사본 회귀]
created: 2026-09-24
confidence: 5
---
# auto-update-copy-source

auto-update의 사본 동기화 소스는 **실행 중인 바이너리의 패키지 루트**다. 정본 레포(llm-wiki)에는
두 바이너리가 상주하므로 — `node bin/llm-wiki.js`(정본 `skills/`)와 글로벌 `llm-wiki`(npm
설치본) — 번갈아 실행할 때마다 `.agents/`·`.claude/` 사본이 서로 다른 버전으로 재동기화된다
(핑퐁).

## First Principles

- 버전 스탬프(~/.llm-wiki/auto-update)는 마지막 동기화 버전 하나만 기록한다 → 두 바이너리가
  서로를 항상 "업데이트 필요"로 본다.
- pre-commit 훅이 글로벌 `llm-wiki`를 돌린다 → **커밋 한 번마다 사본이 글로벌 설치 버전으로
  회귀**한다(실측: work-loop v11↔v8, 2026-09-24).
- git 정본 `skills/`는 절대 덮어쓰이지 않는다(git이 지킨다). 흔들리는 것은 세션이 실제 읽는
  로컬 사본뿐이다.

## Details

- 증상: 세션 도중 스킬 파일 Edit가 "File has been modified since read"로 실패; 세션 첫 읽기가
  낡은 버전을 보고 편집 대상 검증도 어긋난다.
- 개발 규칙: 스킬 편집은 정본 `skills/`에만 하고 skill-version을 bump; 사본은 정본에서 cp로
  재동기화(커밋 훅 직후마다 필요). 사본의 안정적 최신화는 publish + npm update로 글로벌을
  끌어올리면 핑퐁이 소멸하며 온다.
- 세션이 즉시 필요로 하는 규칙은 사본이 아니라 git 추적 + 매 세션 상시 로드 표면(AGENTS.md)에
  심는다 — [[quota-watchdog]] 시작 규칙을 AGENTS.md에 둔 근거.

## Related

- [[quota-watchdog]] — 사본 회귀와 무관하게 살아 있어야 하는 규칙의 배치 원칙 사례

## Grounding (References)

- [[2026-09-24]] Case 3 — skill-version v8→v10→v8 추이 실측, npm ls -g = 0.4.2 (confidence 5)
- lib/auto-update.js — 사본 동기화 구현
