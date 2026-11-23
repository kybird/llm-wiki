// 자기 스큐 힌트 회귀 (2026-11-23) — 자동 반영이 사본·qmd만 끌어올리고 llm-wiki 명령
// 자신은 못 바꾸는 틈: 실행 버전 < npm 최신이면 기계당 하루 1회 한 줄로 알린다.
// 배경: 출시보다 뒤처진 CLI는 실패하지 않고 자기 이전 계약을 조용히 건너뛴다
// (2026-11-07 전역 0.6.0 스큐, 2026-11-23 lint 거짓 무사). 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  maybeAutoUpdate, stampPath, selfSkewCore, selfSkewStampPath, SELF_SKEW_INTERVAL_MS,
} = require('../lib/auto-update');
const { version: PKG_VERSION } = require('../package.json');

// ── 순수 로직(selfSkewCore) — 스탬프는 메모리, 시계는 직접 돌린다 ──────────────

function harness(opts = {}) {
  let stamp = opts.stamp === undefined ? null : opts.stamp;
  let now = opts.now === undefined ? 1_700_000_000_000 : opts.now;
  const calls = { latest: 0, writes: [] };
  const o = {
    pkgVersion: '1.0.0',
    intervalMs: SELF_SKEW_INTERVAL_MS,
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
  };
  return { o, calls, advance: (ms) => { now += ms; }, setStamp: (v) => { stamp = v; } };
}

test('스큐 — 실행 1.0.0 < npm 최신 1.1.0 → {from, to} + 이번 주기 스탬프', () => {
  const h = harness();
  assert.deepEqual(selfSkewCore(h.o), { from: '1.0.0', to: '1.1.0' });
  assert.deepEqual(h.calls.writes, [String(h.o.nowFn())]);
});

test('최신이면 침묵(null) — 스탬프는 찍는다(이번 주기 처리 완료)', () => {
  const h = harness({ latest: '1.0.0' });
  assert.equal(selfSkewCore(h.o), null);
  assert.equal(h.calls.writes.length, 1);
});

test('스탬프 없음·빈 스탬프·쓰레기 스탬프 전부 이번에 본다', () => {
  for (const stamp of [null, '', 'not-a-number']) {
    const h = harness({ stamp });
    selfSkewCore(h.o);
    assert.equal(h.calls.latest, 1, `stamp=${JSON.stringify(stamp)}`);
  }
});

test('주기 안에는 npm view를 부르지 않는다 — 경로에서 다시 보고 스큐면 다시 말한다', () => {
  const h = harness();
  selfSkewCore(h.o);
  h.advance(SELF_SKEW_INTERVAL_MS - 1);
  assert.equal(selfSkewCore(h.o), null);
  assert.equal(h.calls.latest, 1, '하루 안의 재실행은 네트워크를 부르면 안 된다');
  h.advance(1);
  assert.deepEqual(selfSkewCore(h.o), { from: '1.0.0', to: '1.1.0' }, '하루가 지나면 다시 말한다(상시 알림)');
  assert.equal(h.calls.latest, 2);
});

test('npm view 실패 — {error} + 스탬프는 찍는다(오프라인 머신의 매 명령 재시도 방지)', () => {
  const h = harness({ latestThrows: true });
  const r = selfSkewCore(h.o);
  assert.match(r.error, /npm view 실패/);
  assert.equal(r.to, undefined);
  assert.equal(h.calls.writes.length, 1, '실패에도 스탬프를 찍어야 한다 — qmd와 반대인 이유');
  selfSkewCore(h.o);
  assert.equal(h.calls.latest, 1, '주기 안의 재실행은 npm view를 부르지 않는다');
});

test('레지스트리 응답 해석 불가 — {error}, 스탬프는 찍는다', () => {
  const h = harness({ latest: 'npm ERR! code E404' });
  const r = selfSkewCore(h.o);
  assert.match(r.error, /해석 불가/);
  assert.equal(h.calls.writes.length, 1);
});

test('스탬프를 못 쓰면 네트워크를 부르지 않는다 — 예외가 그대로 올라간다', () => {
  const h = harness({ writeThrows: true });
  assert.throws(() => selfSkewCore(h.o), /EACCES/);
  assert.equal(h.calls.latest, 0, '스탬프 없는 네트워크 호출은 매 명령 호출로 이어진다');
});

test('시계가 거꾸로 간 스탬프(미래 시각)는 못 믿는다 — 다시 본다', () => {
  const now = 1_700_000_000_000;
  const h = harness({ stamp: String(now + SELF_SKEW_INTERVAL_MS), now });
  selfSkewCore(h.o);
  assert.equal(h.calls.latest, 1);
});

// ── 배선(maybeAutoUpdate) — 임시 레포 + 격리 state, in-process ─────────────────

function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-skew-'));
  const docRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  require('../lib/kanban').scaffold(docRoot);
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-skew-state-'));
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
// deps.checkSelfSkew을 주입해 네트워크 없이 배선을 검증한다. loadConfig는 cwd의
// 설정을 먼저 읽으므로 cwd도 임시 레포로 옮긴다(spawn 테스트와 같은 조건).
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

const skewed = () => ({ from: '1.0.0', to: '1.1.0' });
const isNotice = (l) => l.includes('스큐');

test('배선 — 정상 상태(레포 스탬프 == 실행 버전, 패스 스킵)에서도 힌트는 나온다', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    const lines = runIsolated(b, { deps: { checkSelfSkew: skewed } });
    assert.equal(lines.length, 1, `패스는 조용히 지나가고 힌트 한 줄만: ${JSON.stringify(lines)}`);
    assert.ok(isNotice(lines[0]));
    assert.match(lines[0], /v1\.0\.0/);
    assert.match(lines[0], /v1\.1\.0/);
    assert.match(lines[0], /npm update -g @kybird\/llm-wiki/);
    assert.match(lines[0], /사용자 터미널/);
  } finally { cleanup(b.tmp, b.state); }
});

test('배선 — 패스가 도는 첫 명령(스탬프 없음)에서도 힌트는 나온다', () => {
  const b = makeRepo();
  try {
    const lines = runIsolated(b, { deps: { checkSelfSkew: skewed } });
    assert.ok(lines.some(isNotice), `힌트가 없다: ${JSON.stringify(lines)}`);
    assert.ok(lines.some(l => l.includes('자동 반영')), `패스 보고줄이 없다: ${JSON.stringify(lines)}`);
  } finally { cleanup(b.tmp, b.state); }
});

test('배선 — 스큐 없음·확인 실패는 아무 말도 하지 않는다', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    assert.deepEqual(runIsolated(b, { deps: { checkSelfSkew: () => null } }), []);
    assert.deepEqual(runIsolated(b, { deps: { checkSelfSkew: () => ({ error: 'npm view 실패' }) } }), []);
  } finally { cleanup(b.tmp, b.state); }
});

test('옵트아웃 — autoUpdate:false면 확인조차 부르지 않는다', () => {
  const b = makeRepo();
  try {
    fs.writeFileSync(path.join(b.tmp, 'llm-wiki.config.json'), JSON.stringify({ autoUpdate: false }));
    let called = 0;
    const lines = runIsolated(b, { deps: { checkSelfSkew: () => { called += 1; return skewed(); } } });
    assert.equal(called, 0);
    assert.deepEqual(lines, []);
  } finally { cleanup(b.tmp, b.state); }
});

test('옵트아웃 — LLM_WIKI_NO_AUTO_UPDATE=1이면 확인조차 부르지 않는다', () => {
  const b = makeRepo();
  try {
    let called = 0;
    const lines = runIsolated(b, {
      env: { LLM_WIKI_NO_AUTO_UPDATE: '1' },
      deps: { checkSelfSkew: () => { called += 1; return skewed(); } },
    });
    assert.equal(called, 0);
    assert.deepEqual(lines, []);
  } finally { cleanup(b.tmp, b.state); }
});

test('init 흔적 없는 디렉터리는 확인조차 부르지 않는다', () => {
  const b = makeRepo();
  try {
    fs.rmSync(b.docRoot, { recursive: true, force: true });
    let called = 0;
    runIsolated(b, { deps: { checkSelfSkew: () => { called += 1; return skewed(); } } });
    assert.equal(called, 0);
  } finally { cleanup(b.tmp, b.state); }
});

test('격리 — LLM_WIKI_STATE_DIR 중엔 진짜 확인이 돌지 않는다(네트워크·스탬프 부재)', () => {
  const b = makeRepo();
  try {
    markSynced(b);
    const lines = runIsolated(b); // 주입 없음 — 진짜 checkSelfSkew 경로
    assert.deepEqual(lines, []);
    withEnv({ LLM_WIKI_STATE_DIR: b.state }, () => {
      assert.ok(!fs.existsSync(selfSkewStampPath()));
    });
  } finally { cleanup(b.tmp, b.state); }
});
