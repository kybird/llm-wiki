---
status: active
version_context: "lib/wiki-search.js catch 설계(0.4.3~)"
tags: [error-handling, anti-pattern]
aliases: [조용한 실패, swallowed error, catch 삼킴, No semantic results 위장, silent failure, 실패가 정상 한계로 위장]
created: 2026-11-21
confidence: 5
---
# 조용한 실패가 정상 한계로 위장
catch에서 에러를 버리고 계속 진행하면 죽은 층이 스스로를 "결과 없음"으로 위장한다 — **실패와 정상 한계가 같은 출력을 내는 순간**, 진단은 감각이 아니라 복제 실험이 된다.

## 실패 모드
- 2026-09-09~22(12일): qmd 호출의 `ReferenceError: execFileSync is not defined`(import 누락)이 catch에 삼켜져 모든 질의가 `No semantic results.`로 출력 — 시맨틱 재현율 0인데 아무도 몰랐다.
- 색인 경로(compile index)는 살아 컬렉션이 계속 최신이었다 — "지식은 잘 쌓이는데 어느 세션도 못 찾는다"는 증상. 상태 갱신 시간(qmd status '14시간 전')마저 정상이라 "최신입니다"가 고장 반박으로 오용됐다.
- 위장 문자열이 정상 한계(미색인·코퍼스 부재·유사도 미달)와 소리가 같아 진단이 12일 걸렸다.

## 예방 체크리스트
- catch는 에러를 삼키지 않고 결과 봉투(`semantic.errors`)에 실어 사람용 출력에 드러낸다 — `(QMD error on <collection>: <message>)`.
- "결과 없음" 출력은 원인 분기(미색인·부재·임계값·**오류**)를 구분해 말한다.
- 복제 실험 게이트: 같은 인자를 도구 바깥에서 직접 실행해 정상 반환하면 **호출자 결함**(실측: 직접 83% ↔ llm-wiki 경유 시 빈 결과).
- grep/정확매칭을 항상 병렬([[always-merge-exact-matching]])이면 한 층이 죽어도 전체 침묵이 되지 않는다 — 이 사고에서 grep만 살아있었다.
- 회귀 테스트는 정상·고장 두 경로를 stub(QMD_CLI_PATH)으로 게이트 — import를 지우면 정상 경로 테스트가 즉시 실패(부정 게이트 실증).

## Related
- [[agent-cli-contract]](조용한 no-op 금지 — 같은 계열) · [[스킬-콘텐츠-역류]](조용한 되돌림) · [[qmd-optional-dependency]]

## Grounding (References)
- [[2026-09-22]] Case 1 — 12일 위장·복제 실험·부정 게이트 (hash 2722b01, 결함 도입 214e8c2·2026-09-09)
