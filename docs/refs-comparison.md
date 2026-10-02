# 참고 구현체 비교 — refs/ 6종

> 2026-08-29 정리. `refs/` 하위에 shallow clone으로 가져온 뒤 코드를 읽고 비교한 기록.
> `refs/`는 .gitignore에 넣었다(외부 저장소를 gitlink로 커밋하지 않기 위함).
> 아래 사실은 각 저장소의 다음 커밋 시점 기준이다:

| 폴더 | 저장소 | ★ | 커밋 | 라이선스 |
|---|---|---|---|---|
| `refs/backlog-md` | MrLesk/Backlog.md | 6.6k | 40482ca (08-26) | MIT |
| `refs/vibe-kanban` | BloopAI/vibe-kanban | 27.9k | 4deb7ec (04-24, **sunset 공지**) | Apache-2.0 |
| `refs/karpathy-llm-wiki` | Astro-Han/karpathy-llm-wiki | 2.1k | eafcc77 (07-24) | MIT |
| `refs/basic-memory` | basicmachines-co/basic-memory | 3.8k | 8cb8d33 (08-28) | AGPL |
| `refs/kanban-md` | antopolskiy/kanban-md | 0.2k | 6f01678 (08-24) | MIT |
| `refs/llm-wiki-gist` | Karpathy 원조 gist | — | ac46de1 (04-04) | 없음 |

---

## 1. 한눈 비교

| | 정본 | 칸반 | 형태 | 에이전트 통합 | 검색 |
|---|---|---|---|---|---|
| **llm-wiki (우리)** | 레포의 md | 계획 중 | Node CLI + 4 스킬 | 스킬 = LLM 프롬프트 | grep → QMD(선택) |
| Backlog.md | 레포의 md (`backlog/`) | **있음** (TUI+웹+md export) | Bun/TS CLI 하나에 4개 표면 | AGENTS.md 넛지 + CLI 가이드 + MCP(부차) | fuzzy(fuse.js) |
| kanban-md | 레포의 md (`kanban/`) | **있음** (TUI+CLI) | Go 단일 바이너리 | 스킬 프롬프트 + `pick --claim` | grep 수준 |
| vibe-kanban | **SQLite/Postgres** | **있음** (웹) | Rust 서버 + React, ~30 crate | 서버가 에이전트 CLI를 spawn (worktree별) | DB 쿼리 |
| karpathy-llm-wiki | 레포의 md (`raw/`,`wiki/`) | 없음 | **스킬 1개 + 검증 스크립트 1개**뿐 | SKILL.md 4 오퍼레이션 | index.md → grep (RAG 명시적 거부) |
| basic-memory | 레포의 md (DB는 **유도 인덱스**) | 없음 (Task 노트 관례만) | Python MCP+API+CLI+watcher | MCP 도구 17종 + 스킬 14종 | FTS/시맨틱/하이브리드 |
| 원조 gist | md 3층 (raw/wiki/schema) | 없음 | 없음 — 아이디어 파일 | 복붙해서 쓰는 프롬프트 | index.md → grep, 나중에 qmd |

**철학 검증**: md-파일-정본 진영(Backlog.md, kanban-md, karpathy-llm-wiki)은 모두 건재하고 성장 중인 반면, DB-정본으로 갔던 vibe-kanban(★ 최다)은 9개월간 마이그레이션 80+개를 쌓고 2026년 폐쇄(sunset) 공지. DB-정본의 비용(스키마 이동 + 동기화 스택 + 프로세스 감독)이 실제로 프로젝트를 무겁게 만드는 반례다. kybird-nest에서 체감한 교훈과 정확히 같은 방향.

---

## 2. 칸반이 있는 셋 — 메커니즘 비교

### Backlog.md — "칸반을 md 위에 올바르게 얹은 표준안"

- 구조: `backlog/{tasks,drafts,completed,archive,milestones,decisions,docs}/`, 카드 파일명 `` `task-425 - Title.md` ``, YAML frontmatter 19개 필드.
- **컬럼 = `config.yml`의 `statuses` 배열 순서**. 마지막 원소가 종결 상태라는 관례.
- **순서 = frontmatter `ordinal`(float)**. 이동 시 대부분 한 파일만 쓰고(중간값 삽입, 스텝 1000), 간격 소진 시에만 컬럼 전체 재부여 — `src/core/reorder.ts`.
- **상태 = 파일 위치**: `tasks/` → Done이면 `completed/`로 이동 → `archive/`. git log이 곧 카드 이력.
- 본문 섹션을 `<!-- SECTION:PLAN:BEGIN/END -->` HTML 주석 센티넬로 감싸 → 렌더링은 예쁘고 파서는 정확. AC 체크리스트는 `- [ ] #1`처럼 **항목에 안정 인덱스를 박아서** 재정렬 후에도 `--check-ac 1`이 유효.
- 에이전트 통합: AGENTS.md에는 짧은 버전 표시 넛지만 심고("매 요청 전 `backlog instructions overview` 실행"), 상세 가이드는 **바이너리가 렌더링**해서 프롬프트 드리프트를 없앰. MCP는 스스로 "부차/레거시"로 강등 — 우리 "스킬=프롬프트, CLI=배관"과 같은 결론에 도달.
- 자율화는 코어에 없고 `onStatusChange` 쉘 훅(상태 전이 시 `claude "Task ... 구현해"` 디스패치 예시 공식 문서화)과 TPM 코디네이터 스킬로 위임.
- `decisions/`가 ADR-lite로 `proposed|accepted|rejected|superseded` 수명주기를 가짐 — 우리 카드 3갈래(완료/대체/폐기)의 선례.

### kanban-md — "무인 루프에 가장 가까운, 가장 작은 구현" (★는 적지만 방향이 우리와 제일 겹침)

- Go 단일 바이너리, "Files are the API. 숨은 상태 없음."
- **claim = 만료 있는 협동 락**: frontmatter `claimed_by/claimed_at` + `claim_timeout: 1h`. 밤새 에이전트가 죽으면 클레임이 자연 만료 → 다시 집을 수 있는 카드가 됨. 스테일 락 청소가 필요 없는 설계.
- **`pick --claim <name> --move in-progress` = 원자적 집기**: 후보 필터(미클레임/만료/블록아님/의존 충족) → 서비스등급(expedite>fixed-date>standard>intangible) → 우선순위 정렬까지 한 명령. list→선택→claim→move 사이의 TOCTOU를 없앤다.
- **`handoff` = 1급 동사**: review로 이동 + 타임스탬프 노트 + 블록 사유 + 클레임 반납을 한 번에. "막히면 멈추지 말고 park하고 다음 카드" — 우리 밤샘 루프 정책과 동일.
- 루프의 종결 규칙이 프롬프트에 명문화: "집을 카드가 없으면 사용자에게 정확한 질문을 던지고 **멈춰라, 보드를 헤비게 하지 마라**"(반 스래시 규칙).
- 카드 본문 = append-only 저널(`edit --append-body --timestamp`), `activity.jsonl`(1만 줄 캡)로 감사로그, WIP 제한 + expedite 상한 보유 — **처리량이 아니라 수렴을 위한 스로틀**이 이미 장착됨.
- 약점: `pick`의 read-modify-write에 락이 없어 동시 pick이 같은 카드를 잡을 수 있음(ID 할당에만 flock). chmod 0444 클레임 보호는 Windows에서 무력.

### vibe-kanban — "DB-정본 진영의 최대 규모, 그리고 반면교사"

- 카드 순서 = `sort_order = 1000 * columnIndex + position` 정수 하나 — md frontmatter에도 그대로 쓸 수 있는 최소 비용 순서 저장.
- 작업공간 = **git worktree + 브랜치 + 세션 + 코딩에이전트 턴**(프롬프트/요약까지 DB에 기록), 태스크별 "attempts"(재시도 이력 1급 데이터) — supersede vs 재시도 판단의 원재료.
- 단, 디스패치는 사람 주도(칸반에서 클릭 → 워크스페이스 생성 → 채팅). 자율 pick은 없음.
- 에이전트 CLI를 `npx -y ...@2.1.119`로 핀ning, 벤더별 로그 정규화기, ElectricSQL 동기화, 릴레이/터널… 범위 폭발의 전시장. 우리가 "지식은 파일, 서버는 읽기전용 색인"으로 남으려는 이유의 근거.

---

## 3. 위키 쪽 둘 + 원조 — 파이프라인 비교

### karpathy-llm-wiki (2.1k★) — 스킬 1개짜리 미니멀 구현

- 산출물이 `SKILL.md` 1개 + 리포트 전용 `scripts/check_evidence.py` 1개뿐. CLI조차 없다. "Design Boundaries" 섹션에 **안 만든 것**(MCP, 벡터검색, 훅, 신뢰도 점수, 관계 온톨로지)과 이유를 명시 — 50K~100K 토큰 규모에선 grep이 더 신뢰된다는 판단.
- ingest에 **분류(disposition)**가 강제: New / Update / Disputed / **No material**(얇은 원료는 위키 페이지를 못 만들게 하는 탈출구).
- 근거 무결성: "위키의 모든 핵심 사실은 raw에 **문자 그대로** 존재해야" — 컴파일 시 locate-before-write(raw에서 그 값을 grep하고 씀), 린트 시 `check_evidence.py`가 인용문/숫자/날짜를 추출해 raw에 역매칭.
- **file:line 인용은 포기했다**는 기록이 중요: "관측된 모든 충실도 오류는 '값이 소스에 없음'이었다 — 주석 마찰 때문에 에이전트가 규칙을 건너뛴다." 우리 grounding 필드는 기계적으로 싸게 발행되지 않으면 같은 죽음을 죽는다.
- 갱신은 **클레임 단위**: 논쟁 중인 문장 바로 밑에 `> **Status: Disputed**` 블록, 파일 전체가 아니라 부분 진실을 보존.

### basic-memory (3.8k★) — 축적형, 서비스형

- md가 정본이지만 DB(SQLite)를 **유도 그래프 인덱스**로 두고 file-watcher로 동기화 — 유지비가 크다(`indexing/`에 reconciler ~40개 모듈).
- raw→compile 파이프라인이 **없다**. 전부 노트로 축적하고, entropy와 싈 스킬(defrag/curate/reflect = "sleep-time compute")을 주기적으로 돈다. 우리의 raw(불변·근거 있음) → wiki(승격·선별) 분리가 아키텍처 수준에서 이 문제를 미리 막는다는 대비점.
- 노트 포맷: `## Observations`에 `- [category] fact #tag (context)` 원자 사실 문법, `## Relations`에 `- verb [[Target]]` 형식화 위키링크. **permalink**(파일 이동에 살아남는 안정 ID), 사용 빈도에서 스키마를 추론하는 `bm schema infer`, MCP 도구에 read-only/destructive/idempotent 행동 태그.
- 폴더 = 상태(tasks/active → completed, entities/active → archive) + **"archive, never delete"**.

### 원조 gist — 우리가 아직 안 가져온 두 아이디어

1. **좋은 검색 답변을 위키에 다시 파일링**("good answers can be filed back into the wiki") — 탐색이 소스처럼 복리로 쌓이게 하는 장치. `doc/wiki/answers/` 4번째 분류 후보.
2. **lint를 연구 의제로** — "raw에 반복 등장하는데 위키 페이지 없는 개념" 같은 결핍 탐지 모드. 우리 wiki-lint는 정합성에만 보고 있다.

---

## 4. [제안] 칸반 수렴 엔진에 바로 쓸 것들 (우선순위 순)

1. **claim + 만료 + 원자적 pick** (kanban-md) — 밤샘 무인 루프의 조정(coordination) 원시형. 다만 kanban-md의 빈틈(동시 pick 가능)을 메워 `pick` 전체를 락 안에서.
2. **`handoff` 동사 + 반스래시 종결 규칙** (kanban-md) — "park하고 다음 카드", "다 멈추면 질문하고 정지". 수렴 엔진의 실패 모드(발산)를 프롬프트 레벨에서 막는 정책 문구가 이미 검증돼 있음.
3. **ordinal(float, 스텝 1000) 순서 + 상태=파일 위치** (Backlog.md) — 완료/대체/폐기를 폴더 이동으로 표현하면 git log이 곧 카드 이력. 폐기 사유 안 지우는 우리 원칙과 합침.
4. **섹션 센티넬(`<!-- BEGIN/END -->`)** (Backlog.md, kanban-md의 `context` 블록) — wiki-compile의 멱등성과 카드 본문(계획/노트/요약)의 안전한 기계 편집. 사람이 예쁘게 읽는 md와 정확한 파서를 양립시키는 값싼 장치.
5. **근거 검증 스크립트** (karpathy-llm-wiki) — 위키 페이지의 git hash/에러 문자열/file:line이 링크된 raw 로그에 실제로 존재하는지 **LLM 없이** 검사. 우리 grounding 필드는 문자 그대로 역매칭이 가능해서 그들보다 검증이 쉽다. 단 file:line은 발행 비용이 0에 가워야 한다는 그들의 실패 기록을 존중.
6. **AC 안정 인덱스 + DoD/AC 분리** (Backlog.md) — 카드의 완료 판정을 "결과 중심 AC"와 "프로젝트 위생 DoD"로 나누고, 체크 항목에 `#1` 인덱스를 박아 재정렬에 강하게.
7. **`--plain`/`--json`(스키마 버전) / non-TTY 자동 전환** (Backlog.md, kanban-md의 `--compact`) — CLI가 에이전트에게 안정적 계약을 주는 방식. 토큰 비용을 설계 지표로 삼은 kanban-md의 태도까지.
8. **답변 아카이빙 + lint-as-research** (원조 gist) — wiki-search의 좋은 답을 `doc/wiki/answers/`로 승격; wiki-lint에 "raw에 자주 나오는데 페이지 없는 개념" 결핍 보고.
9. **주기 큐레이션 스킬 + "archive, never delete"** (basic-memory) — wiki-defrag/wiki-curate를 정기 작업으로. 폐기 사유 보존 원칙과 정확히 같은 마음.

## 5. [제안] 피할 것들

- **사람 손편집 + 도구 쓰기를 동시에 허용하는 구조적 md** — Backlog.md의 섹션 파서가 ~1,250줄. 결국 그들도 "md를 직접 편집하지 말고 CLI를 써라"라고 에이전트에게 지시한다. 쓰기는 도구만, 사람은 읽기만으로 규칙을 단순화하면 이 비용 전체를 피한다.
- **DB를 정본으로** — vibe-kanban의 길(마이그레이션 80+, 동기화 스택, sunset). 유도 캐시(QMD)는 각 머신이 md에서 다시 만드는 우리 방식이 정답.
- **파일명에 제목 포함** — 제목 바꾸면 git 이력이 끊긴다. ID만으로.
- **프론매터 필드 크리프** — Backlog.md 19개 필드의 전철. 카드 필드는 완료/대체/폐기 판정에 필요한 최소만.
- **chmod 기반 보호, 에이전트 CLI 버전 핀ning** — Windows에서 무력 / 릴리스마다 부러짐.
