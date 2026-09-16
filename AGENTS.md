# AGENTS.md

이 레포는 llm-wiki 자신을 도그푸딩한다. **파일이 정본** — 서버·DB 없음. CLI만이 카드를 쓴다.

## 작업 시작 전 (매 세션, 무조건)
- `llm-wiki search "<키워드>"` — 같은 벽을 다시 치지 않게. 실제 에러 메시지 문자열로 검색한다.
- `llm-wiki board` — 관련 카드가 이미 있는지. 카드 제목이 곧 식별자다(번호 없음).
- 설계 판단이 필요하면 doc/plan.md를 먼저 읽는다 — **[확정]은 뒤집지 않는다.**

## 계획과 실행의 분리
- 계획 = `kanban-plan` 스킬: 카드 1장 = 컨텍스트 1개 = 커밋 1개, 자식은 엄격히 더 작게, 깊이 ≤ 3.
- 무인 실행 = `work-loop` 스킬: pick → done/handoff/abandon. 정지 규칙에서 report + video 남긴다.
- 준비 안 된 카드는 게이트: 시간은 `--not-before`, 관측 조건은 `handoff` → 충족 근거가 오면 `resume`.

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
- 보드: `doc/kanban/` 카드가 정본 · `board-timelapse.mp4`는 유도물
- qmd/CUDA 빌드 이슈: `TROUBLESHOOTING.md`
