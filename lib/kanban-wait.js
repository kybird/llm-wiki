// llm-wiki wait — 보드 활동 로그(doc/kanban/activity.jsonl)의 이벤트를 기다렸다 종료하는
// 읽기 전용 명령. 무인 루프가 밤새 handoff 판정을 폴링하지 않게 한다 — 호출자는 이 명령을
// 백그라운드에 걸어 두고 프로세스 종료를 신호로 쓴다. 아무 일이 없으면 아무 비용도 없다.
//
// 종료 코드가 이 명령의 계약이다:
//   0    이벤트 감지 — 해당 이벤트를 stdout 한 줄로 출력
//   2    타임아웃 — 아무것도 출력하지 않는다. 호출자는 조용히 재무장
//   1    오류 — 모르는 플래그, 해석 불가능한 --since/--timeout/--stall-min, 파일 접근 불가
//   130  SIGINT/SIGTERM — 호출자가 죽였다
//
// 견고성 규칙(2026-09-12 병합 충돌로 activity.jsonl이 통째로 재작성된 실측에서 나온 것들):
//   - 바이트 오프셋을 기억하지 않는다. 파일은 10k 줄 캡(appendActivity)이나 병합 수습으로
//     통째로 다시 쓰인다 — 매번 처음부터 읽고 타임스탬프로 거른다.
//   - 파일이 없어도 죽지 않는다(init 전·이벤트 0회). 생길 때까지 기다린다.
//   - JSON 파싱에 실패한 줄은 건너뛴다 — 실제로 병합 충돌 마커가 섞인 적이 있다.
//   - fs.watch + 저주기 폴링(기본 5초)을 항상 함께 돈다. doc/이 링크 워크트리의 정션
//     너머에 있으면(find-doc-root) Windows fs.watch가 이벤트를 놓친다.
const fs = require('fs');
const path = require('path');
const { findDocRoot } = require('./find-doc-root');
const kanban = require('./kanban');
const { parseArgs, validateFlags, fail } = require('./kanban-cmd');

const POLL_MS_DEFAULT = 5000;
const FILTERS = ['handoff', 'done', 'any', 'stall'];

// ts 필드를 밀리초로 — ts 없음·해석 불가는 이벤트로 치지 않는다.
function eventTs(ev) {
  if (!ev || typeof ev.ts !== 'string') return null;
  const t = Date.parse(ev.ts);
  return Number.isNaN(t) ? null : t;
}

function wait({ rest, json } = {}) {
  const { positional, flags } = parseArgs(rest || []);
  if (positional.length) fail(`wait는 위치 인자를 받지 않는다: ${positional.join(' ')}`);
  validateFlags(flags, {
    for: 'string',
    since: 'string',
    timeout: 'string',
    'stall-min': 'string',
  });

  // 단일값 플래그 — 반복 지정(--for a --for b)은 parseArgs가 배열로 누적하므로 거부.
  const single = (v, name) => {
    if (Array.isArray(v)) fail(`--${name}은 한 번만 쓸 수 있다`);
    return v;
  };

  const filter = flags.for === undefined ? 'handoff' : single(flags.for, 'for');
  if (!FILTERS.includes(filter)) {
    fail(`--for은 ${FILTERS.join(' | ')} 중 하나여야 한다 — 받은 값: ${filter}`);
  }

  const sinceRaw = flags.since === undefined ? new Date().toISOString() : single(flags.since, 'since');
  const sinceMs = Date.parse(sinceRaw);
  if (Number.isNaN(sinceMs)) {
    fail(`--since "${sinceRaw}"를 시각으로 해석할 수 없다 — ISO 8601 형태로 준다 (예: 2026-09-12T00:00:00Z)`);
  }

  const timeoutSec = flags.timeout === undefined ? null : Number(single(flags.timeout, 'timeout'));
  if (timeoutSec !== null && (Number.isNaN(timeoutSec) || timeoutSec < 0)) {
    fail(`--timeout은 0 이상의 숫자(초)여야 한다 — 받은 값: ${single(flags.timeout, 'timeout')} (0 = 기다리지 않는다)`);
  }

  // 소수 분을 허용한다(예: 0.05 = 3초) — 회귀 테스트가 분 단위를 기다리지 않게.
  const stallMin = flags['stall-min'] === undefined ? 20 : Number(single(flags['stall-min'], 'stall-min'));
  if (Number.isNaN(stallMin) || stallMin <= 0) {
    fail(`--stall-min은 0보다 큰 숫자(분)여야 한다 — 받은 값: ${single(flags['stall-min'], 'stall-min')}`);
  }

  const activityPath = kanban.kanbanPaths(findDocRoot()).activityPath;
  const stallMs = stallMin * 60e3;
  const pollMs = Math.max(50, Number(process.env.LLM_WIKI_WAIT_POLL_MS) || POLL_MS_DEFAULT);
  const startedAt = Date.now();

  let watcher = null;
  let pollTimer = null;
  let timeoutTimer = null;
  let stallTimer = null;
  let finished = false;
  // stall 기준점 — --since 이후 활동이 없으면 since 시각 자체가 마지막 활동이 된다.
  let lastActivityMs = sinceMs;

  // 종료는 출력 이후에 — Windows 파이프 stdout은 비동기라 쓰기 완료 전에 루프가 마르면
  // 그 한 줄이 유실된다(이벤트는 감지했는데 호출자가 못 받는 상태). 쓰기 완료 콜백에서
  // 명시 종료한다. 콜백이 오지 않는 극단적 경우를 대비해 exitCode도 심어둔다.
  function finish(code, line) {
    if (finished) return;
    finished = true;
    if (watcher) { try { watcher.close(); } catch { /* 이미 닫혔다 */ } }
    if (pollTimer) clearInterval(pollTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (stallTimer) clearTimeout(stallTimer);
    if (line !== undefined) {
      process.exitCode = code;
      process.stdout.write(`${line}\n`, () => process.exit(code));
    } else {
      process.exit(code);
    }
  }

  // activity.jsonl 전체를 매번 다시 읽는다(오프셋 금지 규칙). 깨진 줄은 건너뛴다.
  function readEvents() {
    let content;
    try {
      content = fs.readFileSync(activityPath, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return []; // 아직 없다 — 생길 때까지 기다린다
      throw e;
    }
    const events = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // 깨진 줄(병합 충돌 마커·잘린 쓰기)은 건너뛴다.
      }
    }
    return events;
  }

  // --since 이후(엄격히 초과 — 같은 이벤트에 다시 깨지 않는다)의 이벤트 중 필터에 맞는
  // 첫 줄을 돌려준다. stall 기준점(lastActivityMs)은 필터와 무관하게 모든 액션이 갱신한다.
  function scan() {
    let matched = null;
    for (const ev of readEvents()) {
      const t = eventTs(ev);
      if (t === null || t <= sinceMs) continue;
      if (t > lastActivityMs) lastActivityMs = t;
      if (!matched && (filter === 'any' || ev.action === filter)) matched = ev;
    }
    return matched;
  }

  function emitEvent(ev) {
    finish(0, json
      ? JSON.stringify(ev)
      : `${ev.ts} ${ev.action} ${ev.title !== undefined ? ev.title : ''}`.trimEnd());
  }

  // stall 발사 — 마지막 활동(또는 --since)으로부터 stall-min 분의 침묵이 확인됐다.
  // 새 활동이 오면 lastActivityMs가 밀리고 check()가 다시 부르므로 마감도 밀린다.
  function armStall() {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      finish(0, json
        ? JSON.stringify({ ts: new Date().toISOString(), action: 'stall', since: sinceRaw, stallMinutes: stallMin })
        : `stall — ${stallMin}분간 새 이벤트 없음 (since ${sinceRaw})`);
    }, Math.max(0, lastActivityMs + stallMs - Date.now()));
  }

  // watch 이벤트는 한 쓰기에 여러 번 터진다 — setImmediate로 한 틱에 모아 한 번 검사한다.
  let checkScheduled = false;
  function check() {
    if (finished || checkScheduled) return;
    checkScheduled = true;
    setImmediate(() => {
      checkScheduled = false;
      if (finished) return;
      try {
        const ev = scan();
        if (filter === 'stall') armStall();
        else if (ev) emitEvent(ev);
      } catch (e) {
        fail(`activity.jsonl을 읽을 수 없다: ${e.message}`);
      }
    });
  }

  // 진입 검사 — 대기에 들어가기 전에 --since 이후의 기존 이벤트를 먼저 본다. 호출자가
  // 이전 이벤트를 처리하는 동안 쌓인 것을 놓치지 않는 것이 이 명령의 핵심 계약이다.
  try {
    const existing = scan();
    if (filter !== 'stall' && existing) {
      emitEvent(existing);
      return;
    }
  } catch (e) {
    fail(`activity.jsonl을 읽을 수 없다: ${e.message}`);
  }

  // 대기 진입 알림은 stderr — stdout은 계약상 이벤트 한 줄 전용이다.
  console.error(`waiting: for=${filter} since=${sinceRaw}` +
    (timeoutSec !== null ? ` timeout=${timeoutSec}s` : '') +
    (filter === 'stall' ? ` stall-min=${stallMin}` : '') +
    ` file=${activityPath} (Ctrl+C to stop)`);

  if (filter === 'stall') armStall(); // lastActivityMs는 진입 검사에서 갱신됐다

  // 감시 대상은 디렉터리다 — activity.jsonl은 통째로 다시 쓰일 수 있어 파일 단위 watch
  // 핸들이 끊기고, 파일 생성 이벤트도 디렉터리에서 잡힌다.
  try {
    watcher = fs.watch(path.dirname(activityPath), (_evt, filename) => {
      if (filename && path.basename(activityPath) !== filename) return;
      check();
    });
    watcher.on('error', () => { /* 감시 실패 — 아래 폴링이 잡는다 */ });
  } catch {
    // 감시 실패(정션 너머 등) — 아래 폴링이 잡는다
  }

  // 저주기 폴링 폴백 — watch가 이벤트를 놓쳐도 이것이 잡는다(항상 함께 돈다).
  pollTimer = setInterval(check, pollMs);

  process.on('SIGINT', () => finish(130));
  process.on('SIGTERM', () => finish(130));

  if (timeoutSec !== null) {
    timeoutTimer = setTimeout(() => finish(2), Math.max(0, startedAt + timeoutSec * 1000 - Date.now()));
  }
}

module.exports = { wait };
