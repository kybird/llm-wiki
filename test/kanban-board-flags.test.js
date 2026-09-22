// board 명령군 플래그 계약 테스트 — 2026-09-16 폐지(board --html/--json)를 회귀로
// 못박는다. 핵심은 조용한 no-op 금지다: bin이 --json을 전역 선추출해 dispatch로
// 넘기므로, board 쪽에서 명시적으로 실패하지 않으면 텍스트 보드를 뱉으며 exit 0이
// 된다 — 에이전트는 종료 코드로만 판단하므로 이건 거짓 성공이다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');
const { localToday } = require('../lib/local-today');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

// kanban-pick-guards.test.js와 같은 방식 — 임시 보드(LLM_WIKI_ROOT)에서 실제
// CLI를 돌린다. 실레포를 건드리지 않는다.
function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-flags-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  // NO_AUTO_UPDATE — maybeAutoUpdate 배너가 stdout을 오염시켜 JSON 파싱이 깨진다.
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return { tmp, docRoot, env, run, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test('board --html / --json — 폐지된 플래그는 exit 1로 실패한다(조용한 성공 금지)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '폐지확인', '--goal', 'g']).status, 0);
    for (const argv of [['board', '--html'], ['board', '--json'], ['board', '--html', '--json']]) {
      const r = b.run(argv);
      assert.equal(r.status, 1, `종료 코드 1: ${argv.join(' ')}`);
      assert.ok(r.stderr.includes('모르는 플래그'), `모르는 플래그 안내: ${argv.join(' ')}`);
    }
  } finally { b.cleanup(); }
});

test('board — 인자 없으면 텍스트 유도 뷰를 내놓는다(기존 동작 유지)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '텍스트유지', '--goal', 'g']).status, 0);
    const r = b.run(['board']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Kanban board'), '보드 제목');
    assert.ok(r.stdout.includes('텍스트유지'), 'TODO 카드 제목');
    assert.ok(r.stdout.includes('종결: done'), '종결 집계');
  } finally { b.cleanup(); }
});

test('board report --json — report는 --json을 계속 받는다(폐지는 뷰 본체만)', () => {
  const b = makeBoard();
  try {
    const r = b.run(['board', 'report', '--json']);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).kind, 'kanban-board-report');
  } finally { b.cleanup(); }
});

test('board report 헤더 — 날짜가 로컬 오늘과 일치한다(UTC 슬라이싱 하루 앞섬 회귀, 2026-09-22)', () => {
  const b = makeBoard();
  try {
    // 자정 경계 이중 확인 — 명령 실행 전후 날짜가 같으면 헤더도 그날이어야 한다.
    // (전후가 다르면 날짜가 넘어간 찰나라 어느 쪽이든 정상 — 통과.)
    const before = localToday();
    const r = b.run(['board', 'report']);
    const after = localToday();
    assert.equal(r.status, 0);
    const m = r.stdout.match(/Board report \((\d{4}-\d{2}-\d{2})\)/);
    assert.ok(m, '헤더 날짜 형식');
    if (before === after) assert.equal(m[1], before, '헤더 = 로컬 오늘');
  } finally { b.cleanup(); }
});

test('board video — 미검증 플래그 조용 무시 결함(2026-09-16 접수)도 같이 못박는다', () => {
  const b = makeBoard();
  try {
    for (const argv of [['board', 'video', '--json'], ['board', 'video', '--bogus']]) {
      const r = b.run(argv);
      assert.equal(r.status, 1, `종료 코드 1: ${argv.join(' ')}`);
      assert.ok(r.stderr.includes('모르는 플래그'), `모르는 플래그 안내: ${argv.join(' ')}`);
    }
    // 실패한 video는 타임라인을 남기지 않는다 — 거부는 상태를 바꾸지 않는다.
    assert.ok(!fs.existsSync(path.join(b.docRoot, 'kanban', 'board-timeline.json')), '타임라인 미생성');
  } finally { b.cleanup(); }
});

test('board --help — 사용법만 출력하고 exit 0이다(탐색 가드)', () => {
  const b = makeBoard();
  try {
    const r = b.run(['board', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('llm-wiki board'), '사용법 문자열(USAGE.board)');
  } finally { b.cleanup(); }
});
