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
  } else if (url.pathname === '/api/card') {
    // 카드 본문 — 제목은 파일명이 아니라 파싱된 meta.title과 비교한다
    // (findCard). 경로로 쓰지 않으니 조회 키일 뿐이다. 종결 카드도 같이 찾는다.
    const title = url.searchParams.get('title');
    if (!title) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('title 쿼리가 필요하다 — /api/card?title=<카드 제목>\n');
      return;
    }
    const cardObj = kanban.findCard(paths, title);
    if (!cardObj) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`카드를 못 찾았다: ${title}\n`);
      return;
    }
    // Goal·AC는 센티넬 블록으로 파싱돼 card.goal/card.ac에 있고 sections는
    // 나머지(Plan/Notes/Handoff/Result)다 — 파일 순서(Goal → AC → 나머지)로 합친다.
    const sections = {};
    if (cardObj.card.goal && cardObj.card.goal.trim()) sections.Goal = cardObj.card.goal.trim();
    if (cardObj.card.ac.length) {
      sections['Acceptance Criteria'] = cardObj.card.ac
        .map(a => (a.checked ? '- [x] ' : '- [ ] ') + '#' + a.idx + ' ' + a.text)
        .join('\n');
    }
    for (const [name, bodyText] of cardObj.card.sections) {
      if (bodyText && bodyText.trim()) sections[name] = bodyText;
    }
    const payload = {
      schemaVersion: 1,
      kind: 'kanban-card',
      title: cardObj.meta.title,
      meta: cardObj.meta,
      sections,
    };
    // 마일스톤 상세는 멤버 목록까지 유도해 실는다 — 회고 브라우징의 뼈대(3.8):
    // 대의(Goal)를 읽고 멤버를 따라 들어간다.
    if (cardObj.meta.kind === 'milestone') {
      payload.members = kanban.listAllCards(paths)
        .filter(c => c.meta.milestone === cardObj.meta.title)
        .map(c => ({ title: c.meta.title, status: c.meta.status, claimedBy: c.meta.claimed_by || null }));
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...noStore });
    res.end(JSON.stringify(payload));
  } else {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('없는 경로다 — / · /api/board · /api/activity · /api/card?title=….\n');
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
  .card[data-title] { cursor: pointer; }
  .card[data-title]:hover { border-color: #48596d; }
  .act[data-title] { cursor: pointer; }
  .act[data-title]:hover { color: #d7dee6; }
  #modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
  #modal[hidden] { display: none; }
  #modal-backdrop { position: absolute; inset: 0; background: rgba(4, 8, 12, .72); }
  #modal-panel { position: relative; background: #161d26; border: 1px solid #2a3543;
                 border-radius: 10px; width: min(720px, calc(100vw - 48px));
                 max-height: calc(100vh - 96px); overflow: auto; padding: 16px 20px; }
  #modal-panel header { display: flex; align-items: baseline; gap: 12px; }
  #modal-title { font-size: 16px; margin: 0; flex: 1; }
  #modal-close { background: none; border: 1px solid #2a3543; color: #9fb0c0;
                 border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
  #modal-close:hover { color: #d7dee6; border-color: #48596d; }
  #modal-meta { color: #8a97a3; font-size: 12px; margin: 6px 0 12px; }
  #modal-body h4 { font-size: 11px; margin: 14px 0 4px; text-transform: uppercase;
                   letter-spacing: .05em; color: #8a97a3; }
  #modal-body .sec { white-space: pre-wrap; font-size: 13px; line-height: 1.55;
                     color: #c6d0da; }
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
  .act .a-milestone-done { color: #6ee7a0; font-weight: 600; }
  .empty { color: #55616d; font-size: 12px; }
  #milestones { background: #161d26; border: 1px solid #232d3a; border-radius: 10px;
                padding: 10px; margin-bottom: 12px; }
  #milestones[hidden] { display: none; }
  .ms { border: 1px solid #2a3543; border-radius: 8px; padding: 8px 10px;
        margin-bottom: 8px; background: #1c2531; }
  .ms.done { opacity: .82; }
  .ms-head { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .ms-title { font-size: 13px; font-weight: 600; max-width: 34%; overflow: hidden;
              text-overflow: ellipsis; white-space: nowrap; }
  .ms-bar { flex: 1; height: 6px; background: #10161d; border-radius: 999px; overflow: hidden; }
  .ms-bar-fill { height: 100%; background: linear-gradient(90deg, #2f6f4f, #6ee7a0); }
  .ms-count { font-size: 12px; color: #8a97a3; white-space: nowrap; }
  .ms-members { margin-top: 6px; }
  .ms-member { font-size: 12px; padding: 3px 0; cursor: pointer; }
  .ms-member:hover { color: #d7dee6; }
  .badge.st-doing { background: #16324f; color: #7cb6ff; }
  .badge.st-review { background: #4a2f14; color: #ffb45e; }
  .badge.st-todo { background: #26313f; color: #a9b7c4; }
  .badge.ms-tag { background: #233043; color: #9fb0c0; font-size: 10px; }
</style>
</head>
<body>
<header>
  <h1>llm-wiki monitor</h1>
  <p id="summary">불러오는 중…</p>
</header>
<section id="milestones" hidden>
  <h2>마일스톤 <span class="count" id="n-ms"></span></h2>
  <div id="list-milestones"></div>
</section>
<main>
  <section><h2>Doing <span class="count" id="n-doing"></span></h2><div id="list-doing"></div></section>
  <section><h2>Review — 사람 판정 대기 <span class="count" id="n-review"></span></h2><div id="list-review"></div></section>
  <section><h2>Todo <span class="count" id="n-todo"></span></h2><div id="list-todo"></div></section>
  <section><h2>종결 <span class="count" id="n-terminal"></span></h2><div id="list-terminal"></div></section>
  <section><h2>활동 <span class="count" id="n-act"></span></h2><div id="list-activity"></div></section>
</main>
<div id="modal" hidden>
  <div id="modal-backdrop"></div>
  <div id="modal-panel" role="dialog" aria-modal="true">
    <header><h3 id="modal-title"></h3><button id="modal-close" type="button">닫기 (Esc)</button></header>
    <div id="modal-meta"></div>
    <div id="modal-body"></div>
  </div>
</div>
<script>
'use strict';
const ACTION_LABEL = { created: '생성', claimed: '집김', done: '완료', handoff: '판정 대기',
  abandoned: '폐기', superseded: '대체', reopened: '재검토', resumed: '복귀', edited: '편집',
  reverted: '되돌림', 'milestone-done': '계획 완료', 'milestone-reverted': '계획 되돌림' };
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
const STATUS_LABEL = { todo: '할 일', doing: '진행 중', review: '판정 대기', done: '완료', superseded: '대체', abandoned: '폐기' };
// 클릭 가능 카드 — data-title이 상세 보기 조회 키다(이벤트 위임 한 곳에서 처리).
const cardEl = title => {
  const n = el('div', 'card');
  n.dataset.title = title;
  return n;
};

function renderBoard(view) {
  renderMilestones(view.milestones || []);
  const resolved = new Set(view.resolved);
  const today = new Date().toISOString().slice(0, 10);

  const doing = document.getElementById('list-doing');
  doing.replaceChildren(
    ...view.columns.doing.map(c => {
      const card = cardEl(c.title);
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
      const card = cardEl(c.title);
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
      const card = cardEl(c.title);
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
      const card = cardEl(t.title);
      card.append(el('div', 't', t.title));
      const meta = el('div', 'meta');
      meta.append(el('span', 'badge t-' + t.kind, TERMINAL_LABEL[t.kind] || t.kind));
      if (t.milestone) meta.append(el('span', 'badge ms-tag', t.milestone));
      if (t.at) meta.append(el('span', 'who', ' ' + fmtDayClock(t.at)));
      card.append(meta);
      return card;
    })
  );
  if (!(view.terminalRecent || []).length) terminal.append(el('div', 'empty', '비어 있음'));
  document.getElementById('n-terminal').textContent = '최근 ' + (view.terminalRecent || []).length;
}

// ── 마일스톤 패널 — 목적 축(3.8). 진행 중은 펼쳐 멤버를 보이고(2026-09-16 확정),
// 완료는 접힌다. 제목·멤버 클릭은 상세 모달로(위임 핸들러가 잡는다).
const MEMBER_RANK = { doing: 0, review: 1, todo: 2, done: 3, superseded: 4, abandoned: 5 };
const memberBadgeClass = status =>
  ['done', 'superseded', 'abandoned'].includes(status) ? 't-' + status : 'st-' + status;

function renderMilestones(list) {
  const panel = document.getElementById('milestones');
  const container = document.getElementById('list-milestones');
  panel.hidden = !list.length;
  document.getElementById('n-ms').textContent = list.length;
  if (!list.length) { container.replaceChildren(); return; }
  container.replaceChildren(...list.map(ms => {
    const isActive = ['todo', 'doing', 'review'].includes(ms.status);
    const finished = ms.total - (ms.counts.active || 0);
    const box = el('div', 'ms' + (isActive ? '' : ' done'));
    const head = el('div', 'ms-head');
    head.dataset.title = ms.title;
    head.append(el('span', 'ms-title', (isActive ? '' : '✓ ') + ms.title));
    const barWrap = el('div', 'ms-bar');
    const bar = el('div', 'ms-bar-fill');
    bar.style.width = (ms.total ? Math.round(finished / ms.total * 100) : 0) + '%';
    barWrap.append(bar);
    head.append(barWrap, el('span', 'ms-count', finished + '/' + ms.total));
    if (ms.completedAt) head.append(el('span', 'who', ' ' + fmtDayClock(ms.completedAt)));
    box.append(head);
    if (isActive) {
      const members = el('div', 'ms-members');
      const sorted = [...ms.members].sort((a, b) => (MEMBER_RANK[a.status] ?? 9) - (MEMBER_RANK[b.status] ?? 9));
      for (const mem of sorted) {
        const row = el('div', 'ms-member');
        row.dataset.title = mem.title;
        row.append(el('span', 'badge ' + memberBadgeClass(mem.status), STATUS_LABEL[mem.status] || mem.status));
        row.append(document.createTextNode(' ' + mem.title));
        members.append(row);
      }
      if (!sorted.length) members.append(el('div', 'empty', '멤버 없음 — card new --milestone로 붙여라'));
      box.append(members);
    }
    return box;
  }));
}

function renderActivity(payload) {
  const list = document.getElementById('list-activity');
  const newest = [...payload.events].reverse();
  list.replaceChildren(
    ...newest.map(ev => {
      const row = el('div', 'act');
      if (ev.title) row.dataset.title = ev.title;
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

// 직전 응답과 같으면 DOM을 다시 짓지 않는다 — 2초마다 replaceChildren하면
// 클릭 순간 노드가 교체돼 클릭이 씹힌다(2026-09-16 실측: 자동 클릭이
// actionability 대기에서 타임아웃). 렌더는 변화에만 반응한다. generatedAt는
// 매 응답마다 바뀌므로 비교 서명에서 제외한다.
let lastBoardSig = '';
let lastActivitySig = '';
let lastBoard = null;

// 요약 줄은 매 틱 다시 쓴다 — '갱신' 시계가 폴링 생존 신호다(멈추면 죽은 것이다).
// 컬럼 DOM은 변화에만 다시 짓는다.
function updateSummary() {
  const summary = document.getElementById('summary');
  if (!lastBoard) return;
  const t = lastBoard.terminal;
  summary.className = '';
  summary.textContent = 'WIP doing ' + lastBoard.wip.doing.used + '/' + lastBoard.wip.doing.limit +
    ' · 종결: done ' + t.done + ' · superseded ' + t.superseded + ' · abandoned ' + t.abandoned +
    ' · 갱신 ' + fmtClock(Date.now());
}

async function tick() {
  const summary = document.getElementById('summary');
  try {
    const [b, a] = await Promise.all([fetch('/api/board'), fetch('/api/activity')]);
    if (!b.ok || !a.ok) throw new Error('HTTP ' + b.status + '/' + a.status);
    const board = await b.json();
    const activity = await a.json();
    const boardSig = JSON.stringify({ ...board, generatedAt: null });
    const activitySig = JSON.stringify(activity);
    if (boardSig !== lastBoardSig) {
      lastBoardSig = boardSig;
      lastBoard = board;
      renderBoard(board);
    }
    if (activitySig !== lastActivitySig) {
      lastActivitySig = activitySig;
      renderActivity(activity);
    }
    updateSummary();
  } catch (e) {
    summary.className = 'off';
    summary.textContent = '연결 끊김 — 서버가 죽었거나 보드를 읽을 수 없다 (' + e.message + ')';
  }
}

// ── 카드 상세 보기 — 클릭된 제목의 카드 파일 본문을 읽어 온다 ────────────────
// 본문은 pre-wrap 텍스트로만 심는다(textContent) — 카드 내용은 에이전트가 쓴
// 문자열이라 마크다운 해석·innerHTML을 섞지 않는다. 조회 키(제목)도
// encodeURIComponent로 감싼다.
const modal = document.getElementById('modal');
function closeModal() { modal.hidden = true; }
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function openCard(title) {
  modal.hidden = false;
  const t = document.getElementById('modal-title');
  const metaEl = document.getElementById('modal-meta');
  const body = document.getElementById('modal-body');
  t.textContent = title;
  metaEl.textContent = '';
  body.replaceChildren(el('div', 'sec', '불러오는 중…'));
  try {
    const r = await fetch('/api/card?title=' + encodeURIComponent(title));
    if (!r.ok) throw new Error(r.status === 404 ? '카드를 못 찾았다 — 제목이 바뀌었거나 아직 안 만들어졌다' : 'HTTP ' + r.status);
    const data = await r.json();
    t.textContent = data.title;
    const m = data.meta || {};
    const bits = [STATUS_LABEL[m.status] || m.status];
    if (m.claimed_by) bits.push('클레임 ' + m.claimed_by + (m.claimed_at ? ' (' + m.claimed_at + ')' : ''));
    if (m.not_before) bits.push('시작 예정 ' + m.not_before);
    if (Array.isArray(m.depends_on) && m.depends_on.length) bits.push('의존 ' + m.depends_on.join(', '));
    if (m.created) bits.push('생성 ' + m.created);
    metaEl.textContent = bits.join(' · ');
    const nodes = Object.entries(data.sections || {})
      .filter(([, text]) => text && text.trim())
      .flatMap(([name, text]) => [el('h4', '', name), el('div', 'sec', text.trim())]);
    // 마일스톤 상세 — 멤버 전원 목록(회고 브라우징). 행 클릭은 위임 핸들러가
    // 다시 openCard로 보내 모달이 멤버 카드로 교체된다.
    if (Array.isArray(data.members)) {
      nodes.push(el('h4', '', '멤버 (' + data.members.length + ')'));
      const memberList = el('div', 'ms-members');
      const sorted = [...data.members].sort((a, b) => (MEMBER_RANK[a.status] ?? 9) - (MEMBER_RANK[b.status] ?? 9));
      for (const mem of sorted) {
        const row = el('div', 'ms-member');
        row.dataset.title = mem.title;
        row.append(el('span', 'badge ' + memberBadgeClass(mem.status), STATUS_LABEL[mem.status] || mem.status));
        row.append(document.createTextNode(' ' + mem.title));
        memberList.append(row);
      }
      if (!sorted.length) memberList.append(el('div', 'empty', '멤버 없음'));
      nodes.push(memberList);
    }
    body.replaceChildren(...nodes);
    if (!body.childElementCount) body.append(el('div', 'sec', '(비어 있는 섹션)'));
  } catch (e) {
    body.replaceChildren(el('div', 'sec', '카드를 못 읽었다: ' + e.message));
  }
}

// 위임 한 곳 — 컬럼 카드·종결 카드·활동 행 어디를 눌러도 같은 규칙.
document.addEventListener('click', e => {
  const hit = e.target.closest('[data-title]');
  if (hit && hit.dataset.title) openCard(hit.dataset.title);
});

setInterval(tick, 2000);
tick();
</script>
</body>
</html>
`;
}

module.exports = { monitor, renderMonitorPage };
