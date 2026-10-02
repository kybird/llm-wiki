# `glm/pick-guards` 리뷰 — pick 가드 2종 + `pick --card`

**판정: 병합 가능.**

- 날짜: 2026-09-12
- 리뷰 대상: `glm/pick-guards` (`864bc67` · `6c5e0f2` · `f3fcca8`), 기준선 `main`
- 규모: 파일 5개, +388 −35
- 판정 기준: **부주의한 호출이 보드를 바꾸는가.** 편의성·코드 미학은 기준이 아니다.
  이 브랜치는 버그 수정이 아니다 — llm-wiki는 지시대로 동작했고, 두 번의 사고는
  부주의한 호출이 부작용에 그대로 닿았기 때문에 났다.
- 수동 검증은 전부 격리된 임시 보드(`scratchpad/tb`, `tb2`, `tb3`)에서 했다.
  **sugarScan 보드(`D:\Project\sugarScan\doc\kanban`)는 한 번도 호출하지 않았다.**
  전역 `llm-wiki`가 아니라 작업 트리의 `node bin/llm-wiki.js`를 직접 실행했다 —
  npm link 상태에 결과가 좌우되지 않게 하려는 것이다.

---

## 지적 (심각도 순)

### L1 (낮음, 수정 불요) — 값이 정확히 `--help`인 플래그는 사용법 출력 + 종료 0으로 바뀐다

`bin/llm-wiki.js`의 가드는 `args.includes('--help')`로 토큰 일치를 본다. 플래그의
**값**이 정확히 `--help`인 호출은 이 검사에 걸린다.

```
$ llm-wiki card edit "카드 B" --note "--help"
사용법: llm-wiki card edit <제목> [--goal …] [--plan …] …
[exit=0]        ← 파일 해시 불변
```

가드가 없었다면 `parseArgs`가 `--help`를 독립 플래그로 읽어 `모르는 플래그: --help`로
**종료 1**로 실패했을 자리다. 즉 이 케이스에서 달라지는 것은 종료 코드(1→0)와
메시지의 정밀도뿐이고, **보드는 어느 쪽이든 바뀌지 않는다.** 판정 기준("부주의한
호출이 보드를 바꾸는가")에 걸리지 않으므로 병합을 막지 않는다.

탈출구도 실제로 동작한다 — 등호 형식은 가드에 걸리지 않고 값으로 들어간다:

```
$ llm-wiki card edit "타깃" --note=--help
Card edited: …\cards\타깃.md (note +1)
[exit=0]        ← 파일 변경됨(의도대로)
$ llm-wiki done "타깃" --result=--help
Done: …\done\타깃.md
[exit=0]
```

고치려면 값 자리와 플래그 자리를 구분하는 위치 인식 파싱이 필요한데, 보드를 바꿀 수
없는 케이스를 위해 가드를 복잡하게 만드는 쪽이 손해다. 기록만 남긴다.

### L2 (낮음, 다른 저장소 — 사람에게 넘김) — 시드 문서는 `--card`를 모른다

`templates/AGENTS.md:17`과 `skills/work-loop/SKILL.md`는 `pick --claim <name>`
일반 형태만 적는다. **틀린 설명은 없고**(그 형태는 그대로 동작한다), `--help`를
넘기는 곳도 없어 가드와 충돌하지 않는다. 다만 `--card` 계약이 없어 다음 `init`이
뿌리는 지침은 새 기능을 모른다. 낡은 지침을 뿌리는 것은 아니므로 차단 사유는 아니다.

---

## 확인한 것 — 지시받은 8개 항목

### 1. `--json`이 플래그 검증에 걸리지 않는다 — 문제없음

`bin/llm-wiki.js:76`이 `--json`/`--html`을 **걸러낸 뒤** `args`를 `rest`로 넘긴다
(`rest`를 그대로 넘긴다는 우려는 코드상 사실이 아니다). 실행으로 확인:

```
$ llm-wiki pick --json --claim probe-json
{ "schemaVersion": 1, "kind": "kanban-pick",
  "picked": { "path": "…\\cards\\카드-A.md", "title": "카드 A" }, "reason": null }
[exit=0]
$ llm-wiki board --json   → {"schemaVersion":1,"kind":"kanban-board", …  [exit=0]
$ llm-wiki board --html   → Board written: …\board.html                 [exit=0]
```

README가 문서화하고 스킬이 쓰는 경로가 살아 있다.

### 2. `--help` 가드가 플래그 값을 잡아먹지 않는다 — 지시받은 두 명령 모두 정상

```
$ llm-wiki card edit "카드 A" --note "--help 를 붙이지 마라"
✗ 모르는 플래그: --help 를 붙이지 마라 — 쓸 수 있는 플래그: --goal, --plan, …
[exit=1]        ← 해시 불변
$ llm-wiki done "카드 A" --result "pick --help 사고 재발 방지"
Done: …\done\카드-A.md
[exit=0]        ← 정상 완료. 가드가 물지 않았다
```

두 결과가 갈리는 이유는 가드가 아니라 `parseArgs`(lib/kanban-cmd.js:42)의 **기존**
규칙이다 — 다음 토큰이 `--`로 시작하면 값으로 삼키지 않는다(2026-09-09 리뷰 5-2에서
`done --result --yes`가 result='--yes'로 기록되던 결함을 막으려 넣은 것). `--note`의
값 `"--help 를 붙이지 마라"`는 `--`로 시작하므로 플래그로 읽혀 거부되고, `--result`의
값 `"pick --help 사고 재발 방지"`는 `pick`으로 시작하므로 값으로 들어간다. 이 브랜치가
만든 동작이 아니다. 경계 케이스는 L1 참조.

**판정: 과하게 물지도, 헐겁지도 않다.** 진짜 `--help`는 전부 잡고(항목 8), 값으로
들어온 `--help`가 보드를 바꾼 경우는 없다.

### 3. `card` 하위 분기까지 덮는다 — 최악의 경우가 일어나지 않는다

```
$ llm-wiki card new --help
사용법: llm-wiki card new "<제목>" [--goal …] [--ac …] [--depends a,b] [--not-before YYYY-MM-DD]   [exit=0]
$ llm-wiki card edit --help   → card edit 사용법                                                  [exit=0]
$ llm-wiki card show --help   → 사용법: llm-wiki card show <제목>                                 [exit=0]
$ ls doc/kanban/cards → 카드-B.md          ← "--help" 제목 카드가 생기지 않았다
해시 불변(changed=no)
```

`bin/llm-wiki.js:89`가 `args[0]`이 new/show/edit이면 `card <sub>` 키로 USAGE를 고른다.

### 4. `pick --card`가 게이트를 우회하지 않는다 — 여섯 경우 전부 실행 확인

임시 보드 `tb2`(wip_limits.doing=2). 각 케이스마다 `cards/ done/ superseded/
abandoned/ activity.jsonl` 전체를 sha256으로 스냅샷해 비교했다.

| 경우 | 출력 | 종료 | 파일 해시 |
|---|---|---|---|
| 의존 미충족 | `No pickable card (blocked).` / `의존자 — 의존 미충족: 선행` | 0 | 불변 |
| 남의 살아있는 클레임 | `평범1 — 클레임 중: owner-a` | 0 | 불변 |
| status review | `리뷰행 — 사람 판정 대기(review)다 — resume으로 todo에 복귀시킨 뒤 집어라` | 0 | 불변 |
| not_before 미래 | `미래 — 시작 예정: 2099-01-01 이후 (not_before)` | 0 | 불변 |
| WIP 상한 | `No pickable card (wip-limit).` / `doing WIP 상한 도달 (2/2) — 하던 카드를 먼저 종결하라.` | 0 | 불변 |
| 종결 카드 지목 | `평범2 — 이미 종결됐다 (done): …\done\평범2.md` | 0 | 불변 |

(a) 종료 코드, (b) 사람이 읽을 수 있는 차단 사유, (c) 카드 파일·activity.jsonl 불변 —
세 가지가 여섯 경우 전부에서 성립한다. **WIP 상한은 `pickGateBlock`이 아니라 분기
이전(lib/kanban-cmd.js:478)에서 걸린다** — 그래서 두 경로가 같은 검사를 공유한다.

### 5. 락 범위가 줄지 않았다

`pick`의 `withLock` 콜백(lib/kanban-cmd.js:471)이 열린 뒤 `findCard`(:485)·게이트
판정(:490)·`writeCard`·`appendActivity`까지 전부 그 안에서 돈다. 락 밖 읽기는 없다.
diff에서 `--card` 경로가 추가된 위치도 콜백 내부다. 동시 pick 빈틈이 생기지 않았다.

### 6. 클레임 만료 재집기가 `--card` 경로에서도 산다

`pickGateBlock`의 클레임 검사는 `cardObj.meta.claimed_by && !kanban.isClaimExpired(…)`
— 만료된 클레임은 통과한다. 임시 보드 `tb3`에서 `claimed_at`을 2시간 전으로 되돌려
(claim_timeout_minutes=60) 실행:

```
집힌 직후 : status: doing / claimed_by: dead-session / claimed_at: 2026-09-12T15:47-07:00
만료 처리 후: claimed_at: 2026-09-12T13:47-07:00
$ llm-wiki pick --card "만료실험" --claim fresh-session
PICKED: …\cards\만료실험.md
→ status: doing / claimed_by: fresh-session      [exit=0]
```

밤에 죽은 세션의 카드를 지정해서도 회수할 수 있다.

### 7. 배포 산출물과 어긋나지 않는다

`grep -rn "pick" templates/ skills/ AGENTS.md` 결과, 시드 문서가 적는 호출 형태는
`llm-wiki pick --claim <name>` 하나뿐이고 `--help`를 넘기는 곳은 없다. 이 형태는
`--card` 도입 후에도 종전대로 ordinal 최저를 집는다(테스트
`pick --card 없이 — 종전대로 ordinal 최저를 집는다`). work-loop의 정지 규칙이
의존하는 `"No pickable card"` 출력과 종료 코드도 불변이다. 낡은 지침을 뿌리는 상태가
아니다. 보강 필요는 L2에 적었다.

### 8. README 두 줄이 사실과 맞는다

- "exits 0 without touching the board" →
  `pick --help`, `pick -h` 모두 사용법만 출력, `[exit=0]`, 해시 불변. 확인.
- "an unknown title fails (exit 1)" →
  `✗ --card 대상 카드를 못 찾았다: 없는 카드 — board로 제목을 확인하라.` `[exit=1]`,
  해시 불변. 확인.

---

## 지시받은 제약 — 지켜졌는지

| 제약 | 결과 |
|---|---|
| 기존 게이트 우회 없음, `--card`는 우선권 아닌 지정 | **지켜짐** (항목 4, 여섯 경우 실행 확인) |
| `--card` 없으면 종전대로 ordinal 최저 | **지켜짐** (항목 4·7) |
| 제목 매칭은 `kanban.findCard` 규칙 그대로 | **지켜짐** — `kanban.findCard(paths, wantTitle)` 단일 호출, 새 매칭 규칙 없음 |
| 전 과정이 기존 `kanban.withLock` 안 | **지켜짐** (항목 5) |
| activity `claimed` 형태 유지, `--json` 스키마 유지 | **지켜짐** — `{action:'claimed', title, actor}` 불변, `{schemaVersion:1, kind:'kanban-pick', picked, reason}` 불변(항목 1 출력) |
| `validateFlags` spec에 실제로 읽는 플래그만 | **지켜짐** — 7개 spec의 모든 키가 코드에서 읽히는 것과 1:1 (`claim`/`card`, `question`, `result`, `by`, `reason`+`no-raw-log`, `why`+`reason`, `note`). 임의 추가 없음 |
| 카드 포맷·sentinel·ACTIVE_STATUSES·상태 전이·클레임 만료·findDocRoot 불변 | **지켜짐** — diff에 해당 영역 변경 없음 |
| npm 버전 올리지 않음, package.json은 scripts.test만 | **지켜짐** — `"version": "0.2.3"` 그대로, 변경은 test 목록 한 줄 |
| 작업 브랜치에 `doc/` 커밋 안 함 | **지켜짐** — 3커밋 어디에도 `doc/` 없음 |

## 행동 변화 2건 — 검토 결과 의도된 것으로 수용

값 없는 `pick --claim`(예전 `unnamed-agent` 폴백)과 값 없는 `resume --note`(예전 기본
문구 폴백)가 이제 실패한다. 오타(`--clam x`)와 구분되지 않는 조용한 폭주를 막는
변화이고, 값을 주는 기존 호출은 전부 불변이다. 시드 문서·스킬이 값 없는 형태를 쓰는
곳은 없다(항목 7). 판정 기준에 부합하므로 수용한다.

## 테스트

`npm test` 전문 — 48종 전부 통과 (기존 37 + 신규 11).

```
> @kybird/llm-wiki@0.2.3 test
> node --test test/roundtrip.test.js test/kanban-write.test.js test/kanban-pick-guards.test.js test/kanban-wait.test.js test/find-doc-root-worktree.test.js test/auto-update.test.js

✔ 버전이 바뀌면 다음 명령이 사본을 자동 갱신하고 스탬프를 찍는다 (436.8592ms)
✔ 멱등 — 같은 버전의 두 번째 명령은 다시 쓰지 않는다 (654.9608ms)
✔ 옵트아웃 — autoUpdate:false면 건드리지 않는다 (304.7074ms)
✔ init된 적 없는 디렉터리는 아무것도 쓰지 않는다 (1232.9594ms)
✔ stampPath — 같은 루트는 같은 스탬프, 다른 루트는 다른 스탬프 (1.967ms)
✔ 주 워크트리에서 호출 → 주 워크트리 doc (129.0004ms)
✔ 링크 워크트리에서 호출 → 주 워크트리 doc (이번 수정의 핵심) (115.3941ms)
✔ LLM_WIKI_WORKTREE_LOCAL=1 → 링크 워크트리 자기 doc (옵트아웃, 종전 동작) (2.0525ms)
✔ pick --help/-h — 사용법만 출력하고 카드 파일과 activity 로그를 한 글자도 바꾸지 않는다 (1205.5346ms)
✔ handoff/done/supersede/abandon/reopen/resume/card --help — 명령이 실행되지 않는다 (2222.3349ms)
✔ wait --help — 대기에 들어가지 않고 사용법을 찍고 종료 코드 0으로 나간다 (237.561ms)
✔ 모르는 플래그 — 일곱 명령이 각각 실패하고 카드 파일과 activity 로그가 그대로다 (1695.0406ms)
✔ 값 없는 필수 플래그 — pick --claim·resume --note도 조용히 넘어가지 않는다 (771.3398ms)
✔ pick --card — 의존 미충족 카드를 집지 않고 이유를 낸다 (516.7895ms)
✔ pick --card — 남이 클레임 중인 카드를 집지 않는다 (806.1732ms)
✔ pick --card — 없는 제목이면 실패하고 아무 파일도 바뀌지 않는다 (462.5173ms)
✔ pick --card — ordinal 최저가 아닌 카드를 지목해 집는다 (--json 스키마 동일) (739.1946ms)
✔ pick --card — review·not_before·종결·WIP 상한 게이트도 그대로 막힌다 (2981.0089ms)
✔ pick --card 없이 — 종전대로 ordinal 최저를 집는다 (646.492ms)
✔ 진입 검사 — --since 이후 이벤트가 이미 있으면 기다리지 않고 즉시 0 (250.9435ms)
✔ 대기 중 이벤트 추가 — activity.jsonl이 통째로 다시 쓰여도 깨어나 0으로 종료한다 (617.2132ms)
✔ 타임아웃 — 2로 종료하고 stdout에 아무것도 출력하지 않는다 (1316.4712ms)
✔ 필터 — --for done일 때 handoff 이벤트로는 깨어나지 않는다 (1223.1932ms)
✔ 깨진 줄 — JSON 아닌 줄(병합 충돌 마커 포함)은 건너뛰고 유효한 줄만 본다 (237.8367ms)
✔ 파일 부재 — activity.jsonl이 없어도 죽지 않고 생기면 깨어난다 (466.9951ms)
✔ stall — 무활동이 --stall-min을 넘으면 0으로 종료한다 (소수 분 허용) (187.3463ms)
✔ stall — 대기 중 새 이벤트는 마감을 미룬다 (8057.5909ms)
✔ 인자 검증 — 모르는 플래그·잘못된 --for/--since/--timeout은 1로 실패한다 (791.0744ms)
✔ 섹션 하이재크 — Notes에 ## Goal을 넣어도 본문이 살아있고 Goal이 보존된다 (5-1-2) (705.2067ms)
✔ 중복 제목 — 종결 카드와 같은 제목 재생성이 거부된다 (5-1-3) (1210.1561ms)
✔ pick 비카드 — cards/의 비카드 .md를 집지 않고 내용을 훼손하지 않는다 (5-1-4) (508.2549ms)
✔ 동시 done 경쟁 — 정확히 하나만 성공하고 이중 상태가 없다 (5-2 락 전면화) (467.6586ms)
✔ renew-claim — 만료된 클레임 갱신이 거부된다 (5-2) (921.676ms)
✔ 락 점유 중 변이는 거부된다 — 콜백 안 fail도 락을 반납한다 (1561.5944ms)
✔ card edit — 모르는 플래그·값 없는 플래그·플래그 없음은 실패하고 파일이 불변이다 (결함 A) (872.7704ms)
✔ card edit — 성공 출력이 실제로 무엇이 바뀌었는지 말한다 (결함 A) (717.4332ms)
✔ card edit — depends_on 추가·제거가 파일에 반영된다 (결함 B) (1423.9246ms)
✔ 의존성 검증 — 없는 카드·자기 자신·순환은 거부된다 (card new/edit 같은 규칙) (1834.7397ms)
✔ 종결 카드를 의존성으로 넣는 것은 허용된다 — pick의 resolved 판정과 일치 (1065.0421ms)
✔ 레거시 끊어진 의존성은 card edit --remove-depends로 정리된다 (435.6659ms)
✔ 스칼라 왕복 — 배열 모양/따옴표 모양 문자열이 문자열로 남는다 (5.6858ms)
✔ 비대칭 따옴표는 박리되지 않고 원문 그대로 (0.5473ms)
✔ 배열 왕복 — 원소의 쉼표·괄호가 분해되지 않는다 (2.6342ms)
✔ 레거시 비인용 배열 [a, b]도 여전히 파싱된다 (0.9908ms)
✔ statuses 파싱이 행내 주석의 ]에 오염되지 않는다 (12.4435ms)
✔ Notes 안의 ## Goal 줄이 섹션 경계로 오인되지 않는다 (2.7379ms)
✔ AC 센티넬 안 비-AC 줄이 왕복에서 소실되지 않는다 (5-2) (1.4603ms)
✔ isClaimExpired — 만료된 클레임 판정 (1.4781ms)
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13447.1429
```

**테스트가 덮지 못한 구멍**: 8개 항목 중 실패한 것은 없다. 다만 스위트가 직접
덮지 않는데 수동으로 확인한 경로가 셋 있다 — `--json`/`--html`이 가드와 플래그
검증을 통과하는 경로(항목 1), 클레임 만료 후 `--card` 재집기(항목 6),
`card new/edit/show --help`가 하위 분기 사용법을 내는 것(항목 3, 스위트는
`card --help`만 덮는다). 셋 다 통과했으므로 결함이 아니라 **커버리지 공백**으로
기록한다. L1의 경계 케이스도 테스트에 없다.

## 확인 못 함

- `board video`(Remotion 렌더) 경로는 실행하지 않았다. 이번 diff가 건드리지 않는
  영역이지만 `--help` 가드가 `board`에 걸리므로 `board video --help`는 전체
  board 사용법을 낸다 — 렌더를 시작하지 않는다는 것은 코드로만 확인했고 실행
  검증은 안 했다.
- 실제 동시 pick 경쟁(두 프로세스 동시 실행)은 `--card` 경로에서 재현하지 않았다.
  락 범위를 코드로 확인했고(항목 5) 기존 동시성 테스트가 통상 경로를 덮는다.

---

## 마무리 결과 (사람 결정 반영, 2026-09-12)

아래 "사람이 정해야 할 것"은 결정을 받아 처리됐다. 결정 내용과 실제 결과:

| 항목 | 결정 | 결과 |
|---|---|---|
| 버전 | 0.3.0으로 올린다 | **완료** — `npm version 0.3.0` (커밋 `d3e0770`, 태그 `v0.3.0`), 48종 재통과 후 푸시 |
| publish | 게시한다 | **완료** — `@kybird/llm-wiki@0.3.0` 게시됨. 아래 검증 참조 |
| 브랜치 삭제 | llm-wiki 것만 지운다 | **완료** — `glm/pick-guards` 로컬·origin 양쪽 삭제(병합 확인 후 `-d`) |
| sugarScan | llm-wiki **사용자**다 | 건드리지 않음 — 문서 갱신은 그쪽 몫으로 넘김 |

**publish 경위**: 에이전트 환경의 npm은 인증돼 있지 않았다(`npm whoami` → `E401`,
`npm publish` → `E404 Not Found - PUT .../@kybird%2fllm-wiki`). 이 404는 "없다"가
아니라 **"권한이 없다"**의 겉보기 404 — 이 위키의 [[npm-scoped-publishing]]이 적어
둔 함정 그대로다. 로그인은 2FA 웹 플로우라 사람이 수행했고, 게시는 성공했다.

### 게시본 검증 (레지스트리에서 재설치해 실행)

무엇을 올렸는지가 아니라 **올라간 것이 무엇인지**를 확인했다.

```
$ npm view @kybird/llm-wiki version dist.shasum
version    = '0.3.0'
dist.shasum = 'b927c82aaf10c6cf48b80997fb0436d17eb52da7'   ← 게시 전 npm pack 값과 동일
```

셔섬이 일치하므로 게시된 바이트는 위에서 검증한 타르볼과 같다. 그 위에서 두 사고를
**레지스트리 설치본으로** 재현 시도했다(임시 보드, 검증 후 삭제):

```
$ npm install @kybird/llm-wiki@0.3.0   → 0.3.0

$ llm-wiki pick --help
사용법: llm-wiki pick [--claim <이름>] [--card "<제목>"] — --card 없으면 ordinal 최저를 집는다
[exit=0]        ← 보드 해시 불변. 사고 1 재현 불가

$ llm-wiki handoff "<카드>" --question "q?" --card "X"
✗ 모르는 플래그: --card — 쓸 수 있는 플래그: --question
[exit=1]        ← 보드 해시 불변. 사고 2 재현 불가

$ llm-wiki pick --card "<카드>" --claim verify
PICKED: …\cards\실보드-모사-카드.md  (status: doing / claimed_by: verify)
[exit=0]        ← 정상 경로는 살아있다
```

**남은 한 단계는 소비자 쪽이다**: sugarScan의 전역 설치가 갱신되기 전까지 그쪽은
여전히 0.2.2 동작이다(`pick --help`가 카드를 집는다). 전역 갱신 후에야 가드가 실제로
보호한다.

---

## 사람이 정해야 할 것 (원본 — 위에서 해소됨)

### 1. npm 버전과 publish — 혼자 하지 않았다

현재 `package.json`은 **0.2.3**이고 npm에 게시된 최신은 **0.2.2**다. 즉 0.2.3은
아직 한 번도 게시되지 않았고, 그 안에 이미 `wait` 명령(`16e7eb9`)이 들어 있다.
이 브랜치는 지시대로 버전을 올리지 않았다.

**게시하지 않으면 sugarScan의 전역 `llm-wiki`는 여전히 0.2.2의 옛 동작이다** —
`pick --help`가 카드를 집고, `pick --card`가 조용히 무시된다. 이 작업이 막으려던
두 사고가 sugarScan에서 그대로 다시 날 수 있다. 가드가 실제로 보호하려면 게시와
전역 설치 갱신이 필요하다.

권장 버전: **0.3.0**. 0.2.3을 그대로 게시해도 되지만, 값 없는 `--claim`/`--note`의
조용한 폴백 제거는 호출자에게 보이는 동작 변화라 마이너 범프가 정직하다.

publish는 공개 배포이고 되돌릴 수 없으므로 **결정을 넘긴다.**

### 2. 브랜치 삭제 여부

`glm/pick-guards`는 로컬과 origin 양쪽에 있다. 병합 후 지울지 넘긴다.

### 3. 다른 저장소 — sugarScan 문서 갱신 (내가 건드리지 않았다)

`sugarScan` 저장소의 `docs/GLM_TASKS.md`와 `AGENTS.md`가 pick 사용법을 적고 있다.
`--card`가 생겼으므로 갱신 대상이다. 다른 저장소이므로 손대지 않았다. 넘긴다.
