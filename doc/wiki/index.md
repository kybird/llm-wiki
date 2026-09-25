---
tags: [index]

# Wiki Index

llm-wiki 프로젝트의 구조화된 지식 베이스입니다. `doc/raw/` 로그에서 추출한 핵심 개념과 패턴을 정리했습니다.

---

## Concepts

| 개념 | 설명 | 별칭 |
|------|------|------|
| [[agent-cli-contract]] | 이 CLI의 1차 사용자는 종료 코드와 출력으로만 판단하는 에이전트다 — 성공 보고는 실제 변경에 묶인다. | CLI 계약, silent no-op, 무조건 성공 보고, 모르는 플래그 거부, unknown flag rejection, validateFlags |
| [[auto-update-copy-source]] | auto-update의 사본 동기화 소스는 **실행 중인 바이너리의 패키지 루트**다. | 사본 핑퐁, skill copy ping-pong, modified since read, 사본 재동기화, skill-version 회귀, auto-update 사본 동기화, 커밋 훅 사본 회귀 |
| [[card-file-anatomy]] | 칸반 카드 파일의 내부 계약 — Goal·AC는 센티넬 특별 취급(card.goal·card.ac), sections Map은 나머지만 담는다. kind·milestone 필드는 소속/종류를 결정한다. | 카드 구조, 카드 파일 형식, sections Map, parseBody, Goal 센티넬, AC 파싱, kind milestone, milestone 필드, 소속 가드 |
| [[qmd-optional-dependency]] | @tobilu/qmd는 선택 의존성 — 없으면 grep으로 강하하고, 있으면 시맨틱이 더해진다. | semantic search optional, findQmd, QMD 설치 위치 |
| [[quota-watchdog]] | 5시간 rolling 쿼터 소진으로 밤샘 무인 세션이 죽었을 때, 쿼터 복구 후 예약 자동화 발사가 제어 | 쿼터 워치독, quota watchdog, usage limit reached, 5 hour rolling window, 쿼터 소진, 밤샘 작업 자동 인계, 발사 프로브 |

---

## Patterns

| 패턴 | 설명 | 별칭 |
|------|------|------|
| [[always-merge-exact-matching]] | 하이브리드 검색에서 시맨틱과 정확 매칭은 대체재가 아니라 보완재 — 항상 둘 다 돌린다. | QMD grep merge, semantic fallback bug, 하이브리드 검색 병합 |
| [[flush-before-exit]] | 종료가 출력을 앞지르지 않게 한다 — Windows 파이프 stdout은 비동기라 쓰기 완료 콜백에서 exit해야 그 한 줄이 유실되지 않는다. | stdout 유실, 파이프 출력 잘림, process.exit truncation, Windows pipe async stdout, 쓰기 완료 콜백 종료, flush before process.exit |
| [[header-date-over-mtime]] | 로그 신선함 판정은 파일 mtime이 아니라 로그 헤더의 날짜로 한다. | same-day false positive, mtime 오탐, checkout machine independence |
| [[kill-the-tree-not-the-wrapper]] | Windows에선 래퍼(셸·작업)만 죽여도 node 자식이 살아 포트를 계속 잡는다 — 정지 피드백을 믿지 말고 포트를 확인한다. | 고아 프로세스, 포트 점유, EADDRINUSE 대응, taskkill, 작업 정지 잔존 |
| [[npm-scoped-publishing]] | 스코프 패키지 배포의 네 함정 — 2FA 강제(비-TTY에선 인증 URL 마스킹), private 기본값, 404여도 존재하는 패키지, whoami≠발행권한. | 403 two-factor, cannot publish over, 스코프 패키지 배포, npm 404 private, EOTP, one-time password publish, 토큰 없는 publish 404 |
| [[question-timing-follows-answerability]] | 질문 타이밍은 "누가 대답할 수 있는가"가 결정한다 — 사람 있으면 시작 전, 무인이면 벽에서 park. | 질문 타이밍, handoff 질문, 시작 전 질문, pre-work question |
| [[ui-changes-need-browser-verification]] | 임베디드 페이지 JS의 런타임 오류는 노드 테스트가 못 잡는다 — UI를 손대는 커밋의 게이트는 브라우저 실측이다. | 페이지 JS 테스트 공백, 브라우저 실측, 클라이언트 JS 검증, client JS |
| [[write-validation-matches-read-semantics]] | 쓰기 경로의 검증은 읽는 쪽(pick)의 판정과 정확히 같아야 한다 — 더 엄격하면 합법 상태를 입력할 길이 없고, 더 느슨하면 읽는 쪽이 영원히 못 푼다. | 의존성 검증, depends_on 후기 등록, --add-depends, --remove-depends, 순환 거부, cycle rejection, validateDepTargets |

---

## Anti-Patterns

| 안티패턴 | 설명 | 별칭 |
|------|------|------|
| [[cuda-version-coexistence]] | 여러 CUDA 버전을 공존시키면 prebuilt 바이너리가 깨지고 소스빌드 지옥으로 빠진다. | STL1002, cublas64 DLL conflict, win-x64-cuda load failure |
| [[destructuring-live-getters]] | 게터를 포함한 반환 객체를 구조 분해하면 그 순간 평가된 스냅샷 원시값이 복사된다 — 살아있는 값이 죽은 값으로 위장한다. | 게터 구조 분해, getter destructuring, out 스냅샷, 빈 stdout 오인, destructuring getter snapshot |
| [[probing-side-effect-commands]] | 부작용 있는 명령을 확인용으로 실행하는 것 — `--help`는 무해하다는 관례를 전제로 에이전트가 실제 상태를 바꾼다. 기록으로는 막히지 않고 도구로만 막힌다. | 탐색용 호출, pick --help 사고, help가 카드를 집는다, probing for options, 안전한 탐색 경로 부재, 검증 없는 위임 플래그 |
| [[shared-default-collection-names]] | 두 프로젝트가 QMD 기본 컬렉션 이름을 공유하면 에러 없이 검색이 교차 오염된다. | QMD 컬렉션 충돌, 검색 교차 오염, collection name collision |

---

## Answers

| 답변 | 설명 | 별칭 |
|------|------|------|

---

## Statistics

- Total concepts: 5
- Total patterns: 8
- Total anti-patterns: 4
- Total answers: 0
- Last updated: 2026-09-24
