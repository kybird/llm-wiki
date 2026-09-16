// monitor 회귀 테스트 — 읽기 전용 실시간 뷰어의 계약을 못박는다:
//   ① stdout 첫 줄이 http://127.0.0.1:<port> (테스트·스크립트가 파싱하는 계약)
//   ② /api/board가 보드 뷰를, /api/activity가 활동을 내놓는다 (클레임 주체·시각 포함)
//   ③ 쓰기 메서드는 405 — 카드 쓰기는 CLI뿐이다
//   ④ 모르는 플래그·잘못된 --port는 exit 1 (조용한 no-op 금지, 규칙은 명령 간 균일)
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');
const { renderMonitorPage } = require('../lib/kanban-monitor');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-mon-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  // NO_AUTO_UPDATE — 배너가 stdout 첫 줄(URL 계약)을 밀어내면 안 된다.
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return { tmp, docRoot, env, run, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(get, check, ms = 10000) {
  const deadline = Date.now() + ms;
  let v;
  while (Date.now() < deadline) {
    v = get();
    if (check(v)) return v;
    await sleep(100);
  }
  return v;
}

// --port 0(임시 포트)로 띄우고 첫 줄 URL을 기다린다. out/err은 게터로 — 구조
// 분해하면 그 순간의 스냅샷이 복사된다(kanban-wait 테스트가 밟은 Windows 함정).
async function startMonitor(b) {
  const child = spawn('node', [CLI, 'monitor', '--port', '0'], { env: b.env });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => { out += d; });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', d => { err += d; });
  const firstLine = await waitFor(() => out.split('\n')[0], l => /^http:\/\/127\.0\.0\.1:\d+$/.test(l || ''));
  assert.ok(firstLine, `서버가 첫 줄에 URL을 출력해야 한다 (stdout: ${out} / stderr: ${err})`);
  return { child, url: firstLine, get out() { return out; }, get err() { return err; } };
}

test('페이지 스크립트 구문 게이트 — 노드 테스트로 최소한 파싱은 못박는다', () => {
  // 브라우저에서만 도는 스크립트가 문자열 안에서 조용히 죽는 사고 2건(2026-09-16:
  // sed 변수 혼동·중괄호 중복) — 노드 테스트는 파싱이라도 검사한다. 런타임 검증은
  // 여전히 브라우저 실측이 게이트다([[ui-changes-need-browser-verification]]).
  const page = renderMonitorPage();
  const m = page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, '스크립트 블록이 있다');
  assert.doesNotThrow(() => new Function(m[1]), '페이지 스크립트 구문 오류 없음');
});

test('monitor — URL 첫 줄 계약 · /api 뷰(클레임 주체·시각) · 쓰기 405 · 모르는 경로 404', async () => {
  const b = makeBoard();
  const m = await startMonitor(b);
  try {
    assert.equal(b.run(['card', 'new', '모니터대상', '--goal', 'g', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--claim', '테스터', '--card', '모니터대상']).status, 0);

    const board = await (await fetch(`${m.url}/api/board`)).json();
    assert.equal(board.kind, 'kanban-board');
    for (const col of ['todo', 'doing', 'review']) assert.ok(Array.isArray(board.columns[col]), `컬럼 ${col}`);
    const picked = board.columns.doing.find(c => c.title === '모니터대상');
    assert.ok(picked, 'pick한 카드가 doing 컬럼에 있다');
    assert.equal(picked.claimedBy, '테스터');
    assert.ok(picked.claimedAt, '클레임 시각이 노출된다(경과 계산용)');

    const page = await (await fetch(m.url + '/')).text();
    assert.ok(page.includes('llm-wiki monitor'), '페이지 제목');
    assert.ok(page.includes('/api/board') && page.includes('/api/activity'), '폴링 대상 엔드포인트');
    assert.ok(page.includes('list-terminal'), '종결 컬럼 골격');
    assert.ok(page.includes('modal-title') && page.includes('/api/card'), '상세 보기 모달 골격');

    const post = await fetch(`${m.url}/api/board`, { method: 'POST' });
    assert.equal(post.status, 405, '쓰기 메서드는 405');
    assert.ok((await post.text()).includes('CLI'), '거부 사유 — 쓰는 건 CLI뿐');

    assert.equal((await fetch(m.url + '/nope')).status, 404);

    const act = await (await fetch(m.url + '/api/activity')).json();
    assert.equal(act.kind, 'kanban-activity');
    assert.ok(act.events.some(e => e.title === '모니터대상' && e.action === 'claimed'), '활동 스트림에 집김 이벤트');

    // 종결 컬럼(2026-09-16 후속) — 완료된 카드가 최근 목록에 오른다.
    assert.equal(b.run(['done', '모니터대상', '--result', '완료']).status, 0);
    const after = await (await fetch(`${m.url}/api/board`)).json();
    assert.ok(Array.isArray(after.terminalRecent), 'terminalRecent 배열');
    const top = after.terminalRecent[0];
    assert.equal(top.title, '모니터대상', '가장 최근 종결 항목');
    assert.equal(top.kind, 'done');
    assert.ok(top.at && !Number.isNaN(Date.parse(top.at)), '종결 시각(mtime ISO)');

    // 카드 상세 보기(같은 날 후속) — 종결 카드 본문도 메타·섹션 통째로.
    const detail = await (await fetch(`${m.url}/api/card?title=${encodeURIComponent('모니터대상')}`)).json();
    assert.equal(detail.kind, 'kanban-card');
    assert.equal(detail.meta.status, 'done');
    assert.ok(detail.sections.Goal.includes('g'), 'Goal 섹션 본문');
    assert.ok(String(detail.sections.Result).includes('완료'), 'Result 섹션 본문');
    const missing = await fetch(`${m.url}/api/card?title=${encodeURIComponent('없는 제목')}`);
    assert.equal(missing.status, 404);
  } finally {
    m.child.kill();
    b.cleanup();
  }
});

test('monitor 플래그 계약 — 모르는 플래그·잘못된 --port는 exit 1, --help는 exit 0', () => {
  const b = makeBoard();
  try {
    const bad = b.run(['monitor', '--bogus']);
    assert.equal(bad.status, 1, '모르는 플래그');
    assert.ok(bad.stderr.includes('모르는 플래그'), '안내 문구');

    const badPort = b.run(['monitor', '--port', 'not-a-number']);
    assert.equal(badPort.status, 1, '숫자 아닌 포트');
    assert.ok(badPort.stderr.includes('--port'), '포트 안내');

    const help = b.run(['monitor', '--help']);
    assert.equal(help.status, 0, '탐색 가드');
    assert.ok(help.stdout.includes('llm-wiki monitor'), '사용법 문자열(USAGE.monitor)');
  } finally { b.cleanup(); }
});

test('monitor 마일스톤 패널 — /api/board 유도 집계·페이지 골격·상세 멤버(3.8)', async () => {
  const b = makeBoard();
  assert.equal(b.run(['card', 'new', '목적 계획', '--kind', 'milestone', '--goal', '대의를 이룬다']).status, 0);
  assert.equal(b.run(['card', 'new', '패널멤버', '--milestone', '목적 계획', '--goal', 'g', '--ac', 'AC1']).status, 0);
  const m = await startMonitor(b);
  try {
    const board = await (await fetch(`${m.url}/api/board`)).json();
    assert.ok(Array.isArray(board.milestones) && board.milestones.length === 1, '마일스톤 1개');
    const ms = board.milestones[0];
    assert.equal(ms.title, '목적 계획');
    assert.equal(ms.counts.active, 1, '활성 멤버 1');
    assert.equal(ms.total, 1);
    assert.ok(ms.goal.includes('대의'), 'Goal(대의) 노출');
    assert.ok(!board.columns.todo.some(c => c.title === '목적 계획'), '컬럼 제외');
    assert.equal(board.columns.todo[0].milestone, '목적 계획', 'viewCard에 소속 노출');

    const page = await (await fetch(m.url + '/')).text();
    assert.ok(page.includes('list-milestones'), '패널 골격');

    const detail = await (await fetch(`${m.url}/api/card?title=${encodeURIComponent('목적 계획')}`)).json();
    assert.ok(Array.isArray(detail.members) && detail.members[0].title === '패널멤버', '상세에 멤버 목록');
  } finally {
    m.child.kill();
    b.cleanup();
  }
});

test('monitor 멱등 재기동 — 우리 모니터가 있으면 exit 0으로 재사용, 남의 포트는 exit 1', async () => {
  const b = makeBoard();
  const m = await startMonitor(b); // --port 0 → 임시 포트를 URL에서 얻는다
  const fixedPort = Number(new URL(m.url).port);
  try {
    const again = b.run(['monitor', '--port', String(fixedPort)]);
    assert.equal(again.status, 0, `재사용은 성공: ${again.stdout}${again.stderr}`);
    assert.ok(again.stdout.includes(m.url), '같은 URL 보고');
    assert.ok(again.stdout.includes('재사용'), '멱등 안내');

    // 남의 서버가 잡은 포트 — 침묵하지 않고 실패(포트 안내).
    const foreign = require('node:http').createServer((req, res) => res.end('not llm-wiki'));
    await new Promise(res => foreign.listen(0, '127.0.0.1', res));
    const foreignPort = foreign.address().port;
    const clash = b.run(['monitor', '--port', String(foreignPort)]);
    assert.equal(clash.status, 1, '남의 포트는 실패');
    assert.ok(clash.stderr.includes('이미 쓰이고 있다'), 'EADDRINUSE 안내');
    await new Promise(res => foreign.close(res));
  } finally {
    m.child.kill();
    b.cleanup();
  }
});
