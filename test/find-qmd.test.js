// find-qmd 사본 선택 회귀 (2026-11-23) — 늙은 그림자가 새 사본을 가리지 않게.
// 배경: 자기 트리 2.8.3(n-l-c 3.20.0)이 글로벌 2.9.0(n-l-c 3.22.3)을 가려
// 리랭커 CUDA 크래시가 재발했다(llm-wiki search, 2026-11-23 실측).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findQmd, pickQmd, qmdVersionOf } = require('../lib/find-qmd');

// <root>/dist/cli/qmd.js 레이아웃의 가짜 qmd 패키지를 만들고 CLI 경로를 반환.
function fakeQmd(version, { brokenPkg = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-findqmd-'));
  fs.mkdirSync(path.join(root, 'dist', 'cli'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'cli', 'qmd.js'), '');
  const pkgPath = path.join(root, 'package.json');
  if (brokenPkg) fs.writeFileSync(pkgPath, '{not json');
  else fs.writeFileSync(pkgPath, JSON.stringify({ name: '@tobilu/qmd', version }));
  return path.join(root, 'dist', 'cli', 'qmd.js');
}

test('qmdVersionOf — dist/cli/qmd.js에서 3단 위 package.json 버전을 읽는다', () => {
  assert.equal(qmdVersionOf(fakeQmd('9.9.9')), '9.9.9');
  assert.equal(qmdVersionOf(fakeQmd('1.0.0', { brokenPkg: true })), null);
});

test('그림자 차단 — 자기 트리 2.8.3이 글로벌 2.9.0을 못 이긴다 (2026-11-23 결함)', () => {
  const stale = fakeQmd('2.8.3');
  const fresh = fakeQmd('2.9.0');
  assert.equal(pickQmd([stale, fresh]), fresh);
  assert.equal(pickQmd([fresh, stale]), fresh); // 발견 순서 무관
});

test('역방향 — 번들 2.9.1이 글로벌 2.9.0을 이긴다 (고정 순서 금지의 이유)', () => {
  const bundled = fakeQmd('2.9.1');
  const globalOld = fakeQmd('2.9.0');
  assert.equal(pickQmd([bundled, globalOld]), bundled);
});

test('버전 못 읽는 후보는 폴백 — 버전 있는 후보가 있으면 밀리고, 단독이면 선택된다', () => {
  const unverifiable = fakeQmd('0.0.0', { brokenPkg: true });
  const versioned = fakeQmd('2.0.0');
  assert.equal(pickQmd([unverifiable, versioned]), versioned);
  assert.equal(pickQmd([unverifiable]), unverifiable); // 가용성이 확실성을 이긴다
});

test('전원 버전 불명 — 발견 순 첫 후보', () => {
  const a = fakeQmd('0.0.0', { brokenPkg: true });
  const b = fakeQmd('0.0.0', { brokenPkg: true });
  assert.equal(pickQmd([a, b]), a);
});

test('QMD_CLI_PATH 명시 오버라이드는 버전 비교 없이 존중된다', () => {
  const pinned = fakeQmd('0.0.1'); // 어떤 다른 사본보다 낮아도
  process.env.QMD_CLI_PATH = pinned;
  try {
    assert.equal(findQmd(), pinned);
  } finally {
    delete process.env.QMD_CLI_PATH;
  }
});
