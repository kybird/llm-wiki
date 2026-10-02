// 첫 명령 자동 마이그레이션 회귀 — doc/ → docs/(0.6.0 레이아웃 전환).
// 실제 bin을 spawn해 종단으로 못박는다: 판정·git mv·옵트아웃·제외 명령·폴백.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BIN = path.resolve(__dirname, '..', 'bin', 'llm-wiki.js');

// spawn되는 board·search가 recordProject(~/.llm-wiki/projects.json 등록부)를 때리지
// 않게 state 디렉터리를 밀폐한다 — 등록부 오염 사고(2026-09-19)의 재발 방지 관례.
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-migrate-state-'));

function run(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, LLM_WIKI_STATE_DIR: STATE },
  });
}

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-migrate-' + name + '-'));
}

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
}

function gitRepo(dir) {
  assert.equal(git(['init', '--quiet'], dir).status, 0, 'git init 실패');
  return dir;
}

function commitAll(dir, msg) {
  assert.equal(git(['add', '-A'], dir).status, 0, 'git add 실패');
  assert.equal(
    git(['-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', msg], dir).status,
    0, '커밋 실패');
}

function legacyScaffold(dir) {
  fs.mkdirSync(path.join(dir, 'doc', 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'doc', 'wiki', 'index.md'), '# index\n');
}

test('레거시 git 레포 — 첫 명령(board)이 doc을 docs로 옮기고 rename을 스테이징한다', () => {
  const repo = gitRepo(tmp('e2e'));
  legacyScaffold(repo);
  commitAll(repo, 'legacy');

  const r = run(['board'], repo);
  assert.ok(!fs.existsSync(path.join(repo, 'doc')), 'doc/이 사라졌어야 한다');
  assert.ok(fs.existsSync(path.join(repo, 'docs', 'wiki', 'index.md')), 'docs/로 이동돼 있어야 한다');
  const status = git(['status', '--porcelain'], repo).stdout || '';
  assert.ok(/^R\s+\S*doc\//m.test(status) || /^R/m.test(status), `rename이 스테이징 돼 있어야 한다:\n${status}`);
  assert.ok(r.stdout.includes('[doc → docs]'), `요약이 출력돼야 한다:\n${r.stdout}`);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('migrateDocDir:false 옵트아웃 — 이동 없이 레거시로 계속 동작한다', () => {
  const repo = gitRepo(tmp('optout'));
  legacyScaffold(repo);
  commitAll(repo, 'legacy');
  fs.writeFileSync(path.join(repo, 'llm-wiki.config.json'), JSON.stringify({ migrateDocDir: false }));

  run(['board'], repo);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'wiki')), 'doc/이 그대로여야 한다');
  assert.ok(!fs.existsSync(path.join(repo, 'docs')), 'docs/가 생겨선 안 된다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('wiki 없는 일반 doc/ 폴더는 건드리지 않는다', () => {
  const repo = gitRepo(tmp('plain-doc'));
  fs.mkdirSync(path.join(repo, 'doc'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'doc', 'notes.txt'), 'not llm-wiki\n');
  commitAll(repo, 'plain');

  const r = run(['search', 'x'], repo);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'notes.txt')), '일반 doc/은 그대로여야 한다');
  assert.ok(!fs.existsSync(path.join(repo, 'docs')), 'docs/가 생겨선 안 된다');
  assert.ok(!r.stdout.includes('[doc → docs]'), '마이그레이션 요약이 나오면 안 된다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('wait는 마이그레이션을 트리거하지 않는다(stdout 계약 — hash:16e7eb9 계열)', () => {
  const repo = gitRepo(tmp('wait-exempt'));
  legacyScaffold(repo);
  commitAll(repo, 'legacy');

  const r = run(['wait', '--for', 'any', '--timeout', '1'], repo);
  assert.equal(r.status, 2, `타임아웃 종료 코드 2여야 한다: ${r.status}`);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'wiki')), 'wait로는 이동하지 않아야 한다');
  assert.ok(!fs.existsSync(path.join(repo, 'docs')), 'docs/가 생겨선 안 된다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('git 없는 폴더 — 파일시스템 rename 폴백으로 이동한다', () => {
  const dir = tmp('nogit');
  legacyScaffold(dir);

  const r = run(['board'], dir);
  assert.ok(!fs.existsSync(path.join(dir, 'doc')), 'doc/이 사라졌어야 한다');
  assert.ok(fs.existsSync(path.join(dir, 'docs', 'wiki', 'index.md')), 'docs/로 이동돼 있어야 한다');
  assert.ok(r.stdout.includes('파일시스템 rename'), `폴백 표기가 있어야 한다:\n${r.stdout}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('관련 없는 docs/가 이미 있으면 덮지 않고 보류 안내한다', () => {
  const repo = gitRepo(tmp('docs-exists'));
  legacyScaffold(repo);
  commitAll(repo, 'legacy');
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'unrelated.txt'), 'keep me\n');

  const r = run(['board'], repo);
  assert.ok(fs.existsSync(path.join(repo, 'doc', 'wiki')), '판단은 사람에게 — doc/이 그대로여야 한다');
  assert.ok(fs.existsSync(path.join(repo, 'docs', 'unrelated.txt')), '기존 docs/를 건드리면 안 된다');
  assert.ok(r.stdout.includes('보류'), `보류 안내가 출력돼야 한다:\n${r.stdout}`);
  fs.rmSync(repo, { recursive: true, force: true });
});

test.after(() => {
  try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* 정리 실패 무시 */ }
});
