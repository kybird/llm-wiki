// llm-wiki monitor — 읽기 전용 실시간 보드 뷰어 (2026-09-16).
//
// "서버·DB 없음"(AGENTS.md)의 경계를 정확히 지킨다: 카드의 정본은 파일이고
// 쓰는 건 CLI뿐이다. 이 서버는 로컬 파일을 읽어 브라우저에 보여주기만 한다 —
// 상태를 남기지 않고, 쓰기 메서드는 전부 405로 거부한다. plan.md 1.4(읽기전용
// 색인이 확장 경로)과 6.6(칸반 웹 뷰어)이 예약해 둔 자리다. 드래그 이동 같은
// 쓰기 계층은 별도 카드(웹 뷰 — 드래그 이동)로 이 뷰어 위에 얹는다.
//
// 갱신은 폴링(2초)이다 — wait가 익힌 교훈대로 Windows의 fs.watch는 신뢰할 수
// 없고(junction), SSE·웹소켓은 두 번째 연결 프로토콜이라 배관이 먼저다(작업
// 원칙 1). localhost에서 2초 지연은 사람이 보기에 충분하다.
//
// stdout 계약: 첫 줄이 http://127.0.0.1:<port> 다 — 테스트가 이 줄을 파싱한다.
// 그래서 monitor는 bin의 auto-update 트리거 목록에 없다(wait와 같은 이유 —
// 배너가 첫 줄을 밀어내면 계약이 깨진다).
const http = require('http');
const kanban = require('./kanban');
const {
  parseArgs, validateFlags, fail, USAGE, requireBoard, collectBoard,
} = require('./kanban-cmd');

const MONITOR_FLAGS = { port: 'string' };
const DEFAULT_PORT = 4747;

function monitor(options = {}) {
  const flags = { ...parseArgs(options.rest || []).flags };
  if (options.json) flags.json = true;
  validateFlags(flags, MONITOR_FLAGS);

  const port = flags.port !== undefined ? Number(flags.port) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    fail(`--port 값이 잘못됐다: ${flags.port} — 0~65535의 정수(0은 임시 포트 할당). ${USAGE.monitor}`);
  }

  // 시작 시 한 번 검증한다 — requireBoard의 fail은 process.exit(1)이라 요청
  // 도중에 돌리면 서버가 그대로 죽는다. 이후 요청에서 보드가 사라지면 500.
  const { paths } = requireBoard();

  const server = http.createServer((req, res) => {
    try {
      handle(req, res, paths);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end(`보드를 읽다 실패했다: ${e.message}\n`);
    }
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`✗ 포트 ${port}가 이미 쓰이고 있다 — --port <다른 번호>로 바꿔라.`);
    } else {
      console.error(`✗ 서버 오류: ${err.message}`);
    }
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const actual = server.address().port;
    console.log(`http://127.0.0.1:${actual}`);
    console.log(`읽기 전용 모니터 — 정본은 ${paths.kanbanDir} 의 카드 파일, 쓰는 건 CLI뿐이다. 종료는 Ctrl+C.`);
  });
}

function handle(req, res, paths) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET' });
    res.end('카드 쓰기는 CLI뿐이다 — 이 서버는 읽기 전용이다.\n');
    return;
  }
  const noStore = { 'cache-control': 'no-store' };
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...noStore });
    res.end(renderMonitorPage());
  } else if (url.pathname === '/api/board') {
    const { view } = collectBoard();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...noStore });
    res.end(JSON.stringify(view));
  } else if (url.pathname === '/api/activity') {
    // 최근 50건만 — readActivity 자체가 ACTIVITY_CAP(10000줄)으로 봉인돼 있다.
    const events = kanban.readActivity(paths).slice(-50);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...noStore });
    res.end(JSON.stringify({ schemaVersion: 1, kind: 'kanban-activity', events }));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('없는 경로다 — / · /api/board · /api/activity.\n');
  }
}

// ── 페이지 — 정적 골격 + DOM API 데이터 바인딩 ─────────────────────────────
// 카드 제목·질문은 에이전트가 쓴 문자열이다 — innerHTML로 심지 않고
// textContent로만 넣는다(주입 차단). 골격 문자열에는 데이터가 없다.
function renderMonitorPage() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>llm-wiki monitor</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; margin: 20px;
         background: #0f141a; color: #d7dee6; }
  header h1 { font-size: 18px; margin: 0 0 4px; }
  header p { margin: 0 0 16px; color: #7f8b98; font-size: 13px; }
  header p.off { color: #ff8f8f; }
  main { display: grid; grid-template-columns: repeat(5, minmax(180px, 1fr)); gap: 12px; align-items: start; }
  section { background: #161d26; border: 1px solid #232d3a; border-radius: 10px; padding: 10px; }
  h2 { font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .05em;
       color: #8a97a3; font-weight: 600; }
  .count { color: #5b6a78; font-weight: 400; }
  .card { background: #1c2531; border: 1px solid #2a3543; border-radius: 8px;
          padding: 8px 10px; margin-bottom: 8px; }
  .card .t { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .q { font-size: 12px; color: #9fb0c0; margin: 2px 0 4px; }
  .badge { display: inline-block; font-size: 11px; background: #26313f; color: #a9b7c4;
           border-radius: 999px; padding: 2px 8px; margin: 2px 4px 0 0; }
  .badge.warn { background: #4a2f14; color: #ffb45e; }
  .badge.gate { background: #16324f; color: #7cb6ff; }
  .badge.t-done { background: #12331f; color: #6ee7a0; }
  .badge.t-superseded { background: #2b1f4d; color: #c9a6ff; }
  .badge.t-abandoned { background: #47201f; color: #ff8f8f; }
  .act { font-size: 12px; padding: 4px 2px; border-bottom: 1px solid #1c2531; color: #9fb0c0; }
  .who { color: #8a97a3; }
  .act .a-done { color: #6ee7a0; } .act .a-abandoned { color: #ff8f8f; }
  .act .a-claimed { color: #7cb6ff; } .act .a-handoff { color: #ffb45e; }
  .empty { color: #55616d; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>llm-wiki monitor</h1>
  <p id="summary">불러오는 중…</p>
</header>
<main>
  <section><h2>Doing <span class="count" id="n-doing"></span></h2><div id="list-doing"></div></section>
  <section><h2>Review — 사람 판정 대기 <span class="count" id="n-review"></span></h2><div id="list-review"></div></section>
  <section><h2>Todo <span class="count" id="n-todo"></span></h2><div id="list-todo"></div></section>
  <section><h2>종결 <span class="count" id="n-terminal"></span></h2><div id="list-terminal"></div></section>
  <section><h2>활동 <span class="count" id="n-act"></span></h2><div id="list-activity"></div></section>
</main>
<script>
'use strict';
const ACTION_LABEL = { created: '생성', claimed: '집김', done: '완료', handoff: '판정 대기',
  abandoned: '폐기', superseded: '대체', reopened: '재검토', resumed: '복귀', edited: '편집' };
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const fmtElapsed = ms => {
  const m = Math.floor(ms / 60000);
  return m < 60 ? m + '분' : Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
};
const fmtClock = ts => new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });
const fmtDayClock = ts => {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};
const TERMINAL_LABEL = { done: '완료', superseded: '대체', abandoned: '폐기' };

function renderBoard(view) {
  const resolved = new Set(view.resolved);
  const today = new Date().toISOString().slice(0, 10);

  const doing = document.getElementById('list-doing');
  doing.replaceChildren(
    ...view.columns.doing.map(c => {
      const card = el('div', 'card');
      card.append(el('div', 't', c.title));
      const meta = el('div', 'meta');
      if (c.claimExpired) {
        meta.append(el('span', 'badge warn', '클레임 만료 — 재집기 가능'));
      } else if (c.claimedBy) {
        let label = c.claimedBy;
        const ms = c.claimedAt ? Date.now() - Date.parse(c.claimedAt) : NaN;
        if (Number.isFinite(ms) && ms >= 0) label += ' · ' + fmtElapsed(ms);
        meta.append(el('span', 'badge', label));
      }
      card.append(meta);
      return card;
    })
  );
  if (!view.columns.doing.length) doing.append(el('div', 'empty', '비어 있음'));
  document.getElementById('n-doing').textContent = view.wip.doing.used + '/' + view.wip.doing.limit;

  const review = document.getElementById('list-review');
  review.replaceChildren(
    ...view.columns.review.flatMap(c => {
      const card = el('div', 'card');
      card.append(el('div', 't', c.title));
      if (c.question) card.append(el('div', 'q', '↳ ' + c.question));
      return [card];
    })
  );
  if (!view.columns.review.length) review.append(el('div', 'empty', '비어 있음'));
  document.getElementById('n-review').textContent = view.columns.review.length;

  const todo = document.getElementById('list-todo');
  todo.replaceChildren(
    ...view.columns.todo.map(c => {
      const card = el('div', 'card');
      card.append(el('div', 't', c.title));
      const meta = el('div', 'meta');
      if (c.notBefore && c.notBefore > today) meta.append(el('span', 'badge gate', '시작 예정 ' + c.notBefore));
      const unmet = c.dependsOn.filter(d => !resolved.has(d));
      if (unmet.length) meta.append(el('span', 'badge gate', '의존 대기: ' + unmet.join(', ')));
      card.append(meta);
      return card;
    })
  );
  if (!view.columns.todo.length) todo.append(el('div', 'empty', '비어 있음'));
  document.getElementById('n-todo').textContent = view.columns.todo.length;

  // 종결 적체 — 완료가 쌓이는 모습이 수렴의 증거다(3.2). 최근 8건, 새 것부터.
  const terminal = document.getElementById('list-terminal');
  terminal.replaceChildren(
    ...(view.terminalRecent || []).map(t => {
      const card = el('div', 'card');
      card.append(el('div', 't', t.title));
      const meta = el('div', 'meta');
      meta.append(el('span', 'badge t-' + t.kind, TERMINAL_LABEL[t.kind] || t.kind));
      if (t.at) meta.append(el('span', 'who', ' ' + fmtDayClock(t.at)));
      card.append(meta);
      return card;
    })
  );
  if (!(view.terminalRecent || []).length) terminal.append(el('div', 'empty', '비어 있음'));
  const tCounts = view.terminal;
  document.getElementById('n-terminal').textContent = '최근 ' + (view.terminalRecent || []).length;

  const summary = document.getElementById('summary');
  summary.className = '';
  summary.textContent = 'WIP doing ' + view.wip.doing.used + '/' + view.wip.doing.limit +
    ' · 종결: done ' + tCounts.done + ' · superseded ' + tCounts.superseded + ' · abandoned ' + tCounts.abandoned +
    ' · 갱신 ' + fmtClock(Date.now());
}

function renderActivity(payload) {
  const list = document.getElementById('list-activity');
  const newest = [...payload.events].reverse();
  list.replaceChildren(
    ...newest.map(ev => {
      const row = el('div', 'act');
      const label = ACTION_LABEL[ev.action] || ev.action;
      row.append(el('span', 'a-' + ev.action, label));
      row.append(document.createTextNode(' ' + (ev.title || '')));
      if (ev.actor) row.append(el('span', 'who', ' — ' + ev.actor));
      row.append(el('div', 'who', fmtClock(ev.ts)));
      return row;
    })
  );
  if (!newest.length) list.append(el('div', 'empty', '활동 없음'));
  document.getElementById('n-act').textContent = newest.length;
}

async function tick() {
  const summary = document.getElementById('summary');
  try {
    const [b, a] = await Promise.all([fetch('/api/board'), fetch('/api/activity')]);
    if (!b.ok || !a.ok) throw new Error('HTTP ' + b.status + '/' + a.status);
    renderBoard(await b.json());
    renderActivity(await a.json());
  } catch (e) {
    summary.className = 'off';
    summary.textContent = '연결 끊김 — 서버가 죽었거나 보드를 읽을 수 없다 (' + e.message + ')';
  }
}
setInterval(tick, 2000);
tick();
</script>
</body>
</html>
`;
}

module.exports = { monitor };
