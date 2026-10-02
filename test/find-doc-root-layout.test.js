// findDocRoot 레이아웃 전환 회귀 — docs/가 정본, 레거시 doc/은 폴백(0.6.0).
// 이중 레이아웃 어느 쪽이든 기존 레포가 계속 읽히는 걸 못박는다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findDocRoot } = require('../lib/find-doc-root');

function real(p) {
  const r = fs.realpathSync.native(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function gitRepo(dir) {
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: dir }).status, 0, 'git init 실패');
  return dir;
}

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-layout-' + name + '-'));
}

test('레거시 doc/wiki만 있으면 doc/을 돌려준다(기존 레포 계속 동작)', () => {
  const repo = gitRepo(tmp('legacy'));
  fs.mkdirSync(path.join(repo, 'doc', 'wiki'), { recursive: true });
  assert.equal(real(findDocRoot(repo)), real(path.join(repo, 'doc')));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('docs/wiki만 있으면 docs/를 돌려준다(새 정본)', () => {
  const repo = gitRepo(tmp('docs'));
  fs.mkdirSync(path.join(repo, 'docs', 'wiki'), { recursive: true });
  assert.equal(real(findDocRoot(repo)), real(path.join(repo, 'docs')));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('둘 다 있으면 docs/가 이긴다(전환 후 잔존 doc/은 무시)', () => {
  const repo = gitRepo(tmp('both'));
  fs.mkdirSync(path.join(repo, 'doc', 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs', 'wiki'), { recursive: true });
  assert.equal(real(findDocRoot(repo)), real(path.join(repo, 'docs')));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('git 아닌 곳 상위 탐색 — doc/wiki 조상도 여전히 발견된다', () => {
  const base = tmp('walkup-legacy');
  fs.mkdirSync(path.join(base, 'doc', 'wiki'), { recursive: true });
  const inner = fs.mkdtempSync(path.join(base, 'sub-'));
  assert.equal(real(findDocRoot(inner)), real(path.join(base, 'doc')));
  fs.rmSync(base, { recursive: true, force: true });
});

test('git 아닌 곳 상위 탐색 — docs/wiki 조상 발견', () => {
  const base = tmp('walkup-docs');
  fs.mkdirSync(path.join(base, 'docs', 'wiki'), { recursive: true });
  const inner = fs.mkdtempSync(path.join(base, 'sub-'));
  assert.equal(real(findDocRoot(inner)), real(path.join(base, 'docs')));
  fs.rmSync(base, { recursive: true, force: true });
});

test('init 전 폴백은 cwd/docs다(새 골격 예고) — 폴백은 startDir이 아니라 process.cwd() 기준(종전 동작)', () => {
  const empty = tmp('empty');
  const inner = fs.mkdtempSync(path.join(empty, 'sub-'));
  const prevCwd = process.cwd();
  process.chdir(inner);
  try {
    assert.equal(real(findDocRoot()), real(path.join(inner, 'docs')));
  } finally {
    process.chdir(prevCwd);
  }
  fs.rmSync(empty, { recursive: true, force: true });
});
