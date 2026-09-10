# llm-wiki 개선 계획

> 2026-08-29. [plan.md](plan.md)(설계 도화지)와 [refs-comparison.md](refs-comparison.md)
> (참고 구현체 6종 분석)를 잇는 **실행 계획**. plan.md의 [확정]을 뒤집는 항목은
> 없고, 미결 #1(칸반 저장 형태)을 refs/ 증거로 해소한다. 표기는 plan.md와 같다.

## 진행 상황 (2026-08-29 세션)

**0~4단계 전부 구현 + 이 레포 자체로 도그푸딩 완료.** 커밋 히스토리가 작업 단위다.

| 단계 | 상태 | 비고 |
|---|---|---|
| 0 | ✅ | `Unexpected compiler version, expected CUDA 12.4+` 실측 — 정확 매칭 6/6 키워드 1위. 가짜 qmd로 병합 분기 검증 |
| 1 | ✅ | 1-1~1-7 전부. 추가로 [[링크]]↔파일명 정규화 비교(케이스/공백 드리프트 오탐 제거), lint antipatterns 통계 버그 수정 |
| 2 | ✅ | 카드당 파일 + 유도 board 뷰로 구현하고 이 레포 작업을 실제 카드로 소화 — §3.1 [제안]의 도그푸딩 통과 |
| 3 | ✅ | work-loop 스킬(6규칙 전부) + `reopen`(QA 되돌림) + `--renew-claim` |
| 4 | ✅ | board report(완료:폐기 비율 경보, 추이, 되돌림 수) + abandon이 폐기 사유를 raw에 자동 기록(4-2를 기계화) |
| 후속(같은 날) | ✅ | 템플릿 사본 갱신 경로 — 1-7의 마커 규칙을 githooks/scripts로 확장(`llm-wiki-template-version:`), `init --check`가 셋 모두 보고. 이 레포는 config `"hooksPath": "templates/githooks"` 선언으로 githooks/ 사본을 없애 drift 원천 차단 |
| 후속2(같은 날) | ✅ | 루프 가동 — 남은 작업 전부 카드화, 조건 게이트(`not_before`+`resume`)로 미결 #3 튜닝·웹 뷰를 조건만족시 진행으로 전환, `board --html` 시각화, compile list same-day 수정(subagent 설계 리뷰: 채택+수정 3건 반영) |
| 5단계(2026-09-09) | ✅ 5-1 | 전체 리뷰 → 즉시 수정 6건 완료(셸 주입·노트 하이재크·종결 덮어쓰기·pick 비카드·UTC 날짜·findstr, 재현→부재 확인 각 1커밋) — 잔여는 §8 5-2 카드 6장으로 이관 |

**미착수(상시 트랙 그대로):** 스킬 git 배포(`skills add`/`sync`), TodoWrite 캡처 조사.

**후속 과제 1건 발견:** `compile list` 판정은 로그 헤더 날짜 기준이라 **같은 날짜 파일에
덧붙인 케이스는 미컴파일 경고가 안 뜬다**(fd01a03의 false-positive 제거의 그림자인
false-negative). 0-3 넛지의 사각지대 — 측정 후 개선.

---

## 0. 단계 요약

| 단계 | 내용 | 수용자 | 왜 이 순서인가 |
|---|---|---|---|
| **0** | 검색 버그 수정 (QMD/grep 병합) | 매 세션의 wiki-search | plan.md 5.1(1) — **이걸 안 고치면 모든 측정이 오염** |
| **1** | 위키 신뢰성 강화 (근거 검증, 어휘, lint 확장) | wiki-lint/compile 스킬 | 기존 자산의 신뢰도가 루프의 입력 품질을 결정 |
| **2** | 칸반 코어 (카드당 파일 + CLI 원시형) | 사람 기획 루프 + 3단계 루프 | 미결 #1 해소. 3단계가 곧 소비 (원칙: 배관 먼저 깔지 마라) |
| **3** | 무인 루프 스킬 + 트리거 | 밤샘 오프피크 세션 | 최종 목표의 첫 동작 버전 |
| **4** | 계기판 + 폐기→안티패턴 연결 | 아침의 사람 | 수렴을 확인하고 폐기 사유가 위키로 흐르게 |
| 상시 | 스킬 git 배포(6.2), TodoWrite 캡처 조사(미결 #4) | — | 검증 전엔 못박지 않는다 |

**안 하는 것 (현 단계):** 웹 뷰(포맷이 굳은 다음 — plan.md 확정), TypeScript 전환(확정),
서버/데몬/DB 정본, MCP 우선(Backlog.md조차 강등한 길), 칸반 카드에 고유번호(3.5 확정 —
제목이 곧 식별자, 위키와 같은 규칙).

---

## 1. 0단계 — 검색 버그 (측정 도구 먼저)

plan.md 5.1의 넷 중 (1)(2). **완료 전까지 다른 어떤 검색 품질 논의도 무효.**

| # | 작업 | 위치 | 내용 |
|---|---|---|---|
| 0-1 | QMD+grep 항상 병합 | `lib/wiki-search.js` | `qmdSucceeded`가 grep을 건너뛰는 분기 제거. QMD 결과와 grep 결과를 **항상 둘 다** 모아 출력(보완재, 대체재 아님 — refs-comparison에서도 재확인된 원칙) |
| 0-2 | grep 순위 + 매칭 줄 | `lib/wiki-search.js` | 키워드별 Set 합치기를 **매칭 키워드 수 내림차순 정렬**로. 파일명만 출력하던 것을 매칭된 줄 스니펫과 함께 |
| 0-3 | compile index 갱신 넛지 | `templates/githooks/pre-commit` | 커밋에 `doc/raw/*.md`가 포함되면 `llm-wiki compile list`를 돌려 "미컴파일 로그 N건" 경고만 출력(무거운 QMD embed은 훅에서 돌리지 않는다). 4.4 "아무도 안 부른다"의 최소 해결 |

**완료 기준:** 위키에 확실히 있는 지식을 실제 에러 메시지로 검색해 매번 찾는다(재현율 100%가 아니라 "정확 문자열이 못 걸리는 일이 없음"). 이 레포 자체 doc/로 측정.

---

## 2. 1단계 — 위키 신뢰성 (기존 코드 강화, 전부 작은 변경)

| # | 작업 | 위치 | 근거·내용 |
|---|---|---|---|
| 1-1 | **근거 역매칭 검증** | `lib/wiki-lint.js` | karpathy-llm-wiki `check_evidence.py` 방식. 위키 페이지의 `hash:xxx`(7~40 hex)와 `### Error` 인용 문자열을 추출해 `doc/raw/` 전체에 문자 그대로 존재하는지 기계 검사. 우리 grounding은 구조화 필드라 그들보다 쉽다. **단, grounding 발행 비용이 0에 가까워야 한다는 그들의 실패 기록(file:line 포기)을 존중 — 스킬 요구 필드는 늘리지 않는다** |
| 1-2 | 어휘 통일 | `skills/wiki-log/SKILL.md`, `lib/wiki-compile.js` | plan.md 5.1(3). frontmatter `aliases: [...]` 권장 추가, **에러 메시지 원문 보존** 규칙(compile 시 요약으로 걸릴 문자열이 사라지지 않게 raw 원문 인용 유지) |
| 1-3 | lint를 연구 의제로 | `lib/wiki-lint.js` | raw 로그의 `[[링크]]` 빈도를 세서 **N회 이상 언급됐는데 wiki 페이지가 없는 개념**을 "Uncompiled knowledge" 섹션으로 보고. 원조 gist·karpathy-llm-wiki 공통 기능 |
| 1-4 | 답변 아카이빙 | `skills/wiki-search/SKILL.md` | gist의 미이식 아이디어. 유용했던 종합 답변을 `doc/wiki/answers/`로 승격(스킬 절차만; index 재구축 시 answers 섹션 포함) |
| 1-5 | compile 분류(disposition) | `skills/wiki-compile/SKILL.md` | ingest마다 New/Update/Merge/**No material** 분류 강제 — 얇은 케이스가 페이지가 되는 발산을 프롬프트로 차단 |
| 1-6 | `--json` 스키마 계약 | `lib/*.js`, `bin/llm-wiki.js` | `{schemaVersion: 1, kind: ...}` 봉투. CLI가 커질수록 스킬 프롬프트가 깨지지 않는 보험. 지금(CLI 827줄)이 가장 싸다 |
| 1-7 | 스킬 버전 마커 | `skills/*/SKILL.md`, `lib/init.js` | 각 스킬 첫머리에 `skill-version: N`. `llm-wiki init --check`가 레포에 복사된 스킬과 패키지 정본을 비교해 stale 보고. 6.1의 "손대면 건너뛴다" 규칙과 병존(마커가 살아있으면 미수정 판정) |

**완료 기준:** `llm-wiki lint`가 근거 위반·미컴파일 개념을 잡아내고, 검색 회귀 측정치(0단계)가 유지된다.

---

## 3. 2단계 — 칸반 코어: 미결 #1 해소

### 3.1 [제안] 저장 형태: **카드당 파일 + `board`는 유도 뷰**

plan.md 3.7의 원칙 세 개를 그대로 테스트해 통과하는 조합은 이것뿐이다:

| 원칙 | 카드당 파일 + 유도 board 뷰 |
|---|---|
| 1. 상태와 내용이 같은 파일 | ✅ frontmatter(상태) + 본문(내용)이 한 파일. "보드 표 + 카드 본문" 분할안과 다름 |
| 2. 생성물은 썩는다 | ✅ board 뷰는 카드가 정본인 유도물. index.md처럼 "갱신 안 하면 틀어지는 정본"이 아님 |
| 3. 에이전트는 파일 하나를 읽는다 | ✅ 루프 에이전트는 `pick`이 준 **카드 한 개 경로**만 읽는다. 보드 전체 열람은 사람 몫(`board` 뷰) |

존재 증명: Backlog.md(6.6k★), kanban-md가 정확히 이 구조다. 3.7 원칙 3이 쓰인 시점엔
"카드당 파일 = N번 읽기"라는 반례만 있었는데, refs/는 **pick이 하나만 주는 구조**로 이
반례를 해소함을 보여준다. 원칙 3의 정신(서버 의존 금지)은 유지된다 — CLI는 로컬,
네트워크·로그인 없음.

**refs-comparison.md §5와의 긴장 명시:** 거긴 "파일명에 제목 포함 = 피할 것"(Backlog.md
교훈)이라 적었지만, plan.md 3.5 [확정]이 제목=식별자를 먼저 정했다. **3.5를 유지한다.**
이유: 위키 `[[제목]]`과 같은 어휘 체계(3.4), 카드는 완성 후 대체·폐기로 끝나 **이름
변경이 일어나는 빈도가 태스크 트래커보다 낮다**. 대신 이름 변경이 필요하면 supersede로
새 카드를 만든다(참조가 깨지지 않음).

### 3.2 [제안] 디렉터리와 카드 포맷

```
doc/kanban/
  board.yml            # statuses, wip_limits, claim_timeout
  cards/               # 활성: todo / doing / review (frontmatter status)
  done/                # 완료 — move 시 폴더 이동 + 종결
  superseded/          # 대체 — superseded_by: [자식들], 부모는 소멸 (3.1)
  abandoned/           # 폐기 — discard_reason 필수, 지우지 않는다 (3.3)
  activity.jsonl       # append-only 감사로그, 10k 줄 캡 (kanban-md 방식)
```

```markdown
---
title: 검색 결과 병합
status: doing          # todo | doing | review — 종결은 폴더가 말한다
claimed_by: quiet-storm
claimed_at: 2026-08-29T23:14+09:00
ordinal: 2000          # float, 스텝 1000, 컬럼 내 순서 (Backlog.md 방식)
depends_on: []
---

## Goal
<!-- kanban:goal:begin -->
grep 결과가 항상 검색에 포함된다.
<!-- kanban:goal:end -->

## Acceptance Criteria
<!-- kanban:ac:begin -->
- [ ] #1 QMD 결과가 있어도 grep 결과가 함께 출력된다
- [ ] #2 매칭 키워드 수 내림차순으로 정렬된다
<!-- kanban:ac:end -->

## Plan
## Notes      ← append-only 저널 (`--append-note --timestamp`)
## Handoff    ← 대기 시: 상태/분기 질문/다음 단계 (kanban-md 양식)
## Result     ← 완료 시: "무엇을 바꿨고 무엇으로 검증했는가"
```

- 섹션 센티널(`<!-- kanban:…:begin/end -->`) — 사람은 예쁘게 읽고 CLI는 정확히 자른다
  (Backlog.md). **카드 쓰기는 CLI만** 허용 — 1,250줄 파서의 원인이었던 "사람 손편집
  round-trip"을 처음부터 포기한다. 사람은 읽기만.
- AC의 `#1` 안정 인덱스 — 재정렬 후에도 `--check-ac 1`이 유효 (Backlog.md).
- depends_on은 DAG로만 쓴다(사이클 검사 내장 — kanban-md `cycle.go` 참조). 이게
  그래프 엔지니어링에서 가져올 전부.

### 3.3 [제안] 명령 (최소 세트)

| 명령 | 동작 |
|---|---|
| `llm-wiki board` | 유도 뷰: 컬럼별 카드, WIP 사용률, 대기 큐, 만료 클레임 |
| `llm-wiki card new "<title>"` / `edit` / `show` | 카드 생성·편집(센티넬 보존)·표시 |
| `llm-wiki pick --claim <name>` | **원자적 집기**: 준비 필터(미클레임/만료/의존 충족/WIP 여유) → 정렬 → 클레임 → doing 이동. **락 안에서** (kanban-md의 동시 pick 빈틈 메워서 출발) |
| `llm-wiki handoff <title> --question "..."` | review로 + 타임스탬프 노트 + 클레임 반납. "park하고 다음 카드" |
| `llm-wiki done <title> --result "..."` | 완료. Result 없으면 거부 |
| `llm-wiki supersede <title> --by a,b` | 대체. 부모는 `superseded/`로, `superseded_by` 기록 |
| `llm-wiki abandon <title> --reason "..."` | 폐기. 사유 없으면 거부 — 사유가 안티패턴 원재료(3.3) |
| `llm-wiki board report` | 4단계 계기판 (아래) |

**클레임 = 만료 있는 협동 락** (`claim_timeout`, 기본 1h — board.yml): 밤에 에이전트가
죽으면 클레임이 자연 만료되어 재집기 가능. 스테일 락 청소 불필요. 파일 락은 잠금
폴더/`wx` 생성 원자성으로(Windows 호환, chmod 아님).

**완료 기준:** 이 레포의 다음 개선 작업 몇 개를 실제 카드로 돌려본다 — 사람이
`card new`로 쌓고, 세션이 `pick`→`done`/`handoff`로 소화. `git log`가 카드 이력으로
읽힌다.

---

## 4. 3단계 — 무인 루프 (최종 목표의 첫 동작)

### 4.1 plan.md 4.1("스킬로는 이길 수 없다")과의 관계 — 오해 풀기

4.1의 판배는 **일반 세션**(사람 개입, 시스템프롬프트 todo와 경쟁)에 대한 것이다.
무인 루프 세션은 다르다: **경쟁할 네이티브 todo가 없는, 보드가 곧 작업 지시인 전용
세션**이다. kanban-md가 루프를 스킬 프롬프트로 돌리는 것이 존재 증명. 따라서:

- 일반 세션의 파편화 → 4.2의 **캡처** 방향 (미결 #4, 아래 상시 조사)
- 무인 루프 세션 → **루프 스킬 + CLI 원시형** (이 단계)

둘은 경쟁이 아니라 입구가 다른 같은 보드다.

### 4.2 [제안] `skills/work-loop/SKILL.md` — 루프는 4노드 그래프를 프롬프트로

```
pick → work(개발: 해소) → 판정 ─ done / handoff / abandon(폐기) / supersede(분해=기획)
  ↑                                                        │
  └───────────────── 다음 카드 ←───────────────────────────┘
  집을 카드 없으면 → review(대기) 큐 점검 → 전부 대기면 질문을 모아 정지 (반스래시)
```

프롬프트에 박는 규칙 (전부 refs/ 검증분):

1. **판단 필요 = 닫힌 목록** (kanban-md): ①스펙 결정 ②자격증명/외부 행위 ③판단이
   필요한 머지 충돌 ④반복되는 테스트 실패. 이 목록 밖은 스스로 결정한다.
   (열어두면 만성 park 회피가 온다.)
2. **막히면 멈추지 않는다** — `handoff`로 park하고 다음 카드. 세션 승인 대기 없음(2.1).
3. **AC는 객관적 증거로만 체크** (Backlog.md finalization 가이드) — 코드 읽어서
   "됐겠지" 금지, 실행한 검증 결과만. Result는 "바꾼 것 + 검증 방법".
4. **정지 규칙** — 집을 카드가 없고 전부 대기면 `board report`를 남기고 정지.
   보드를 헤비하게 만들지 않는다.
5. **작업 전 `llm-wiki search`** — 같은 벽에 밤마다 부딪히는 일 방지(폐기 사유가
   안티패턴에 이미 있으면 pick 단계에서 피한다).
6. **클레임 갱신** — 긴 카드는 타임아웃 전 재클레임.

### 4.3 [제안] QA 루프 — 가짜 완료 되돌림 (plan.md 2.4 확정의 구현)

루프 말미 또는 별도 세션이 `done/` 최근 카드의 Result·AC 증거를 검사해, 증거가
빈약하면 doing으로 되돌린다(일시적으로 카드 수가 늘지만 곡선이 진짜가 된다).
`llm-wiki board report`가 되돌림 건수를 함께 보고.

### 4.4 [제안] 트리거 — 데몬은 만들지 않는다

- 1차: 사람이 취침 전 "루프 돌려" 한 마디 → 세션이 work-loop 스킬 수행.
- 2차: 호스트 cron(예: ZCode 예약)이 자정에 루프 세션 가동.
- **vibe-kanban의 길(프로세스 감독·동기화 스택)로 가지 않는다.** refs/ 6종 중
  누구도 데몬을 만들지 않았다 — 루프는 세션 안에, 보드는 파일에.

**완료 기준:** 하룻밤 무인으로 돌려 다음 아침 ①완료/대체/폐기가 전부 기록돼 있고
②사람 판단 대기 큐에 질문이 모여 있고 ③카드 수가 늘기만 하지 않는다(수렴 신호).

---

## 5. 4단계 — 계기판 + 폐기→안티패턴

| # | 작업 | 내용 |
|---|---|---|
| 4-1 | `llm-wiki board report` | **완료:폐기 비율**(3.2 확정 — 카드 수가 아니라 이것이 계기판), 카드 수 추이(activity.jsonl 기반), 대기 큐 목록, 만료 클레임. 아침 사람이 보는 한 화면 |
| 4-2 | 폐기→안티패턴 파이프라인 | `abandon` 시 폐기 사유를 wiki-log(discovery 타입)로 raw에 기록 → 주기 compile에서 `antipatterns/` 승격 후보로. **폐기 사유가 지워지지 않고 위키로 흐르는 것**이 3.3 확정의 실행 |
| 4-3 | 발산 방지 1차 방어 (미결 #3 부분 해소) | 즉시 장착: doing WIP 상한(board.yml). 측정 후 튜닝: 분해 규칙(자식은 부모보다 엄격히 작을 것, 깊이 ≤ 3, "카드 1장 = 컨텍스트 1개 = 커밋 1개"). **수렴 곡선 데이터를 먼저 모으고 규칙을 조인다** (원칙 5) |

---

## 6. 상시 트랙 (순서 조건 없음)

- **스킬 git 배포** (plan.md 6.2 제안의 구현): `llm-wiki skills add <git-url>` /
  `skills sync` — npm 퍼블리시 없이 프롬프트 고침. diff 보여주고 승인받기(6.5).
- **TodoWrite 캡처 조사** (미결 #4): Claude Code 등에서 네이티브 todo를 훅으로
  가로챌 수 있는지 사실 확인만. 되면 일반 세션의 보드 자동 갱신(4.2), 안 되면
  git 훅 넛지(0-3)로 만족.
- **웹 뷰**: 2단계 포맷이 한 달 이상 요동 없이 굳으면. 드래그 이동 포함(확정).

---

## 7. 미결 갱신 (plan.md §7에 대한 이 문서의 영향)

| # | 미결 | 이 문서의 영향 |
|---|---|---|
| 1 | 칸반 저장 형태 | **해소 제안** — §3.1 (카드당 파일 + 유도 board 뷰). 2단계 도그푸딩으로 확정 승격 |
| 3 | 발산 방지 | **1차 방어 채택**(WIP 상한) + 측정 후 튜닝으로 남음 |
| 4 | TodoWrite 가로채기 | 상시 조사 과제로 유지. 무인 루프는 이것 없이도 성립(§4.1) |
| 2, 5, 6 | 정본(파일/스킬), Pi, 아카이브 정책 | 영향 없음. 웹 뷰 확정 시점에 재검토 |

---

## 8. 5단계 — 결함 수습 (2026-09-09 전체 리뷰)

**배경**: 0.2.2 배포 후 사용기 첫 전체 레포 검토(코드 리뷰 서브에이전트 + lint/compile
실행 실측). 읽기 경로(lint·compile·검색 병합)는 청정 — 문제는 **쓰기 경로(카드 저장·이동·
선별)에 재현 검증된 데이터 손실 4건**. 결함 수정은 게이트 면제(사용기 원칙)라 즉시 수정,
완료분은 0.2.3 패치로 배포한다(채널 분리 원칙 그대로 — push + `npm version patch`).

### 5-1. [확정] 즉시 수정 → 0.2.3

| # | 결함 | 위치 | 내용 |
|---|---|---|---|
| 5-1-1 | 검색어 셸 주입 | wiki-search.js | qmd 호출 `execSync`에 검색어를 문자열 끼워넣음 — POSIX 따옴표 안 `$(...)`·백틱 실행, cmd는 검색어의 `"`가 인용 파손. 에러 메시지를 붙여넣는 LLM 호출자에겐 일상 입력. `execFileSync` 인자 배열로 전환 |
| 5-1-2 | 노트 `## ` 섹션 하이재크 | kanban.js | `card edit --note` 값의 `## ` 줄이 섹션 경계로 오인 — Notes 내용이 유령 섹션으로 이동하거나(`## Goal` 충돌 시) 전부 삭제. append-only 저널 계약 파손. 직렬화 시 본문 이스케이프 + 파서는 알려진 섹션명만 경계로 인정 |
| 5-1-3 | 중복 제목 종결 덮어쓰기 | kanban-cmd.js · kanban.js | `card new` 존재 검사가 cards/만 봄 + `moveCardTo` 충돌 무검사 → 같은 제목 재생성 후 종결 시 기존 done 카드의 Result가 조용히 소멍(3.3 "지우지 않는다"의 정면 반례). 존재 검사 4폴더 전부 + 이동 충돌 거부 |
| 5-1-4 | pick 비카드 삭제 | kanban-cmd.js | 후보 필터에 status 검증 없음 — frontmatter 없는 .md(cards/README.md 등)가 후보가 되고 재직렬화에서 `## ` 앞 본문이 통째로 소실. 활성 status 아닌 파일 스킵 |
| 5-1-5 | not_before UTC 판정 | kanban-cmd.js 4곳 | pick 게이트·보드/HTML 배지가 `toISOString()`(UTC)로 오늘을 삼음 — KST 자정~9시 게이트 오판. wiki-compile에서 localToday()로 고친 바로 그 결함(4c5f27c)의 칸반판. 공유 유틸로 통일 |
| 5-1-6 | findstr CP949 조용한 0건 | wiki-search.js | grep 대체 findstr이 ACP 의존 — 한국어 Windows(코드페이지 949)에서 한국어 검색어가 비트 불일치로 0건(이 머신은 시스템 UTF-8이라 우연히 동작). findstr 제거, 디렉터리 순회 안에서 순수 JS 라인 스캐너로 |

**완료 조건**: 각 결함은 이미 재현으로 확인된 것 — 수정 후 동일 재현 절차(임시
`LLM_WIKI_ROOT` 보드)로 부재를 확인해야 완료.

**완료(2026-09-09, 같은 날 수습)**: 6건 전부 수정·검증 후 각 1커밋(51901bf·8f7f628·
1419fdb·d438c42·b2527ab·ce38d63). 5-1-6은 예상을 넘어 이 머신에서도 findstr이 이미
깨져 있었음이 밝혀졌다(raw 2026-09-09 Case 3). 배포는 0.2.3 패치로 — push와 함께.

### 5-2. [확정] 카드행 (게이트 없음 — pick 가능)

설계 판단이 섞였거나 낮은 결함은 즉시 수정 트랙에서 제외, 아래 카드로:

| 카드 | 묶는 것 |
|---|---|
| 쓰기 명령 락 전면화 | 락은 pick에만 존재 — done/handoff/card edit 등 무방비 read-modify-write(동시 실행 시 활성+종결 이중 상태), `--renew-claim` 비원자 갱신, lock.json 못 쓰고 죽은 고아 락 폴더의 영구 강탈 불가 |
| frontmatter 왕복 보존 | `[a, b]` 꼴 문자열의 배열 변형, `,` 포함 depends_on 항목 분해, 비대칭 따옴표 박리, board.yml `statuses:` 정규식의 행내 주석 오염, 슬러그 폴백 모호 매칭(a/b ≡ a:b) |
| CLI 계약 정리 | `--version` 부재(exit 1), compile 서브커맨드 오타가 exit 0, parseArgs가 값 없는 플래그에 다음 플래그를 삼킴(`done --result` 누락 시 "true" 기록) |
| docRoot 일관성 | board video의 `../doc/` 하드코딩(문서 루트 오버라이드 무시) + npm 소비자는 video/ 프로젝트 미포함이라 명령 불가 — 안내로 명시, init이 LLM_WIKI_ROOT 무시(안내 무한루프 유발) |
| 컴파일·검색 잔여 | raw/ 없으면 writeCompileState 크래시, QMD 컬렉션 존재 판정이 부분문자열(`<base>-wiki` ≡ `<base>-wiki-raw` 접두사), wiki-compile 잔여 execSync(입력이 설정값이라 위험 낮음) |
| 왕복 테스트 스캐폴드 | 5-1류 결함(직렬화 왕복·중복 제목·선별 필터)을 잡는 회귀 테스트 도입 — 이번 수습의 임시 재현 스크립트를 정식 테스트로 승격 |
