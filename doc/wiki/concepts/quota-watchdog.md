---
status: active
version_context: "ZCode 2026-09 · llm-wiki work-loop v12+"
tags: [operations, concept]
aliases: [쿼터 워치독, quota watchdog, usage limit reached, 5 hour rolling window, 쿼터 소진, 밤샘 작업 자동 인계, 발사 프로브]
created: 2026-09-24
confidence: 4
---
# quota-watchdog

5시간 rolling 쿼터 소진으로 밤샘 무인 세션이 죽었을 때, 쿼터 복구 후 예약 자동화 발사가 제어
파일(TASK.md·heartbeat.txt)을 읽어 사람 개입 없이 resume 지침대로 인계하는 장치. 전파 단위는
**소비 레포 워크스페이스 각각**이고 work-loop 스킬(v12+)의 자가등록 부트스트랩이 운반한다.

## First Principles

1. **쿼터는 일일이 아니라 5시간 rolling window다.** 실제 로그 메시지(전문):
   ```
   Usage limit reached for 5 hour. Your limit will reset at 2026-09-23 17:56:45
   ```
   리셋 시각이 에러 메시지에 명시된다 → 죽은 뒤 최대 5시간 안에는 반드시 복구된다.
2. **transient 429는 이미 자동 재시도된다**(retryReason "rate_limited", retryAfterMs 관측
   7~13분). 재시도로 못 살리는 것은 윈도우 소진뿐 — 해당 턴은 영구 종료다.
3. **훅도 헤드리스 CLI도 없다.** 훅 이벤트에 쿼터 소진/복구가 없고 Stop은 정상 종료용;
   실행 파일은 ZCode.exe 단일. 재개 주체는 워크스페이스 Cron 자동화뿐이다.
4. **발사 성공 자체가 쿼터 생존 신호다(프로브 원리).** 쿼터 확인 API를 따로 호출하지 않는다 —
   소진 중엔 발사가 모델 호출에서 실패(비용 0)하고 15분마다 재발사, 복구 후 첫 성공 발사가
   인계를 수행한다.

## Details

- 상태 파일 2개(워크스페이스 루트 `.zcode/overnight/`): TASK.md(최상단 `status:
  inactive|running|done` 스위치 + `## resume 지침` = 인계 계약), heartbeat.txt(작업 세션이
  단계마다 `YYYY-MM-DD HH:MM:SS` 한 줄 append).
- 판정: 마지막 heartbeat가 20분 이상 = 사망 가능성. **stale 20분 > 발사 주기 15분** — 원래
  세션이 살아 있으면 heartbeat가 갱신되므로 절대 겹쳐 개입하지 않는다.
- 2차 방어: stale여도 곧장 인계하지 않고 heartbeat에 `CLAIM <시각>` append → sleep 600(10분)
  → 재확인. CLAIM보다 최신 줄이 생기면(사용자 아침 수동 재시작 포함) 인계 포기. 긴 단계의
  stale 오탐도 이중으로 걸러진다.
- 자가등록 부트스트랩(work-loop v12): 밤샘 실행 세션이 (a) 호스트에 예약 자동화 도구가 있고
  (b) 이 워크스페이스에 워치독이 미등록이면, 스킬 내장 템플릿(`<WS>` → 워크스페이스 루트 절대경로
  치환)으로 등록 + 제어 파일 스캐폴딩. 호스트에 도구가 없으면 섹션 전체 무동작(조건부로 무해).
- **전파 경로의 제약이 설계를 결정한다**: 자동화는 워크스페이스 귀속(정본 등록은 다른 레포를
  못 살린다), 등록은 호스트 도구라 CLI가 대신 못 한다, 소비 레포 AGENTS.md는 init이 못 고친다
  → 스킬 프롬프트가 유일한 채널이고 등록 도구를 가진 밤샘 세션 자신이 주체다. 세션이 즉시
  필요로 하는 규칙은 git 추적+상시 로드 표면(AGENTS.md)에도 심는다([[auto-update-copy-source]]
  의 사본 회귀와 무관하게 살아 있으려면).
- 대안 보완: "언제 끝나도 되는" 작업은 OffPeak 태스크(플랜 쿼터 미소모, 시작 시각은 서버
  결정)가 근본 해결 — 워치독은 "오늘 밤 안에" 끝내야 하는 작업용이다.

## Related

- [[auto-update-copy-source]] — 즉시 필요한 시작 규칙을 AGENTS.md에 심은 근거
- [[publish-channel-separation]] — v12 전파는 git 채널로, publish는 0.6.0까지 유보(raw Case 5)
- [[probing-side-effect-commands]] — 무해 탐색 호출 전제와 대비되는 "실패하는 발사" 프로브

## Grounding (References)

- [[2026-09-24]] Case 1 — 5h rolling window 실측·훅 불가·헤드리스 불가 (confidence 5)
- [[2026-09-24]] Case 2 — 프로브 원리·상태 규약·CLAIM 2차 방어 설계 (confidence 4)
- [[2026-09-24]] Case 4 — 전파 단위 교정: 소비 레포 자가등록 부트스트랩 (confidence 5)
- [[2026-09-24]] Case 5 — publish 유보 결정(스킬 단독 변경, 보드 카드로 추적)
- 도그푸드 인스턴스: 정본 워크스페이스 자동화 automation-7848ae37(2026-09-24 등록)은 **같은 날 밤
  해제** — 예정된 밤샘 작업이 없는 상태에선 15분 no-op 발사가 순수 소음이다(raw Case 6). 등록
  주체는 이식 시점이 아니라 밤샘 작업 시작 시점(work-loop v12 부트스트랩). `skills/work-loop/SKILL.md`
  v12는 계속 소비 레포 전파 중
