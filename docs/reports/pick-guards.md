# pick 가드 2종 + `pick --card` — 작업 보고

- 날짜: 2026-09-12
- 브랜치: `glm/pick-guards` (main에서 분기)
- 커밋: `864bc67` (가드 1) · `6c5e0f2` (가드 2) · `f3fcca8` (pick --card)
- 성격: **버그 수정이 아니다.** 2026-09-11·12의 두 사고는 도구가 지시대로 동작한
  결과다. 이 작업의 목적은 부주의한 호출이 보드를 바꾸지 못하게 막는 것이다.
  설계 기준은 언제나 "부주의한 호출이 보드를 바꾸는가"였다.

## 사고 재인용 (왜 이 작업이 있는가)

1. **사고 1 (09-11, 09-12 두 번)** — 에이전트가 `pick --help`를 옵션 확인용으로
   실행했다. `--help`는 서브커맨드 자리에서만 처리돼 `pick`이 실제로 돌았고,
   엉뚱한 카드에 클레임이 찍혀 handoff로 반납해야 했다. 첫 사고가 REVIEW 카드에
   기록돼 있었는데도 다음 세션이 반복했다.
2. **사고 2 (09-12)** — 존재하지 않는 `pick --card` 플래그가 검증 없이 위임
   프롬프트에 들어갔다. 받은 쪽이 그대로 실행했고 `--card`는 무시돼 다른 카드가 집혔다.

## 바꾼 파일

| 파일 | 변경 |
|---|---|
| `bin/llm-wiki.js` | 가드 1: 알려진 서브커맨드의 args에 `--help`/`-h`가 있으면 사용법만 출력하고 종료 코드 0으로 나간다(자동 업데이트 블록보다 앞 — 도움말은 리포를 건드릴 이유가 없다). printUsage의 pick 줄에 `--card` 반영. |
| `lib/kanban-cmd.js` | `USAGE` 맵 신설 — 각 명령 fail()이 쓰던 사용법 문자열 10개를 한 곳으로 모으고 fail()이 참조. 가드 2: 일곱 명령 `*_FLAGS` 상수 + `validateFlags` 호출. `pick --card`: `pickGateBlock()` 헬퍼 + 지정 집기 경로. 모듈 헤더 주기에 `--card` 반영. |
| `test/kanban-pick-guards.test.js` | 신규 — 임시 보드 종단간 테스트 11건(kanban-write.test.js와 같은 방식). |
| `package.json` | `scripts.test`에 위 파일 추가. 버전 올림 없음(0.2.3 그대로). |
| `README.md` | Commands 표의 pick 줄에 `--card` 계약 추가, `--help`·모르는 플래그 거부 계약 한 문단. |

## 가드 1 — 탐색용 호출이 보드를 바꾸지 못하게

- **위치**: `bin/llm-wiki.js`, `args` 계산 직후·`maybeAutoUpdate` 블록보다 앞.
  스위치 디스패치보다 먼저라 어떤 부작용 코드에도 닿지 않는다.
- **범위**: 알려진 서브커맨드 15개 전부(search, compile, lint, init, skills, board,
  card, pick, handoff, done, supersede, abandon, reopen, resume, wait). `card`는
  `args[0]`이 new/show/edit이면 그 하위 명령의 사용법을 낸다.
- **종료**: `process.exit(0)`이 아니라 모듈 `return`(자연 종료) — Windows 파이프
  stdout은 비동기라 exit이 마지막 줄을 지울 수 있다(kanban-wait의 실측 교훈).
- **사용법 문자열 단일화**: lib/kanban-cmd.js의 `USAGE` 맵 한 곳. fail(인자 오류)과
  bin의 가드가 같은 문자열을 참조한다 — 두 군데로 갈라지면 어느 한쪽만 갱신돼
  거짓 사용법을 가르친다. 전용 문자열이 없는 읽기 전용 명령(search 등)은 전체
  사용법(printUsage)으로 대신한다.

## 가드 2 — 일곱 명령 FLAGS spec

`validateFlags`는 기존 것(lib/kanban-cmd.js)을 그대로 쓰고, spec은 **코드가 지금
실제로 읽는 플래그만** 담았다. 새 플래그를 임의로 추가하지 않았다.

| 명령 | 플래그 spec | 근거 (읽는 코드) |
|---|---|---|
| `pick` | `claim: string`, `card: string`† | `flags.claim`(claim 이름), `flags.card`(지정 제목) |
| `handoff` | `question: string` | `flagString(flags.question)` |
| `done` | `result: string` | `flagString(flags.result)` |
| `supersede` | `by: string` | `stringArray(flags.by)` (쉼표 목록) |
| `abandon` | `reason: string`, `no-raw-log: flag` | `flagString(flags.reason)`, `flags['no-raw-log']` |
| `reopen` | `why: string`, `reason: string` | `flagString(flags.why) \|\| flagString(flags.reason)` — 별칭 허용은 기존 동작 |
| `resume` | `note: string` | `flags.note` |

† `card`는 커밋 3(f3fcca8)에서 추가. 커밋 2 시점 spec은 `claim`만.

호출 위치는 각 명령의 필수 인자 검증 바로 뒤, `withLock` 진입 전(card new/edit과
같은 순서 — 파일을 건드리기 전에 검증).

**행동 변화 2건(조용한 폴백 제거, 의도된 것)**: 값 없는 `pick --claim`(예전:
'unnamed-agent'로 폴백)과 값 없은 `resume --note`(예전: 기본 문구로 폴백)은 이제
"값이 없다"로 실패한다. 오타(`--clam x`)와 구분되지 않는 조용한 폭주를 막는
것이며, 위키 [[agent-cli-contract]]이 2026-09-10 잔여 갭으로 지목하던 바로 그
길이다. 나머지 다섯 명령의 값 없는 필수 플래그는 기존에도 이미 실패했다(변화 없음).

## pick --card — 지정 집기

- **게이트 우회 없음**: `pickGateBlock()`이 통상 pick 후보 판정과 같은 순서
  (종결/비활성 → review → not_before → 살아있는 클레임 → todo 의존)로 지정 카드
  한 장을 판정한다. 하나라도 걸리면 `{picked: null, reason: 'blocked', detail:
  "<제목> — <사유>"}` — 파일을 그대로 두고 무엇이 막았는지 출력한다. 종료 코드 0은
  통상 pick의 "No pickable card" 보고 계약과 동일(work-loop 스킬의 정지 규칙이
  기대하는 형태).
- **없는 제목**: 인자 오류로 실패(종료 1) — 명시적으로 지목한 카드가 없다는 것은
   호출자의 잘못된 전제다.
- **매칭**: `kanban.findCard` 규칙 그대로(frontmatter title 정확 일치 → 슬러그
  폴백). 새 매칭 규칙 없음.
- **락**: 지정 경로도 기존 `kanban.withLock(BOARD_LOCK_NAME)` 안에서 후보
  판정→클레임→쓰기까지 전부 돈다. 락 밖 읽기 없음.
- **로그·출력**: activity `claimed` 이벤트 기존 형태 그대로(title+actor).
  `--json`은 동일 스키마(`{schemaVersion: 1, kind: 'kanban-pick', picked, reason}`).
- **`--card` 없는 호출**: ordinal 최저 — 기존 코드 경로를 그대로(루프 본문은
  들여쓰기만 바뀜). work-loop가 기대는 형태 불변.

## npm test 출력 전문

```
> @kybird/llm-wiki@0.2.3 test
> node --test test/roundtrip.test.js test/kanban-write.test.js test/kanban-pick-guards.test.js test/kanban-wait.test.js test/find-doc-root-worktree.test.js test/auto-update.test.js

✔ 버전이 바뀌면 다음 명령이 사본을 자동 갱신하고 스탬프를 찍는다 (350.8633ms)
✔ 멱등 — 같은 버전의 두 번째 명령은 다시 쓰지 않는다 (376.9522ms)
✔ 옵트아웃 — autoUpdate:false면 건드리지 않는다 (150.2765ms)
✔ init된 적 없는 디렉터리는 아무것도 쓰지 않는다 (734.3544ms)
✔ stampPath — 같은 루트는 같은 스탬프, 다른 루트는 다른 스탬프 (1.6907ms)
✔ 주 워크트리에서 호출 → 주 워크트리 doc (54.0805ms)
✔ 링크 워크트리에서 호출 → 주 워크트리 doc (이번 수정의 핵심) (63.8117ms)
✔ LLM_WIKI_WORKTREE_LOCAL=1 → 링크 워크트리 자기 doc (옵트아웃, 종전 동작) (1.4358ms)
✔ pick --help/-h — 사용법만 출력하고 카드 파일과 activity 로그를 한 글자도 바꾸지 않는다 (800.6118ms)
✔ handoff/done/supersede/abandon/reopen/resume/card --help — 명령이 실행되지 않는다 (1237.5205ms)
✔ wait --help — 대기에 들어가지 않고 사용법을 찍고 종료 코드 0으로 나간다 (114.2495ms)
✔ 모르는 플래그 — 일곱 명령이 각각 실패하고 카드 파일과 activity 로그가 그대로다 (835.1116ms)
✔ 값 없는 필수 플래그 — pick --claim·resume --note도 조용히 넘어가지 않는다 (417.1551ms)
✔ pick --card — 의존 미충족 카드를 집지 않고 이유를 낸다 (481.4642ms)
✔ pick --card — 남이 클레임 중인 카드를 집지 않는다 (425.212ms)
✔ pick --card — 없는 제목이면 실패하고 아무 파일도 바뀌지 않는다 (301.178ms)
✔ pick --card — ordinal 최저가 아닌 카드를 지목해 집는다 (--json 스키마 동일) (410.3845ms)
✔ pick --card — review·not_before·종결·WIP 상한 게이트도 그대로 막힌다 (1959.062ms)
✔ pick --card 없이 — 종전대로 ordinal 최저를 집는다 (386.3387ms)
✔ 진입 검사 — --since 이후 이벤트가 이미 있으면 기다리지 않고 즉시 0 (252.0085ms)
✔ 대기 중 이벤트 추가 — activity.jsonl이 통째로 다시 쓰여도 깨어나 0으로 종료한다 (575.0878ms)
✔ 타임아웃 — 2로 종료하고 stdout에 아무것도 출력하지 않는다 (1130.83ms)
✔ 필터 — --for done일 때 handoff 이벤트로는 깨어나지 않는다 (1118.128ms)
✔ 깨진 줄 — JSON 아닌 줄(병합 충돌 마커 포함)은 건너뛰고 유효한 줄만 본다 (132.242ms)
✔ 파일 부재 — activity.jsonl이 없어도 죽지 않고 생기면 깨어난다 (455.3958ms)
✔ stall — 무활동이 --stall-min을 넘으면 0으로 종료한다 (소수 분 허용) (138.4505ms)
✔ stall — 대기 중 새 이벤트는 마감을 미룬다 (8060.5713ms)
✔ 인자 검증 — 모르는 플래그·잘못된 --for/--since/--timeout은 1로 실패한다 (611.8806ms)
✔ 섹션 하이재키 — Notes에 ## Goal을 넣어도 본문이 살아있고 Goal이 보존된다 (5-1-2) (520.4245ms)
✔ 중복 제목 — 종결 카드와 같은 제목 재생성이 거부된다 (5-1-3) (629.1719ms)
✔ pick 비카드 — cards/의 비카드 .md를 집지 않고 내용을 훼손하지 않는다 (5-1-4) (315.315ms)
✔ 동시 done 경쟁 — 정확히 하나만 성공하고 이중 상태가 없다 (5-2 락 전면화) (359.7477ms)
✔ renew-claim — 만료된 클레임 갱신이 거부된다 (5-2) (377.029ms)
✔ 락 점유 중 변이는 거부된다 — 콜백 안 fail도 락을 반납한다 (791.5698ms)
✔ card edit — 모르는 플래그·값 없는 플래그·플래그 없음은 실패하고 파일이 불변이다 (결함 A) (598.283ms)
✔ card edit — 성공 출력이 실제로 무엇이 바뀌었는지 말한다 (결함 A) (593.5295ms)
✔ card edit — depends_on 추가·제거가 파일에 반영된다 (결함 B) (787.798ms)
✔ 의존성 검증 — 없는 카드·자기 자신·순환은 거부된다 (card new/edit 같은 규칙) (1051.2636ms)
✔ 종결 카드를 의존성으로 넣는 것은 허용된다 — pick의 resolved 판정과 일치 (737.9318ms)
✔ 레거시 끊어진 의존성은 card edit --remove-depends로 정리된다 (321.3847ms)
✔ 스칼라 왕복 — 배열 모양/따옴표 모양 문자열이 문자열로 남는다 (4.2237ms)
✔ 비대칭 따옴표는 박리되지 않고 원문 그대로 (0.3839ms)
✔ 배열 왕복 — 원소의 쉼표·괄호가 분해되지 않는다 (2.3705ms)
✔ 레거시 비인용 배열 [a, b]도 여전히 파싱된다 (1.6538ms)
✔ statuses 파싱이 행내 주석의 ]에 오염되지 않는다 (9.6917ms)
✔ Notes 안의 ## Goal 줄이 섹션 경계로 오인되지 않는다 (2.7624ms)
✔ AC 센티넬 안 비-AC 줄이 왕복에서 소실되지 않는다 (5-2) (1.4213ms)
✔ isClaimExpired — 만료된 클레임 판정 (1.2495ms)
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12667.3323
```

기존 37종 + 신규 11종 = 48종 전부 통과.

## 수동 검증 — 임시 보드

전역 llm-wiki는 npm link로 이 작업 나무를 본다(가드가 발동한 것 자체가 증명 —
출시된 0.2.3에는 없는 동작). 임시 보드: `C:/Users/admin/AppData/Local/Temp/tmp.6vk365kwNH/doc`
(검증 후 삭제). **sugarScan 보드는 한 번도 호출하지 않았다.**

```
$ export LLM_WIKI_ROOT="C:/Users/admin/AppData/Local/Temp/tmp.6vk365kwNH/doc"   # 임시 보드
$ llm-wiki card new "가드 실험 A" --goal "가드 확인" --ac "AC1"   → 생성, ordinal 1000 [exit=0]
$ llm-wiki card new "가드 실험 B" --goal "가드 확인"              → 생성, ordinal 2000 [exit=0]

$ llm-wiki pick --help
사용법: llm-wiki pick [--claim <이름>] [--card "<제목>"] — --card 없으면 ordinal 최저를 집는다
[exit=0]        ← activity.jsonl 2줄 → 2줄 불변, 카드 안 집힘 (pick -h 동일)

$ llm-wiki pick --card "가드 실험 B" --claim glm-test
PICKED: ...\cards\가드-실험-B.md          ← ordinal 2000 (최저 아님)을 지목해 집음
  status: doing / claimed_by: glm-test    [exit=0]

$ llm-wiki pick --card "가드 실험 B" --claim other
No pickable card (blocked).
  가드 실험 B — 클레임 중: glm-test        [exit=0]   ← 남의 클레임, 파일 불변

$ llm-wiki pick --card "없는 카드"
✗ --card 대상 카드를 못 찾았다: 없는 카드 — board로 제목을 확인하라.  [exit=1]

$ llm-wiki handoff "가드 실험 A" --question "q?" --card "X"
✗ 모르는 플래그: --card — 쓸 수 있는 플래그: --question  [exit=1]   ← 사고 2의 정확한 형태 차단

$ llm-wiki pick --claim t
PICKED: ...\cards\가드-실험-A.md           ← --card 없으면 종전대로 ordinal 최저(1000)
```

## 건드리지 않고 남긴 것

- 카드 파일 포맷과 sentinel 주석(`kanban:goal:begin` 등) — 직렬화 코드 일절 불변.
- `ACTIVE_STATUSES`, 상태 전이 규칙, 클레임 만료 규칙(`isClaimExpired`), WIP 판정.
- `findDocRoot` 및 워크트리 동작(최근 8a9c599 수정 영역).
- `parseArgs`/`validateFlags` 본체 — 재사용만 했다. kanban-wait의 플래그 검증도 그대로.
- work-loop 스킬·templates/AGENTS.md — `pick --claim <name>` 일반 형태만 쓰며
  `--help`를 넘기는 곳이 없어 충돌 없음(사전 확인). "No pickable card" 정지
  규칙이 의존하는 출력·종료 코드도 불변.
- npm 버전(0.2.3)·publish — 안 함. doc/ — 이 브랜치에 커밋 안 함(본 보고서 포함).

## 막힌 것

없다 — 판단 중단 조건(work-loop·시드 문서 충돌, 게이트 규칙 충돌, 기존 테스트
깨짐)은 어느 것도 발생하지 않았다.

판단한 것 2건(사람이 뒤집을 여지, 기록):

1. **게이트 차단 시 종료 코드 0** — 통상 pick의 "No pickable card" 계약과
   맞췄다(지정 집기도 보고 후 정상 종료). 없는 제목만 1. 1로 통일하길 원하면
   `pickGateBlock` 반환 경로의 exit code가 아니라 pick의 json/출력 계약을
   함께 손봐야 한다.
2. **값 없는 `--claim`/`--note` 실패 처리** — 가드 2의 조용한 폴백 제거(위 참고).
   기존 호출(값 있는 형태)은 전부 불변이다.
