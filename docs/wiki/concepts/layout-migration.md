---
status: active
version_context: "llm-wiki 0.8.0(HEAD+ — qmd 경로 자가치유 탑재, 미발행) / 0.6.0–0.8.0(발행판은 드리프트 무완화)"
tags: [operations, concept]
aliases: [docs 전환, doc→docs, layout transition, 레이아웃 전환, 자동 마이그레이션, migrateDocDir, migrate-doc-dir]
created: 2026-10-02
confidence: 5
---
# layout-migration

문서 루트를 `doc/`에서 `docs/`로 전환(0.6.0)하고, 기존 레포는 **첫 llm-wiki 명령에서 자동으로
git mv**되는 마이그레이션 장치. 레거시 `doc/`은 폴백으로 계속 읽혀 이중 레이아웃 어느 쪽이든 동작한다.

## First Principles

1. **판정 신호는 wiki 하위 존재 하나뿐이다.** `doc/wiki` 존재 + `docs/` 부재만 마이그레이션
   대상 — init 흔적 없는 일반 doc/ 폴더를 건드리지 않는 안전장치이자 findDocRoot 해석과
   같은 축([[auto-update-copy-source]]의 init 흔적 판정과도 공유).
2. **마커 파일이 없어도 1회성이 보장된다.** 이동 성공 자체가 완료 상태(docs/wiki가 생김)라
   다음 명령의 판정이 바뀐다 — 상태 저장이 아니라 상태 자체가 증거.
3. **리졸버는 순수하게, 발화는 진입점에서.** findDocRoot는 매 명령 여러 번 불리므로 사이드
   이펙트 없이 유지하고, 마이그레이션 발화는 bin 진입점 단 한 곳에 둔다.
4. **요약 출력은 배너 선례로 허용된다.** wait·monitor의 stdout 첫 줄 계약(이벤트 한 줄·URL)은
   깨면 안 되므로 두 명령은 아예 트리거 제외 — [[agent-cli-contract]]의 제외 목록 재적용.

## Details

- 트리거: auto-update와 같은 명령 목록(search·compile·lint·skills·board·card·pick…resume).
  옵트아웃 `llm-wiki.config.json { "migrateDocDir": false }` — 그 레포는 레거시 doc/ 폴백으로
  계속 동작하고 출력도 없다(명시적 선택에 잔소리를 붙이지 않음).
- 이동: git mv 우선(rename 스테이징 — 커밋은 사용자 몫), doc/이 전부 untracked면
  fs.renameSync 폴백. EBUSY·EPERM(모니터·에디터가 doc/을 열어둠)은 한 줄 안내 후 **연기** —
  다음 명령이 재시도하고 명령은 절대 막지 않는다.
- `docs/`가 이미 있으면(관련 없는 폴더 포함) 덮지 않고 보류 안내 — 조용히 포기하면 영영
  전환 안 되므로 이것만은 매번 한 줄로 말한다.
- init 경유: 새 init은 docs/ 골격, 레거시 레포의 init 재실행은 마이그레이션을 먼저 발화시킨 뒤
  docs/를 상대한다. 옵트아웃 레포만 doc/ 골격 유지. LLM_WIKI_ROOT는 basename 무관으로 루트
  경로 자체를 골격 위치로 사용(기존엔 doc/ 하드코딩).
- auto-update의 init 흔적 판정도 docs/·doc/ 양쪽을 본다 — docs/만 보던 상태로 두면 전환 레포의
  사본 자동 동기화가 조용히 스킵되는 행위 결함이 된다.
- qmd 사용 레포: 컬렉션 이름은 그대로라 syncQmd가 "이미 등록됨"으로 건너뛰고 **경로만 썩는다**
  (조용한 실패 — 2026-11-07 소비 레포 실측으로 구조 확정). 완화는 **자동 마이그레이션 순간에 1회
  발화하는 재등록 안내 한 줄뿐**이라 구조적 허점이 있다: 수동 마이그레이션(git mv 직접)은 안내가
  발화할 기회 자체가 없고, 안내를 놓치면 이후 어떤 명령도 재검사하지 않는다. TTSTextViewer가
  2026-10-29 수동 전환 후 9일간 `Indexed: 0 new, 0 updated, 0 unchanged, 0 removed` ·
  `✓ QMD search index synced.` 를 출력하며 의미검색이 누락된 채 방치됐다(카드 "QMD 컬렉션 경로
  드리프트 자가치유" — syncQmd가 `collection show`로 경로를 검증·업서트하는 계통 수정).
  수동 수습 절차: `qmd collection remove <name>-wiki <name>-wiki-raw` → `llm-wiki compile index`.
  수동 전환의 전형적 흔적: `doc/`에 **미추적 파일만** 남는다(자동 `git mv doc docs`는 디렉터리
  rename이라 미추적 파일도 통째 이동) — 잔해가 있으면 안내 없이 넘어갔다고 읽으면 된다.
  **자가치유 탑재(2026-11-08, HEAD+)**: `compile index`의 syncQmd가 `collection show`로 등록
  경로를 검증해 드리프트면 remove+add 업서트한다(수동·자동 이동 모두 다음 compile 1회로
  치유), 0건 색인은 ⚠로 보고하며, 자동 마이그레이션도 재등록을 수행한다 — 발행판
  (0.6.0~0.8.0)에는 아직 없다.

## Related

- [[auto-update-copy-source]] — "npm update만 하면 된다" 같은 집안 철학의 레이아웃 확장
- [[agent-cli-contract]] — wait·monitor 제외의 계약 근거
- [[qmd-optional-dependency]] — 재등록 절차가 필요한 이유(이름 기반 등록·경로 썩음)

## Grounding (References)

- [[2026-10-02]] Case 1 — 설계 결정 3축(트리거 게이트·판정 신호·책임 분리) + 대안 기각 (confidence 5)
- [[2026-10-02]] Case 4 — 도그푸드 실측: done 명령 1발이 정본 레포 자신을 전환(92 rename 스테이징),
  보드 연속성·qmd 재등록 완주. 소비 레포 10곳이 겪을 경험의 선견 (confidence 5)
- [[2026-11-07]] Case 1 — 1회성 안내의 구조적 허점 실측: 수동 마이그레이션 경로는 안내 발화
  기회 자체가 없었다(9일간 조용한 실패). 귀속 정정 2건 — "안내가 묻혔다" 아님, "스킬 템플릿
  원본"도 부재(소비 레포 scripts/compile.js는 lib의 원조 레거시) (confidence 5)
- [[2026-11-08]] Case 1 — 자가치유 구현(B 업서트·C 0건 경고·A 마이그레이션 재등록 수행) +
  서브에이전트 검수 P2 6건 반영(공백 이름 파싱·감지 경계·공허 통과 차단 포함) (confidence 5)
