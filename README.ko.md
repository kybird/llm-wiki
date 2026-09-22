# llm-wiki

[English](README.md) | **한국어**

AI 코딩 에이전트를 위한 **LLM 친화 지식 그래프 + 칸반 보드**. 에러·결정·발견을 일일 원시 로그로 남기고, 이를 컴파일해 에이전트가 코드를 쓰기 전에 참고하는 검색 가능한 위키(컨셉·패턴·안티패턴)로 만든다. 파일 기반 칸반(`doc/kanban/`)은 같은 레포를 무인 작업 큐로 바꾼다.

[Karpathy의 Agentic Memory](https://github.com/karpathy/llm.c) 아이디어에서 영감 — *다음* 에이전트 세션이 *직전* 에이전트의 실수를 반복하지 않게 하는 설계.

## 왜 필요한가

AI 코딩 에이전트(Claude Code, Cursor, ZCode, Gemini CLI, …)는 세션 사이의 모든 것을 잊는다. 에이전트가 실제로 읽는 프로젝트 위키 — git 해시, 실제 에러 문자열, 실제 실패 사례에 그라운딩된 — 는 일회성 디버깅 고통을 오래 쓰는 재사용 지식으로 바꾼다. 칸반은 수렴 루프를 더한다: 카드는 뽑히고(pick), 해결되거나(done), 사람 판정을 위해 주차되거나(handoff), 이유와 함께 폐기되고(abandon) — 그 이유는 안티패턴 재료로 위키에 되돌아간다.

스킬들(`wiki-search`, `wiki-log`, `wiki-compile`, `wiki-lint`, `kanban-plan`, `work-loop`)은 **LLM 프롬프트**다: 지능은 서버가 아니라 에이전트의 컨텍스트에 산다. CLI는 배관일 뿐이다. 계획 세션은 계획을 카드로 만들고(`kanban-plan`), 무인 루프 세션이 그것을 해결한다(`work-loop`).

## 설치

```bash
npm install -g @kybird/llm-wiki   # `llm-wiki` 명령 설치
# 또는 설치 없이 실행:
npx @kybird/llm-wiki init
```

## 퀵스타트(아무 레포에서나)

```bash
cd my-project
llm-wiki init          # doc/ 스캐폴딩(wiki + kanban), 스킬 + 훅 + 스크립트 복사

# git 훅 활성화(클론마다 1회):
git config core.hooksPath githooks

# (선택) QMD는 grep 위에 시맨틱 검색을 얹는다 — 없어도 grep만으로 동작:
npm install @tobilu/qmd
```

그다음 AI 에이전트에게 지시한다(지시 파일 — `CLAUDE.md` / `AGENTS.md` 등 — 을 통해):
- **모든 작업 전**: `llm-wiki search "<작업 키워드>"`을 실행해 매칭된 `status: active` 문서를 읽을 것.
- **버그 수정 직후 / 설계 결정 직후**: `wiki-log` 스킬로 `doc/raw/YYYY-MM-DD.md`에 Case를 기록.
- **주기적으로**: `wiki-compile`로 원시 Case를 `doc/wiki/` 문서로 승격.

끝이다. 나머지는 에이전트가 한다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `llm-wiki init [--check]` | `doc/` 스캐폴딩(wiki + kanban), 스킬 + 훅 + 스크립트 복사. 마커 인식 — 재실행하면 사본을 갱신하고 당신의 수정은 보존. `--check`는 쓰지 않고 보고만 |
| `llm-wiki search "<query>"` | grep 정확 매칭 + QMD 시맨틱 검색, **항상 병합**; 매칭 키워드 수 랭킹 + 라인 스니펫 |
| `llm-wiki compile list` | 아직 컴파일 안 된 원시 로그 목록 — 헤더 날짜 **또는** 콘텐츠 해시(`compile-state.json`)라 같은 날 추가분도 잡는다 |
| `llm-wiki compile index` | `doc/wiki/index.md` 재생성(별칭·답변 포함), `compile-state.json` 재생성, QMD 인덱스 동기화. **"컴파일 완료" 선언**이다 — wiki-compile 스킬의 페이즈 뒤에 실행할 것, 페이즈를 대신하는 게 아니다 |
| `llm-wiki lint` | 깨진 링크, **증거 역매칭**(해시 참조와 `### Error` 인용이 `doc/raw/`에 문자 그대로 존재해야), 미컴파일 컨셉, 메타데이터, 낡음 |
| `llm-wiki board` / `board report` | 파생 칸반 뷰(텍스트만, 플래그 없음) / 대시보드(done:abandoned 비율, 추세, QA 리버트, 대기열, **review 노화** — 가장 오래된 대기 일수·7일 초과 건수 — 및 마일스톤 경과일(생성일 기준)) |
| `llm-wiki board video` | `activity.jsonl`을 보드 타임랩스 MP4로 재생(`video/` Remotion 프로젝트 필요; CPU 렌더, GPU 불필요) |
| `llm-wiki monitor [--port <n>]` | 라이브 읽기 전용 보드 뷰 — `http://127.0.0.1:<n>`(기본 4747). 누가 뭘 클레임했고 얼마나 됐는지(`zcode · 14분`), 클레임 만료, REVIEW 질문, 게이트/의존성 대기, 종결 적체(최신 done/superseded/abandoned + 타임스탬프), 활동 스트림. **마일스톤 패널**(목적 축, plan.md 3.8)은 진행 중 마일스톤을 멤버 카드까지 펼치고 완료된 것은 진행률과 함께 접는다 — 마일스톤을 클릭하면 Goal(계획의 대의)과 전체 멤버 목록을 읽는다. 칼럼·종결 적체·활동 행의 아무 카드나 클릭하면 카드 파일 전문을 볼 수 있다. 2초마다 폴링(바뀔 때만 재렌더); 페이지는 에이전트 작성 텍스트를 `textContent`로만 렌더한다. **같은 보드의** 모니터가 이미 듣는 중에 시작하면 **멱등** — exit 0, 같은 URL. **다른 프로젝트의** 모니터가 포트를 잡고 있으면: 기본 실행은 다음 빈 포트로 넘어간다(4747→4748→…, 보드마다 자기 URL; 헤더에 프로젝트 이름 표시). 명시적 `--port`는 소유자 이름과 함께 실패. **`--all`**은 **플릿 뷰** 시작 — 이 머신의 모든 llm-wiki 프로젝트를 타일로(WIP, 리뷰 대기열, 마일스톤 진행, 마지막 활동), 각 프로젝트의 전체 보드는 클릭 한 번; 프로젝트는 명령 실행 시 머신 로컬 등록부(`~/.llm-wiki/projects.json`)에 자기 자신을 등록한다. **CLI는 여전히 유일한 작성자** — GET이 아닌 메서드는 전부 405; 서버는 상태를 갖지 않는다 |
| `llm-wiki card new/show/edit` | 카드 생성·편집 — CLI가 유일한 작성자(센티넬 보호 섹션). `--kind milestone`은 마일스톤 카드 생성(계획의 대의는 그 Goal에 산다; 픽 불가, 멤버 전체 종결 시 자동 완료); `--milestone "<제목>"`은 카드를 마일스톤에 붙인다 — 소속은 프론트매터, 마일스톤 진행률은 저장하지 않고 파생한다(plan.md 3.8). **범위 봉인(2026-09-21):** 마일스톤 멤버는 계획 시점(kanban-plan 분해)의 카드가 전부다 — 멤버가 있는 마일스톤에 `card edit --milestone` 으로 카드를 붙이는 건 범위 변경이라 `--scope-amend "<사유>"` 없이는 거부되고 사유는 카드 Notes에 '범위 변경'으로 남는다; 인터럽트 카드(follow-up·사용자 요청·버그)는 대신 무소속 백로그로 |
| `llm-wiki pick --claim <name> [--card <title>]` | 다음 자격 카드를 원자적으로 클레임(락, WIP 제한, 의존성, 클레임 만료). `--card`는 제목으로 특정 카드 클레임 — 모든 게이트는 여전히 적용: 막힌 픽은 이유를 출력하고 파일은 하나도 안 건드리며, 모르는 제목은 실패(exit 1) |
| `llm-wiki unpick <제목> --why "…"` | doing 카드를 todo로 반납 — `pick`의 역수: 클레임을 해제하고 WIP 칸을 즉시 비우며, 사유(필수)는 Notes에 `UNPICKED`로 기록된다. 집기 취소·아직 못 할 카드에 쓴다 — `handoff` 오용 금지(사람 판정용 파킹이라 review 큐를 오염시킨다) |
| `llm-wiki handoff <title> --question "…"` | 카드를 사람 판정 대기로 주차하고 클레임 해제 |
| `llm-wiki done <title> --result "…"` | 카드 완료 — Result 필수. 마지막 멤버를 완료하면 소속 마일스톤 자동 완료 |
| `llm-wiki supersede <title> --by a,b` | 카드를 자식들로 대체; 부모는 `superseded/`로 녹는다 |
| `llm-wiki abandon <title> --reason "…"` | 폐기 — 사유 필수, 안티패턴 재료로 `doc/raw/`에 자동 기록 |
| `llm-wiki reopen <title> --why "…"` | QA: 가짜 done 카드를 doing으로 되돌린다 |
| `llm-wiki wait [--for handoff\|done\|any\|stall] [--since <ISO>] [--timeout <s>] [--stall-min <m>] [--json]` | 보드 이벤트까지 블록 후 종료 — **exit 코드가 계약: 0 = 이벤트(stdout 한 줄), 2 = 타임아웃(출력 없음), 1 = 에러**; 호출자는 2에서 재무장(re-arm)하고 0에서 행동한다. `--for`는 이벤트를 고른다(기본 `handoff`; `stall`은 `--stall-min`분 침묵 후 발화, 기본 20). `--since`(기본: 지금)은 대기 시작 *전*에 검사해서 호출자가 바쁜 동안 쌓인 이벤트도 즉시 돌려준다. 읽기 전용; 타임스탬프 기반(`activity.jsonl` 전면 재작성 생존), 깨진 줄 스킵, 파일 생김 대기, `fs.watch` + 5초 폴 폴백(접합부 안전) |

`search`, `lint`, `compile list|index`, `board report`, `pick`은 `--json` 지원(스크립트·스킬용 `{schemaVersion: 1, kind: …}` 봉투). `wait --json`은 설계상 다르다: 호출자가 그 줄을 직접 파싱하기에, 매칭된 이벤트 자체를 한 JSON 줄로 출력한다(또는 `{action: "stall", …}` 줄).

모든 서브커맨드는 인자 어디에서든 `--help`/`-h`를 받는다: 그 명령의 사용법을 출력하고 보드를 건드리지 않은 채 exit 0 — 명령 탐색이 카드를 바꿔선 안 된다. 모든 보드·카드 명령은 알 수 없는 플래그도 거부한다(에러: `모르는 플래그`) — 플래그 오타가 조용히 no-op 하는 대신 요란하게 실패한다.

```bash
# 밤샘 재무장 루프: 자정 이후 주차된 다음 handoff에서 깨어난다; 1시간 뒤 조용히 exit 2
llm-wiki wait --for handoff --since 2026-09-12T00:00:00Z --timeout 3600 --json
```

## `init`이 만드는 것

```
your-repo/
├── doc/
│   ├── raw/               # 일일 로그(YYYY-MM-DD.md) — wiki-log가 여기에 쓴다
│   ├── wiki/              # 컴파일된 지식
│   │   ├── index.md       # `compile index`가 자동 재생성
│   │   └── concepts/ patterns/ antipatterns/ answers/
│   └── kanban/            # 카드 1장 = 파일 1개 칸반
│       ├── board.yml      # 상태, WIP 제한, 클레임 타임아웃
│       ├── cards/         # 활성: todo / doing / review (프론트매터 status)
│       ├── done/ superseded/ abandoned/   # 종결 = 폴더
│       └── activity.jsonl # append-only 감사 로그(1만 줄 상한)
├── AGENTS.md             # 없을 때 한 번 시딩 — 매 세션의 "어떤 스킬을 언제"
├── .agents/skills/        # 정본 스킬(ZCode, Cursor, …)
├── .claude/skills/        # Claude Code용 미러
├── scripts/               # doc/스킬 동기화 스크립트(마커 보호 복사본)
└── githooks/pre-commit    # CLAUDE.md 드리프트 가드 + 스킬 미러 + 미컴파일 로그 넛지
```

## 업데이트

`npm update`가 유일한 단계다. 레포에 복사된 스킬·훅·스크립트는 **마커 보호 복사본**이고, 버전 변경 후 처음 실행하는 `llm-wiki` 명령이 자동 재동기화한다(요약 한 줄 출력; `llm-wiki init --check`는 전체 보고, `llm-wiki init`는 예전처럼 수동 적용):

```bash
npm update -g @kybird/llm-wiki    # 그리고 아무 llm-wiki 명령 실행 — 사본 자동 갱신
```

버전 스탬프는 레포 안이 아니라 레포별 `~/.llm-wiki/auto-update/`에 산다(`LLM_WIKI_STATE_DIR`으로 오버라이드). 옵트아웃은 `llm-wiki.config.json`에 `"autoUpdate": false`, 또는 한 번만 끄려면 `LLM_WIKI_NO_AUTO_UPDATE=1`.

계약: 복사본은 수정되지 않은 동안만 버전 마커를 유지한다(스킬의 `skill-version:`, 훅·스크립트의 `llm-wiki-template-version:`). **사본을 커스터마이즈하려면 마커 줄을 지워라** — 그러면 업데이트가 그것을 당신 것으로 취급해 다시는 덮어쓰지 않는다. 자기 정본 훅을 유지하는 레포는 복사를 통째로 건너뛸 수 있다: `llm-wiki.config.json`에 `"hooksPath": "templates/githooks"` 설정. 시딩된 `AGENTS.md`는 영원히 당신 것이다 — init 때 1회 작성, 이후 갱신 없음.

## 설정(선택)

레포 루트에 `llm-wiki.config.json`을 만든다:

```json
{
  "projectName": "my-project",
  "collections": {
    "wiki": "my-project-wiki",
    "raw": "my-project-wiki-raw"
  },
  "hooksPath": "templates/githooks"
}
```

- `projectName` — `index.md` 헤더에 표시(없으면 생략).
- `collections` — QMD 컬렉션 이름(기본값은 레포 폴더 이름에서 파생; 유일한 이름이 중요 — 충돌하면 프로젝트 간 검색이 조용히 상호 오염된다).
- `hooksPath` — 설정하면 `init`이 `githooks/` 복사본을 만들지 않는다; 레포가 그 경로를 직접 쓴다(자체 훅 소스를 벤더하는 레포용).

`LLM_WIKI_ROOT=/path/to/doc-parent`로 레포 밖의 `doc/`을 가리킬 수도 있다.

**git 워크트리:** 보드는 브랜치 자원이 아니라 프로젝트 자원이다 — 링크 워크트리가 몇 개든 카드·클레임·활동 로그(`doc/kanban/`)는 한 곳, 주 워크트리의 `doc/`에 산다. `findDocRoot`가 링크 워크트리를 주 워크트리의 `doc/`로 해석한다(`git rev-parse --git-common-dir` 경유). 의도된 부작용: 부 워크트리에서 실행한 `pick`/`done`이 **주 워크트리의 파일**을 수정한다 — 그 변경은 주 워크트리에 미커밋으로 남고 거기서 커밋된다. 종전 동작(cwd 기준, 워크트리별)으로 돌리려면 `LLM_WIKI_WORKTREE_LOCAL=1`.

## 지식의 흐름

```
에이전트가 버그를 고친다
      │
      ▼  wiki-log 스킬
doc/raw/2026-07-24.md   (Case: 그라운딩 + 에러 + 수정 + 분석)
      │
      ▼  wiki-compile 스킬 (LLM이 추출·종합)
doc/wiki/patterns/foo.md   doc/wiki/antipatterns/bar.md
      │
      ▼  llm-wiki compile index
doc/wiki/index.md   + QMD 임베딩
      │
      ▼  다음 에이전트 세션
llm-wiki search "foo"   →  패턴을 읽고 같은 실수의 반복을 피한다
```

원시 로그가 정본이고 컴파일된 위키 문서는 파생물이다. `status:` 필드(`active` / `deprecated` / `superseded`)로 지식이 역사를 잃지 않고 진화한다.

## 에이전트 문서 & 스킬 동기화(보너스)

`init`은 에이전트 지시 파일을 동기로 유지하는 `pre-commit` 훅도 설치한다:

- `CLAUDE.md`(정본) 수정 → 커밋 시 `agents.md`, `GEMINI.md`가 자동 미러.
- `.agents/skills/`(정본) 수정 → `.claude/skills/`가 자동 미러.
- 사본 직접 수정은 명확한 메시지와 함께 거부된다.

이로써 하나의 정본에서 여러 에이전트 CLI를 타깃할 수 있다. 원하지 않으면 `git config core.hooksPath githooks`를 그냥 건너뛰면 된다. 복사된 스킬/훅/스크립트의 패키지 수준 갱신은 마커 계약을 따른다 — [업데이트](#업데이트) 참조.

## QMD / 시맨틱 검색

[`@tobilu/qmd`](https://github.com/tobi/qmd)는 로컬 벡터 임베딩(네트워크 없음)으로 시맨틱 검색을 제공한다. **선택** 의존성이다:

- 설치됨 → `llm-wiki search`가 grep 결과 위에 QMD 시맨틱 결과를 병합.
- 없음 → grep 전용; 정확 매칭은 여전히 완전 동작(매칭 키워드 수 랭킹 + 라인 스니펫).

grep은 항상 실행된다 — 시맨틱 검색은 대체가 아니라 보조다. 첫 사용 시 ~300 MB 임베딩 모델을 `~/.cache/qmd/models/`에 내려받는다. CUDA/빌드 이슈는 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 참조.

## 개발(이 레포)

이 레포는 자기 자신을 도그푸딩한다:

```bash
npm link          # 전역 `llm-wiki`가 이 작업 트리를 실행
llm-wiki init     # 스킬 + 스크립트를 이 레포로 동기화(마커 인식)
git config core.hooksPath templates/githooks
```

여기의 `llm-wiki.config.json`은 `"hooksPath": "templates/githooks"`를 선언해서 `init`이 `githooks/` 복사본을 만들지 않는다 — 활성 훅이 곧 정본 템플릿이다. 로드맵 상태는 [doc/improvement-plan.md](doc/improvement-plan.md), 설계 기록은 [doc/plan.md](doc/plan.md).

회귀 테스트(왕복 직렬화, 중복 제목, 카드 아닌 것 픽, 동시 쓰기)는 버려지는 보드에서 돈다 — 이 레포의 `doc/`은 절대 건드리지 않는다: `npm test`.

## 라이선스

MIT
