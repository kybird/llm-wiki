# AGENTS.md

이 레포는 llm-wiki 자신을 도그푸딩한다. **파일이 정본** — 서버·DB 없음. CLI만이 카드를 쓴다.

## 작업 시작 전 (매 세션, 무조건)
- `llm-wiki search "<키워드>"` — 같은 벽을 다시 치지 않게. 실제 에러 메시지 문자열로 검색한다.
- `llm-wiki board` — 관련 카드가 이미 있는지. 카드 제목이 곧 식별자다(번호 없음).
- 설계 판단이 필요하면 doc/plan.md를 먼저 읽는다 — **[확정]은 뒤집지 않는다.**

## 계획과 실행의 분리
- 계획 = `kanban-plan` 스킬: 카드 1장 = 컨텍스트 1개 = 커밋 1개, 자식은 엄격히 더 작게, 깊이 ≤ 3.
- 2장 이상으로 갈라지는 계획은 **마일스톤 카드로 묶는다**(`--kind milestone`, 멤버는 `--milestone`) — 목적 축은 유도되고 손으로 끝내지 않는다(plan.md 3.8). 소속은 계획 시점에 봉인된다(2026-09-21): 진행 중 마일스톤에 추가는 `--scope-amend "<사유>"`가 있어야 통과하는 범위 변경이고, 인터럽트(follow-up·사용자 요청·버그)는 무소속 todo 백로그로 — 아침 의식이 새 마일스톤·범위 변경·abandon 셋 중 하나로 정리한다.
- 무인 실행 = `work-loop` 스킬: pick → done/handoff/abandon. 정지 규칙에서 report + video 남긴다.
- 준비 안 된 카드는 게이트: 시간은 `--not-before`, 관측 조건은 `handoff` → 충족 근거가 오면 `resume`.

## 밤샘 작업 — 쿼터 워치독 (2026-09-24 이식)
- 밤샘 무인 실행을 시작하는 세션은 `.zcode/overnight/TASK.md` 규약을 밟는다(work-loop 스킬에 같은 규칙): 시작 시 status `running` + "현재 작업"·"resume 지침"(체크포인트=진행 중 카드+활동 로그), 카드/단계마다 `.zcode/overnight/heartbeat.txt`에 시각 한 줄 append, 종료 시 `done`. 상세는 TASK.md 사용 규칙 섹션.
- 워치독 자동화(21:00~09:00, 15분 주기)가 이 워크스페이스에 등록되어 있다. **발사 성공 자체가 쿼터 생존 신호** — 쿼터 소진 중엔 발사가 모델 호출에서 실패(비용 0), 복구 후 첫 성공 발사가 stale heartbeat(20분+)를 보고 CLAIM+10분 재확인 뒤 resume 지침대로 인계한다.
- 전파 단위: 자동화는 워크스페이스 귀속이라 **소비 레포는 각자 자가등록해야 한다** — work-loop 스킬(v12+)의 부트스트랩이 첫 밤샘 실행 시 등록+제어 파일 스캐폴딩을 수행한다(스킬 prompt가 소비 레포에 닿는 유일한 채널 — 소비 레포 AGENTS.md는 건드리지 않는 규약). 이 레포의 등록(automation-7848ae37)은 도그푸드 실증.
- 전제: ZCode 앱이 켜져 있고 밤샘 작업도 이 워크스페이스에서 돌아야 한다. "언제 끝나도 되는" 작업은 OffPeak 태스크(플랜 쿼터 미소모)가 근본 해결 — 워치독은 "오늘 밤 안에" 끝내야 하는 작업용.

## 워크트리 — 보드는 프로젝트 자원
- **보드는 프로젝트 자원이지 브랜치 자원이 아니다.** 워크트리가 몇 개든 카드와 클레임과 활동 로그(`doc/kanban/`)는 주 워크트리 한 곳에 있다 — `findDocRoot`가 링크 워크트리 안에서도 주 워크트리의 `doc/`로 향한다(2026-09-12 sugarScan 실측 결함 수습).
- 부작용(의도한 동작, 버그 아님): 부 워크트리에서 실행한 pick/done이 **주 워크트리의 파일**을 수정한다. 그 변경은 주 워크트리에 미커밋 상태로 남고 거기서 커밋된다.
- 종전 동작(워크트리 각자의 doc/)으로 돌리려면 `LLM_WIKI_WORKTREE_LOCAL=1` — 자세한 것은 TROUBLESHOOTING.md.

## 배포 (npm) — 항상 참조
- 패키지: **`@kybird/llm-wiki`** (스코프 — `llm-wiki`는 선점됨).
- 배포: `npm version minor && npm publish --access public` → 브라우저 웹 인증.
  스코프는 기본이 **비공개**라 플래그를 빼면 성공 출력이 나도 외부엔 404다.
- 사용자 레포 반영: npm update만 하면 된다 — 다음 명령이 버전 스탬프(~/.llm-wiki/auto-update,
  lib/auto-update.js)를 보고 사본을 자동 동기화한다. 옵트아웃 config `autoUpdate: false`.
- 스킬 프롬프트 반복 수정은 git 채널(skills add/sync) — publish와 분리가 원칙(6.2).

## 문서 지도
- 설계: `doc/plan.md` · 실행 계획: `doc/improvement-plan.md` · 비교 분석: `doc/refs-comparison.md`
- 지식 흐름: `doc/raw/`(일일 로그, wiki-log) → `doc/wiki/`(컴파일, wiki-compile) → search
- 보드: `doc/kanban/` 카드가 정본 · `llm-wiki monitor`(읽기 전용 실시간 뷰)·`board-timelapse.mp4`는 유도물
- qmd/CUDA 빌드 이슈: `TROUBLESHOOTING.md`
