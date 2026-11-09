---
status: active
version_context: "llm-wiki HEAD+(AGENTS.md 관리 섹션) / 0.6.0–0.9.0(시드 동결 — 관리 섹션 없음)"
tags: [operations, concept, deployment]
aliases: [지시 전파, 전파 채널, managed section, 관리 섹션, agentsMdSection, seed-time freeze, 시드 동결]
created: 2026-11-09
confidence: 5
---
# instruct-propagation

패키지가 소비 레포의 에이전트에게 **지시(계약 지식)**를 전달하는 채널 설계. 핵심 명제:
**지식이 존재하는 것과 도달하는 것은 별개다** — 전파는 자동 갱신 차량에 태운 산출물만 된다.

## First Principles

1. **자동 접점은 하나뿐이다.** npm update → 다음 아무 명령 → `maybeAutoUpdate` → `syncCopies`.
   이 차량에 안 탄 산출물은 사람이 손으로 갱신하기 전까지 영구 동결이다.
2. **매 세션 읽는 면이 최우선 채널.** 스킬은 관련될 때만 로드되지만 AGENTS.md는 매 세션
   항상 로드된다(plan.md 6.4) — 계약 지식의 최적 자리이자, 동결되면 가장 크게 썩는 자리.
3. **저자 1명·블록 통째 교체는 합성이 아니다.** 여러 소스를 문장 수준으로 합성하는 배관만
   금지된다(6.3) — llm-wiki 단일 저자가 마커 블록을 통째로 갈아끼우는 건 스킬 사본과 같은
   성격이라 산문 충돌의 여지가 없다.
4. **append는 덮어쓰기가 아니다.** "사용자가 손댄 파일은 덮어쓰지 않는다"(6.1)의 문언·정신은
   파괴를 금지한다 — 기존 바이트를 전부 보존하는 추가는 채택(adopt)으로 양립한다.

## Details

- **AGENTS.md 관리 섹션**(2026-11-09, `lib/init.js` syncAgentsSection): `llm-wiki:section`
  start/end 마커로 감싼 블록만 패키지가 갱신. 상태 4형태 — 마커 쌍+최신=ok(무쓰기) ·
  마커 쌍+낡음=치환(마커 밖 불가침) · 마커 없음=append 채택(구판 시드·손본 구분 안 함) ·
  config `agentsMdSection: false`=스킵. 사용자가 섹션을 지우면 다음 버전에서 재append —
  영구 거부는 config뿐이다(재주입과 싸우지 않는다).
- 보고 계약: auto-update 라인 `· AGENTS.md 섹션 주입 N`, init의 `✓` 메시지 — [[agent-cli-contract]]의
  조용한 no-op 금지를 상속.
- 부채널: 스킬 프롬프트의 계약 한 줄(wiki-log·wiki-search v3 — 레이아웃 계약)은 이미 자동
  동기화되는 차량에 태운 공짜 보강. CLI stdout(재등록 안내 등)은 명령을 돌린 순간의 진실 전달.
- **도달 못하는 면(한계, 명시)**: 손으로 쓴 AGENTS.md는 append 채택은 되지만 기존 내용과의
  중복 정리는 사람 몫. CLAUDE.md/GEMINI.md 류는 애초에 시드 대상이 아니다.
- 계기 사고(2026-11-09): 0.6.0 doc→docs 전환 계약이 소비 레포 AGENTS.md에 전파되지 않아
  배포·수리 에이전트가 "기대 경로 = doc\wiki"로 오판, "자가치유가 발동하지 않는다"는
  그릇된 진단을 내렸다(등록부 자가치유는 정상 탑재돼 있었다 — 썩은 건 에이전트의 지식).
  같은 클래스: 운영 에이전트의 세션 메모리 인덱스가 본문과 어긋나 반대를 가르치던 것 —
  **본문/인덱스 이중 정본은 하나만 고치면 거짓을 가르친다**.

## Related

- [[layout-migration]] — 이 개념이 태어나게 한 계약 변화의 본체
- [[auto-update-copy-source]] — 자동 접점(npm update → syncCopies)의 원형
- [[agent-cli-contract]] — 조용한 no-op 금지·보고 계약의 뿌리

## Grounding (References)

- [[2026-11-09]] Case 2 — 전파 갭 사고 3단 원인 사슬(인덱스 오염·의식 스킵·시드 동결) + 관리
  섹션 설계·구현·테스트 7종 (confidence 5)
