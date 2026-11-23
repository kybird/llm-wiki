// 자기 갱신 회귀 (2026-11-23) — 실행 버전 < npm 최신이면 글로벌 설치본을 실제로
// 끌어올린다. 사용자 판정: 자동 갱신은 설치까지가 기본기능(안내만 하던 선행 구현은
// superseded). 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  maybeAutoUpdate, stampPath, selfUpdateCore, selfUpdateResultLine,
  selfUpdateStampPath, selfUpdateResultPath, SELF_UPDATE_INTERVAL_MS,
} = require('../lib/auto-update');
const { version: PKG_VERSION } = require('../package.json');

// ── 순수 로직(selfUpdateCore) — 스탬프는 메모리, 시계·설치는 직접 돌린다 ──────────

function harness(opts = {}) {
  let stamp = opts.stamp === undefined ? null : opts.stamp;
  let now = opts.now === undefined ? 1_700_000_000_000 : opts.now;
  const calls = { latest: 0, kind: 0, installs: [], writes: [] };
  const o = {
    pkgVersion: '1.0.0',
    intervalMs: SELF_UPDATE_INTERVAL_MS,
    nowFn: () => now,
    stampRead: () => stamp,
    stampWrite: (v) => {
      if (opts.writeThrows) throw new Error('EACCES');
      stamp = v;
      calls.writes.push(v);
    },
    latestFn: () => {
      calls.latest += 1;
      if (opts.latestThrows) throw new Error('ETIMEDOUT');
      return opts.latest === undefined ? '1.1.0' : opts.latest;
    },
    installKind: () => {
      calls.kind += 1;
      return opts.kind === undefined ? 'global' : opts.kind;
    },
    startInstall: (v) => {
      if (opts.installThrows) throw new Error('spawn EACCES');
      calls.installs.push(v);
    },
  };
  return { o, calls, advance: (ms) => { now += ms; } };
}

test('스큐 + 글로벌 설치 — 그 버전의 설치를 시작한다 {from, to, started}', () => {
  const h = harness();
  assert.deepEqual(selfUpdateCore(h.o), { from: '1.0.0', to: '1.1.0', started: true });
  assert.deepEqual(h.calls.installs, ['1.1.0']);
  assert.deepEqual(h.calls.writes, [String(h.o.nowFn())]);
});

test('최신이면 침묵(null) — 설치 형태도 묻지 않는다', () => {
  const h = harness({ latest: '1.0.0' });
  assert.equal(selfUpdateCore(h.o), null);
  assert.equal(h.calls.kind, 0);
  assert.equal(h.calls.writes.length, 1);
});

test('스탬프 없음·빈 스탬프·쓰레기 스탬프 전부 이번에 본다', () => {
  for (const stamp of [null, '', 'not-a-number']) {
    const h = harness({ stamp });
    selfUpdateCore(h.o);
    assert.equal(h.calls.latest, 1, `stamp=${JSON.stringify(stamp)}`);
  }
});

test('주기 안에는 npm view를 부르지 않는다 — 경계에서 다시 보고 스큐면 다시 설치한다', () => {
  const h = harness();
  selfUpdateCore(h.o);
  h.advance(SELF_UPDATE_INTERVAL_MS - 1);
  assert.equal(selfUpdateCore(h.o), null);
  assert.equal(h.calls.latest, 1, '하루 안의 재실행은 네트워크를 부르면 안 된다');
  h.advance(1);
  assert.deepEqual(selfUpdateCore(h.o), { from: '1.0.0', to: '1.1.0', started: true });
  assert.deepEqual(h.calls.installs, ['1.1.0', '1.1.0'], '스큐가 남아 있으면 하루 뒤 다시 시도한다');
});

test('npm view 실패 — {error} + 스탬프는 찍는다(오프라인 머신의 매 명령 재시도 방지)', () => {
  const h = harness({ latestThrows: true });
  const r = selfUpdateCore(h.o);
  assert.match(r.error, /npm view 실패/);
  assert.equal(h.calls.writes.length, 1);
  selfUpdateCore(h.o);
  assert.equal(h.calls.latest, 1, '주기 안의 재실행은 npm view를 부르지 않는다');
});

test('레지스트리 응답 해석 불가 — {error}, 설치 형태·설치까지 가지 않는다', () => {
  const h = harness({ latest: 'npm ERR! code E404' });
  assert.match(selfUpdateCore(h.o).error, /해석 불가/);
  assert.equal(h.calls.kind, 0);
  assert.deepEqual(h.calls.installs, []);
});

test('버전 문자열이 엄격한 semver가 아니면 설치하지 않는다 — 셸 명령에 들어가므로', () => {
  for (const latest of ['1.2.3; echo pwned', '1.2.3 && calc', '1.2.3 $(id)', 'v1.2.3', '1.2', '1.2.3\n4.0.0; x']) {
    const h = harness({ latest });
    const r = selfUpdateCore(h.o);
    assert.match(String(r && r.error), /해석 불가/, `latest=${JSON.stringify(latest)}`);
    assert.deepEqual(h.calls.installs, [], `latest=${JSON.stringify(latest)}은 설치하면 안 된다`);
  }
});

test('스탬프를 못 쓰면 네트워크를 부르지 않는다 — 예외가 그대로 올라간다', () => {
  const h = harness({ writeThrows: true });
  assert.throws(() => selfUpdateCore(h.o), /EACCES/);
  assert.equal(h.calls.latest, 0);
});

test('시계가 거꾸로 간 스탬프(미래 시각)는 못 믿는다 — 다시 본다', () => {
  const now = 1_700_000_000_000;
  const h = harness({ stamp: String(now + SELF_UPDATE_INTERVAL_MS), now });
  selfUpdateCore(h.o);
  assert.equal(h.calls.latest, 1);
});

test('npm link — 링크가 작업 트리를 가리키면 설치하지 않는다 {skipped: link}', () => {
  const h = harness({ kind: 'link' });
  assert.deepEqual(selfUpdateCore(h.o), { from: '1.0.0', to: '1.1.0', skipped: 'link' });
  assert.deepEqual(h.calls.installs, []);
});

test('소스 체크아웃·npx 캐시·레포 로컬 설치 — 설치하지 않는다 {skipped: other}', () => {
  const h = harness({ kind: 'other' });
  assert.deepEqual(selfUpdateCore(h.o), { from: '1.0.0', to: '1.1.0', skipped: 'other' });
  assert.deepEqual(h.calls.installs, []);
});

test('글로벌인데 설치를 시작하지 못하면 수동 안내로 {manual: true}', () => {
  const h = harness({ installThrows: true });
  const r = selfUpdateCore(h.o);
  assert.equal(r.manual, true);
  assert.equal(r.started, undefined);
  assert.match(r.error, /spawn EACCES/);
});

test('selfUpdateResultLine — 성공·실패·쓰레기', () => {
  assert.match(selfUpdateResultLine({ ok: true, to: '1.1.0' }), /자동 갱신 완료.*v1\.1\.0/);
  const fail = selfUpdateResultLine({ ok: false, error: 'npm ERR! code EACCES' });
  assert.match(fail, /자동 갱신 실패\(npm ERR! code EACCES\)/);
  assert.match(fail, /npm update -g @kybird\/llm-wiki/, '실패 줄에는 수동 명령이 있어야 한다');
  assert.equal(selfUpdateResultLine(null), null);
  assert.equal(selfUpdateResultLine('garbage'), null);
  assert.equal(selfUpdateResultLine({}), null);
});

// ── 배선(maybeAutoUpdate) — 임시 레포 + 격리 state, in-process ─────────────────

function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-selfupd-'));
  const docRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  require('../lib/kanban').scaffold(docRoot);
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-selfupd-state-'));
  return { tmp, docRoot, state };
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 정리 실패는 무시 */ }
  }
}

function withEnv(env, fn) {
  const prev = {};
  for (const k of Object.keys(env)) prev[k] = process.env[k];
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

// 레포 스탬프를 실행 버전으로 맞춘다 — 자동 반영 패스가 도는 않는 "정상 상태".
function markSynced(b) {
  withEnv({ LLM_WIKI_STATE_DIR: b.state }, () => {
    const sp = stampPath(b.tmp);
    fs.mkdirSync(path.dirname(sp), { recursive: true });
    fs.writeFileSync(sp, PKG_VERSION);
  });
}

// maybeAutoUpdate를 격리 상태로 in-process 실행하고 찍은 stdout 줄을 돌려준다.
// deps.selfUpdate·deps.reportSelfUpdate를 주입해 네트워크 없이 배선을 검증한다.
// loadConfig는 cwd의 설정을 먼저 읽으므로 cwd도 임시 레포로 옮긴다.
function runIsolated(b, { env = {}, deps } = {}) {
  const lines = [];
  const cwd = process.cwd();
  process.chdir(b.tmp);
  try {
    withEnv({ LLM_WIKI_ROOT: b.docRoot, LLM_WIKI_STATE_DIR: b.state, ...env }, () => {
      const orig = console.log;
      console.log = (...a) => lines.push(a.join(' '));
      try {
        maybeAutoUpdate(deps);
      } finally {
        console.log = orig;
      }
    });
  } finally {
    process.chdir(cwd);
  }
  return lines;
}

const skewed = () => ({ from: '1.0.0', to: '1.1.0', started: true });

test('배선 — 정상 상태(레포 스탬프 == 실행 버전, 패스 스킵)에서도 갱신 시작 줄이 나온다', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    const lines = runIsolated(b, { deps: { selfUpdate: skewed } });
    assert.equal(lines.length, 1, `패스는 조용히 지나가고 시작 줄만: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /자동 갱신 시작/);
    assert.match(lines[0], /v1\.0\.0.*v1\.1\.0/);
  } finally { cleanup(b.tmp, b.state); }
});

test('배선 — 패스가 도는 첫 명령(스탬프 없음)에서도 갱신 시작 줄은 나온다', () => {
  const b = makeRepo();
  try {
    const lines = runIsolated(b, { deps: { selfUpdate: skewed } });
    assert.ok(lines.some(l => /자동 갱신 시작/.test(l)), `시작 줄이 없다: ${JSON.stringify(lines)}`);
  } finally { cleanup(b.tmp, b.state); }
});

test('배선 — 비대상(link·other)·확인 실패는 아무 말도 하지 않는다', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    assert.deepEqual(runIsolated(b, { deps: { selfUpdate: () => ({ from: '1.0.0', to: '1.1.0', skipped: 'link' }) } }), []);
    assert.deepEqual(runIsolated(b, { deps: { selfUpdate: () => ({ from: '1.0.0', to: '1.1.0', skipped: 'other' }) } }), []);
    assert.deepEqual(runIsolated(b, { deps: { selfUpdate: () => null } }), []);
    assert.deepEqual(runIsolated(b, { deps: { selfUpdate: () => ({ error: 'npm view 실패' }) } }), []);
  } finally { cleanup(b.tmp, b.state); }
});

test('배선 — 설치를 시작하지 못했으면 수동 안내 한 줄', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    const lines = runIsolated(b, { deps: { selfUpdate: () => ({ from: '1.0.0', to: '1.1.0', manual: true, error: 'spawn EACCES' }) } });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /v1\.0\.0.*v1\.1\.0/);
    assert.match(lines[0], /npm update -g @kybird\/llm-wiki/);
    assert.doesNotMatch(lines[0], /자동 갱신 시작/);
  } finally { cleanup(b.tmp, b.state); }
});

test('배선 — 떨어진 갱신의 결과 보고 줄이 먼저 나온다', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    const done = runIsolated(b, { deps: { reportSelfUpdate: () => '  · llm-wiki 자동 갱신 완료 → v1.1.0 (이 명령부터 새 버전)', selfUpdate: () => null } });
    assert.equal(done.length, 1);
    assert.match(done[0], /자동 갱신 완료.*v1\.1\.0/);
    const both = runIsolated(b, { deps: { reportSelfUpdate: () => '  · 결과 줄', selfUpdate: skewed } });
    assert.deepEqual(both.map(l => (l.includes('결과 줄') ? 'result' : 'start')), ['result', 'start'], '결과 줄이 시작 줄보다 앞');
  } finally { cleanup(b.tmp, b.state); }
});

test('옵트아웃 — autoUpdate:false면 갱신 확인·결과 보고조차 부르지 않는다', () => {
  const b = makeRepo();
  try {
    fs.writeFileSync(path.join(b.tmp, 'llm-wiki.config.json'), JSON.stringify({ autoUpdate: false }));
    let called = 0;
    const lines = runIsolated(b, { deps: {
      reportSelfUpdate: () => { called += 1; return 'x'; },
      selfUpdate: () => { called += 1; return skewed(); },
    } });
    assert.equal(called, 0);
    assert.deepEqual(lines, []);
  } finally { cleanup(b.tmp, b.state); }
});

test('옵트아웃 — LLM_WIKI_NO_AUTO_UPDATE=1이면 갱신 확인·결과 보고조차 부르지 않는다', () => {
  const b = makeRepo();
  try {
    let called = 0;
    const lines = runIsolated(b, {
      env: { LLM_WIKI_NO_AUTO_UPDATE: '1' },
      deps: {
        reportSelfUpdate: () => { called += 1; return 'x'; },
        selfUpdate: () => { called += 1; return skewed(); },
      },
    });
    assert.equal(called, 0);
    assert.deepEqual(lines, []);
  } finally { cleanup(b.tmp, b.state); }
});

test('init 흔적 없는 디렉터리는 갱신 확인조차 부르지 않는다', () => {
  const b = makeRepo();
  try {
    fs.rmSync(b.docRoot, { recursive: true, force: true });
    let called = 0;
    runIsolated(b, { deps: { selfUpdate: () => { called += 1; return skewed(); } } });
    assert.equal(called, 0);
  } finally { cleanup(b.tmp, b.state); }
});

test('격리 — LLM_WIKI_STATE_DIR 중엔 진짜 확인이 돌지 않는다(네트워크·스탬프 부재)', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    assert.deepEqual(runIsolated(b), []); // 주입 없음 — 진짜 selfUpdate·reportSelfUpdate 경로
    withEnv({ LLM_WIKI_STATE_DIR: b.state }, () => {
      assert.ok(!fs.existsSync(selfUpdateStampPath()));
      assert.ok(!fs.existsSync(selfUpdateResultPath()));
    });
  } finally { cleanup(b.tmp, b.state); }
});
