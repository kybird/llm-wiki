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
