// init docs/ 스캐폴드 회귀 — 새 init은 docs/를 만들고, 레거시 doc/ 레포의 init
// 재실행은 마이그레이션을 발화시킨 뒤 docs/를 상대한다(0.6.0 레이아웃 전환).
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-init-docs-' + name + '-'));
}

function runInit(cwd) {
  const env = { ...process.env, LLM_WIKI_NO_AUTO_UPDATE: '1' };
  return spawnSync('node', [CLI, 'init'], { cwd, env, encoding: 'utf8', timeout: 60000 });
}

test('새 init은 docs/ 골격을 만든다 — doc/이 아니라', () => {
  const dir = tmp('fresh');
  try {
    const r = runInit(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'wiki', 'index.md')), 'docs/wiki 주입');
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'raw')), 'docs/raw 주입');
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'kanban', 'board.yml')), 'docs/kanban 주입');
    assert.ok(!fs.existsSync(path.join(dir, 'doc')), 'doc/이 생겨선 안 된다');
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.ok(agents.includes('docs/kanban/'), 'AGENTS.md 시드가 docs/ 경로를 언급한다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('레거시 doc/ 레포의 init 재실행 — 마이그레이션 발화 후 doc/을 재생성하지 않는다', () => {
  const dir = tmp('legacy-rerun');
  try {
    fs.mkdirSync(path.join(dir, 'doc', 'wiki'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'doc', 'wiki', 'index.md'), '# legacy\n');
    const r = runInit(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('[doc → docs]'), `마이그레이션 요약:\n${r.stdout}`);
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'wiki', 'index.md')), '레거시 위키가 docs/로 이동');
    assert.ok(!fs.existsSync(path.join(dir, 'doc')), 'doc/ 재생성 금지');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('옵트아웃 레포의 init 재실행 — doc/ 골격을 유지하고 docs/를 만들지 않는다', () => {
  const dir = tmp('optout-rerun');
  try {
    fs.mkdirSync(path.join(dir, 'doc', 'wiki'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'doc', 'wiki', 'index.md'), '# legacy\n');
    fs.writeFileSync(path.join(dir, 'llm-wiki.config.json'), JSON.stringify({ migrateDocDir: false }));
    const r = runInit(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes('[doc → docs]'), '마이그레이션이 발화하면 안 된다');
    assert.ok(fs.existsSync(path.join(dir, 'doc', 'wiki', 'index.md')), '레거시 골격 유지');
    assert.ok(!fs.existsSync(path.join(dir, 'docs')), 'docs/ 생성 금지');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
