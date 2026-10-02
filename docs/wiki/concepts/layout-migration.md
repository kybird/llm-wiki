---
status: active
version_context: "llm-wiki 0.6.0 (미발행 — 0.6.0 publish와 함께 소비 레포 전파)"
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
  (조용한 실패). 마이그레이션이 index.yml의 구 경로를 발견하면 재등록 안내 한 줄을 출력한다 —
  수동 절차: `qmd collection remove <name>-wiki <name>-wiki-raw` → `llm-wiki compile index`.

## Related

- [[auto-update-copy-source]] — "npm update만 하면 된다" 같은 집안 철학의 레이아웃 확장
- [[agent-cli-contract]] — wait·monitor 제외의 계약 근거
- [[qmd-optional-dependency]] — 재등록 절차가 필요한 이유(이름 기반 등록·경로 썩음)

## Grounding (References)

- [[2026-10-02]] Case 1 — 설계 결정 3축(트리거 게이트·판정 신호·책임 분리) + 대안 기각 (confidence 5)
- [[2026-10-02]] Case 4 — 도그푸드 실측: done 명령 1발이 정본 레포 자신을 전환(92 rename 스테이징),
  보드 연속성·qmd 재등록 완주. 소비 레포 10곳이 겪을 경험의 선견 (confidence 5)
