// qmd 동반 갱신 회귀 (2026-11-21 B안) — auto-update 패스가 설치된 qmd를 최신으로
// 끌어올린다. 순수 로직(syncQmdCore)은 주입으로 게이트, 결합부(syncQmd)는
// LLM_WIKI_STATE_DIR 격리 계약(글로벌 npm 부작용도 격리)으로 게이트한다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { syncQmdCore, compareVersions, qmdPackageRoot, qmdStampPath } = require('../lib/auto-update');
const { version: PKG_VERSION } = require('../package.json');

const PKG_ROOT = path.join(__dirname, '..');

function harness({ installed = '2.8.3', latest = '2.9.0', failView = false, failInstall = false, stamp = null } = {}) {
  const calls = { view: 0, install: 0, installArgs: [] };
  let stampVal = stamp;
  const res = syncQmdCore({
    qmdPkg: installed === null ? null : { dir: '/fake', version: installed },
    latestFn: () => { calls.view++; if (failView) throw new Error('network down'); return latest; },
    installFn: (v) => { calls.install++; calls.installArgs.push(v); if (failInstall) throw new Error('EPERM'); },
    stampRead: () => stampVal,
    stampWrite: (v) => { stampVal = v; },
  });
  return { res, calls, stampNow: () => stampVal };
}

test('구버전 → npm i -g 실행 · from→to 보고 · 스탬프 기입', () => {
  const h = harness();
  assert.deepEqual(h.res, { from: '2.8.3', to: '2.9.0' });
  assert.equal(h.calls.install, 1);
  assert.deepEqual(h.calls.installArgs, ['2.9.0']);
  assert.equal(h.stampNow(), PKG_VERSION);
});

test('이미 최신 → 설치 없음, 스탬프 기입(이번 버전은 다시 묻지 않는다)', () => {
  const h = harness({ installed: '2.9.0' });
  assert.equal(h.res, null);
  assert.equal(h.calls.install, 0);
  assert.equal(h.stampNow(), PKG_VERSION);
});

test('미설치 → 아무것도 하지 않는다(선택 의존성 — 설치하지 않는다)', () => {
  const h = harness({ installed: null });
  assert.equal(h.res, null);
  assert.equal(h.calls.view, 0);
  assert.equal(h.calls.install, 0);
  assert.equal(h.stampNow(), null);
});

test('기계 스탬프 완료 → npm 호출 자체를 건너뛴다(다른 레포 중복 방지)', () => {
  const h = harness({ stamp: PKG_VERSION });
  assert.equal(h.res, null);
  assert.equal(h.calls.view, 0);
  assert.equal(h.calls.install, 0);
});

test('npm view 실패 → {error} 보고, 스탬프 미기입 → 다음 기회 재시도', () => {
  const h = harness({ failView: true });
  assert.ok(h.res.error.includes('npm view 실패'), JSON.stringify(h.res));
  assert.equal(h.calls.install, 0);
  assert.equal(h.stampNow(), null);
});

test('npm i 실패 → throw가 상위 catch로 회수돼 스탬프 미기입(재시도 보장)', () => {
  // 결합부(syncQmd)의 try/catch가 {error}로 바꾼다 — core는 throw를 그대로 던진다.
  assert.throws(() => harness({ failInstall: true }), /EPERM/);
});

test('버전 비교 — 자리수·불일치 순서', () => {
  assert.equal(compareVersions('2.8.3', '2.9.0'), -1);
  assert.equal(compareVersions('2.9.0', '2.9.0'), 0);
  assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
  assert.equal(compareVersions('2.9', '2.9.0'), 0);
  assert.equal(compareVersions('3.0.0', '2.99.99'), 1);
});

test('qmdPackageRoot — CLI 진입점에서 package.json 이름 확인하며 상향', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-qmd-'));
  try {
    fs.mkdirSync(path.join(tmp, 'dist', 'cli'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: '@tobilu/qmd', version: '9.9.9' }));
    fs.writeFileSync(path.join(tmp, 'dist', 'cli', 'qmd.js'), '');
    assert.equal(qmdPackageRoot(path.join(tmp, 'dist', 'cli', 'qmd.js')).version, '9.9.9');
    // 이름이 다른 트리는 null — 진입점이 다른 패키지를 가리킬 가능성 차단
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'other' }));
    assert.equal(qmdPackageRoot(path.join(tmp, 'dist', 'cli', 'qmd.js')), null);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// 결합부 격리 계약 — STATE_DIR 밀폐 중 spawn되는 어떤 명령도 글로벌 qmd 갱신을
// 시도하지 않는다(테스트가 진짜 npm i -g를 쏘는 사고 방지).
test('STATE_DIR 격리 중 bin 명령은 qmd 동반 갱신을 하지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-au2-'));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-au2-state-'));
  try {
    const docRoot = path.join(tmp, 'docs');
    fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
    require('../lib/kanban').scaffold(docRoot);
    const r = spawnSync('node', [path.join(PKG_ROOT, 'bin', 'llm-wiki.js'), 'board'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: state },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes('qmd 동반'), `격리 중 qmd 갱신 보고가 나오면 안 된다: ${r.stdout}`);
    process.env.LLM_WIKI_STATE_DIR = state;
    assert.ok(!fs.existsSync(qmdStampPath()), '격리 state에 qmd 스탬프가 있으면 안 된다');
    delete process.env.LLM_WIKI_STATE_DIR;
  } finally {
    delete process.env.LLM_WIKI_STATE_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(state, { recursive: true, force: true });
  }
});
