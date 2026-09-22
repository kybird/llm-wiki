// 시맨틱 검색층 회귀 — 214e8c2(2026-09-09)가 execFileSync를 import 없이 도입해
// ReferenceError가 catch에 삼켜지며 시맨틱층이 12일간 "No semantic results."로
// 위장 사망했었다(2026-09-22 수습). stub qmd로 두 경로를 게이트한다:
//   1) 정상 경로 — qmd가 주는 결과가 봉투에 실린다 (import가 지워지면 이 테스트가 실패)
//   2) 고장 경로 — qmd 실패가 errors에 실려 삼켜지지 않는다
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { search } = require('../lib/wiki-search');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-qmd-stub-'));

const okStub = path.join(tmp, 'stub-ok.js');
fs.writeFileSync(okStub, `console.log('STUB-OK', process.argv.slice(2).join(' '));\n`);

const failStub = path.join(tmp, 'stub-fail.js');
fs.writeFileSync(failStub, `console.error('STUB-FAIL boom'); process.exit(1);\n`);

// search()는 사람용/JSON 출력을 console.log로 찍는다 — 테스트 출력 오염 방지.
function quietSearch(query) {
  const orig = console.log;
  console.log = () => {};
  try {
    return search(query, { json: true });
  } finally {
    console.log = orig;
  }
}

test('정상 경로 — stub qmd 결과가 시맨틱 봉투에 실린다 (import 누락 게이트)', () => {
  process.env.QMD_CLI_PATH = okStub;
  const r = quietSearch('시맨틱 회귀 질의');
  assert.equal(r.semantic.available, true);
  assert.equal(r.semantic.errors.length, 0, `에러가 새어 나왔다: ${JSON.stringify(r.semantic.errors)}`);
  // wiki·raw 두 컬렉션 모두 stub이 응답한다 — 한 건이라도 비면 execFileSync가
  // undefined였다는 신호(214e8c2의 재발)다.
  assert.equal(r.semantic.collections.length, 2, JSON.stringify(r.semantic));
  assert.ok(r.semantic.collections[0].output.includes('STUB-OK'));
});

test('고장 경로 — qmd 실패가 조용히 사라지지 않고 errors에 드러난다', () => {
  process.env.QMD_CLI_PATH = failStub;
  const r = quietSearch('시맨틱 회귀 질의');
  assert.equal(r.semantic.available, true);
  assert.equal(r.semantic.collections.length, 0);
  assert.equal(r.semantic.errors.length, 2);
  for (const e of r.semantic.errors) {
    assert.ok(e.collection, '컬렉션 이름이 실려야 한다');
    assert.ok(e.message.includes('Command failed'), `실패 사유가 담겨야 한다: ${e.message}`);
  }
});

test.after(() => {
  delete process.env.QMD_CLI_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});
