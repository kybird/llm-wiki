// npm 업데이트 자동 반영 회귀 — 버전 스탬프(~/.llm-wiki/auto-update, 테스트는
// LLM_WIKI_STATE_DIR로 재배치)와 설치 버전이 다르면 다음 명령이 사본을 자동 갱신한다.
// 마커 계약을 그대로 쓴다: 마커 살아있으면 갱신, 지웠으면 사용자 수정본으로 건너뜀.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stampPath } = require('../lib/auto-update');
const { version: PKG_VERSION } = require('../package.json');

const PKG_ROOT = path.join(__dirname, '..');

// 임시 소비 레포 — doc/wiki + 칸반 골격. 스탬프 상태는 임시 state 디렉터리에 둔다.
function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-au-'));
  const docRoot = path.join(tmp, 'doc');
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  require('../lib/kanban').scaffold(docRoot);
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-au-state-'));
  const run = (args, extraEnv = {}) => spawnSync('node', [path.join(PKG_ROOT, 'bin', 'llm-wiki.js'), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: state, ...extraEnv },
  });
  return { tmp, docRoot, state, run };
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 정리 실패는 무시 */ }
  }
}

test('버전이 바뀌면 다음 명령이 사본을 자동 갱신하고 스탬프를 찍는다', () => {
  const b = makeRepo();
  try {
    // 낡은 정본(마커 살아있음)과 사용자 수정본(마커 지움)을 심는다.
    fs.mkdirSync(path.join(b.tmp, '.agents', 'skills', 'work-loop'), { recursive: true });
    fs.writeFileSync(path.join(b.tmp, '.agents', 'skills', 'work-loop', 'SKILL.md'),
      'old prompt\nskill-version: 1\n');
    fs.mkdirSync(path.join(b.tmp, '.agents', 'skills', 'wiki-log'), { recursive: true });
    fs.writeFileSync(path.join(b.tmp, '.agents', 'skills', 'wiki-log', 'SKILL.md'), '내 수정본\n');

    const r = b.run(['board']);
    assert.equal(r.status, 0, `board 실패: ${r.stderr}`);

    // 마커 살아있던 낡은 사본 → 정본으로 갱신.
    const fresh = fs.readFileSync(path.join(PKG_ROOT, 'skills', 'work-loop', 'SKILL.md'), 'utf8');
    assert.equal(
      fs.readFileSync(path.join(b.tmp, '.agents', 'skills', 'work-loop', 'SKILL.md'), 'utf8'),
      fresh, '낡은 사본이 정본으로 갱신돼야 한다');
    // 마커 없는 사본 → 사용자 수정본, 그대로.
    assert.equal(
      fs.readFileSync(path.join(b.tmp, '.agents', 'skills', 'wiki-log', 'SKILL.md'), 'utf8'),
      '내 수정본\n', '사용자 수정본을 덮쓰면 안 된다');
    // 스탬프 경로 계산도 임시 state 기준이어야 한다 — env를 걸고 stampPath로 구한다.
    process.env.LLM_WIKI_STATE_DIR = b.state;
    const sp = stampPath(b.tmp);
    delete process.env.LLM_WIKI_STATE_DIR;
    assert.equal(fs.readFileSync(sp, 'utf8').trim(), PKG_VERSION, '스탬프에 설치 버전이 찍혀야 한다');
    assert.ok(r.stdout.includes('자동 반영'), `보고 줄이 없다: ${r.stdout}`);
    assert.ok(r.stdout.includes('updated 1'), `갱신 수를 보고해야 한다: ${r.stdout}`);
  } finally { cleanup(b.tmp, b.state); }
});

test('멱등 — 같은 버전의 두 번째 명령은 다시 쓰지 않는다', () => {
  const b = makeRepo();
  try {
    assert.equal(b.run(['board']).status, 0);
    const copy = path.join(b.tmp, '.agents', 'skills', 'work-loop', 'SKILL.md');
    const before = fs.statSync(copy).mtimeMs;
    assert.equal(b.run(['board']).status, 0);
    assert.equal(fs.statSync(copy).mtimeMs, before, '같은 버전 재실행이 사본을 다시 쓰면 안 된다');
  } finally { cleanup(b.tmp, b.state); }
});

test('옵트아웃 — autoUpdate:false면 건드리지 않는다', () => {
  const b = makeRepo();
  try {
    fs.writeFileSync(path.join(b.tmp, 'llm-wiki.config.json'), JSON.stringify({ autoUpdate: false }));
    fs.mkdirSync(path.join(b.tmp, '.agents', 'skills', 'work-loop'), { recursive: true });
    fs.writeFileSync(path.join(b.tmp, '.agents', 'skills', 'work-loop', 'SKILL.md'),
      'old prompt\nskill-version: 1\n');

    const r = b.run(['board']);
    assert.equal(r.status, 0, `board 실패: ${r.stderr}`);
    assert.equal(
      fs.readFileSync(path.join(b.tmp, '.agents', 'skills', 'work-loop', 'SKILL.md'), 'utf8'),
      'old prompt\nskill-version: 1\n', '옵트아웃했으면 사본을 건드리지 않는다');
    process.env.LLM_WIKI_STATE_DIR = b.state;
    const sp = stampPath(b.tmp);
    delete process.env.LLM_WIKI_STATE_DIR;
    assert.ok(!fs.existsSync(sp), '옵트아웃 시 스탬프도 찍지 않는다');
    assert.ok(!r.stdout.includes('자동 반영'), '옵트아웃 시 보고 줄이 없어야 한다');
  } finally { cleanup(b.tmp, b.state); }
});

test('init된 적 없는 디렉터리는 아무것도 쓰지 않는다', () => {
  const b = makeRepo();
  try {
    // doc/ 골격을 지워 init 흔적 없는 상태를 만든다 — findDocRoot 폴백(cwd/doc)이
    // 낯선 디렉터리를 돌려줘도 여기서 쓰기가 일어나면 안 된다.
    fs.rmSync(b.docRoot, { recursive: true, force: true });
    b.run(['search', '아무거나']); // 종료 코드는 물어보지 않는다 — 요점은 쓰기 부재
    assert.ok(!fs.existsSync(path.join(b.tmp, '.agents')), '모르는 리포에 .agents를 만들면 안 된다');
    assert.ok(!fs.existsSync(path.join(b.state, 'auto-update')), '스탬프도 남기지 않는다');
  } finally { cleanup(b.tmp, b.state); }
});

// 스탬프 경로는 레포 루트의 해시 — 포맷이 바뀌면(버전별 스탬프 무효화) 이 테스트가 지킨다.
test('stampPath — 같은 루트는 같은 스탬프, 다른 루트는 다른 스탬프', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-au-state-'));
  try {
    process.env.LLM_WIKI_STATE_DIR = state;
    assert.equal(stampPath('D:/x/repo'), stampPath('D:\\x\\repo'));
    assert.notEqual(stampPath('D:/x/repo'), stampPath('D:/x/other'));
    delete process.env.LLM_WIKI_STATE_DIR;
  } finally {
    delete process.env.LLM_WIKI_STATE_DIR;
    cleanup(state);
  }
});
