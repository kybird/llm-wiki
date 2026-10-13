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

// 신·구 qmd stub — query 지원 여부는 --help 판별(기능 탐지)이므로 help 출력으로
// 세대를 흉내낸다(2026-09-22 카드 AC#1·AC#2).
const newQmdStub = path.join(tmp, 'stub-new-qmd.js');
fs.writeFileSync(newQmdStub, [
  'const args = process.argv.slice(2);',
  'if (args[0] === \'--help\') {',
  '  console.log(\'qmd query <query>  - Hybrid search with auto expansion + reranking\');',
  '  console.log(\'qmd search <query> - Full-text BM25 keywords (no LLM)\');',
  '  process.exit(0);',
  '}',
  'console.log(\'STUB-NEW-QMD\', args.join(\' \'));',
  '',
].join('\n'));
const oldQmdStub = path.join(tmp, 'stub-old-qmd.js');
fs.writeFileSync(oldQmdStub, [
  'const args = process.argv.slice(2);',
  'if (args[0] === \'--help\') {',
  '  console.log(\'qmd search <query> - Full-text BM25 keywords (no LLM)\');',
  '  process.exit(0);',
  '}',
  'console.log(\'STUB-OLD-QMD\', args.join(\' \'));',
  '',
].join('\n'));

// CUDA 크래시 stub — vulkan 강하(QMD_LLAMA_GPU=vulkan)로만 살아나는 자식.
// 2026-10-13 win32 CUDA 리랭커 가짜 OOM(상류 llama.cpp 결함)의 강하 회수 게이트.
const cudaCrashStub = path.join(tmp, 'stub-cuda-crash.js');
fs.writeFileSync(cudaCrashStub, [
  'const args = process.argv.slice(2);',
  'if (args[0] === \'--help\') {',
  '  console.log(\'qmd query <query>  - Hybrid search with auto expansion + reranking\');',
  '  process.exit(0);',
  '}',
  'if (process.env.QMD_LLAMA_GPU !== \'vulkan\') {',
  '  console.error(\'llama.cpp\\ggml\\src\\ggml-cuda\\ggml-cuda.cu:106: CUDA error\');',
  '  process.exit(127);',
  '}',
  'console.log(\'STUB-VULKAN-OK\', args.join(\' \'));',
  '',
].join('\n'));

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

test('query 지원 qmd — 시맨틱층이 qmd query(자동 확장)를 호출한다', () => {
  process.env.QMD_CLI_PATH = newQmdStub;
  const r = quietSearch('어휘 불일치 질의');
  assert.equal(r.semantic.mode, 'query', '봉투에 모드 기록');
  assert.equal(r.semantic.errors.length, 0, JSON.stringify(r.semantic.errors));
  assert.equal(r.semantic.collections.length, 2);
  // stub은 받은 인자를 그대로 되돌린다 — 서브커맨드가 query임을 목격한다.
  assert.ok(r.semantic.collections[0].output.includes('STUB-NEW-QMD query 어휘 불일치 질의'),
    `query 서브커맨드가 아니었다: ${r.semantic.collections[0].output}`);
});

test('구버전 qmd — 기능 탐지로 search(BM25)로 폴백, 에러 아님', () => {
  process.env.QMD_CLI_PATH = oldQmdStub;
  const r = quietSearch('어휘 불일치 질의');
  assert.equal(r.semantic.mode, 'search', '폴백 모드');
  assert.equal(r.semantic.errors.length, 0, '폴백은 고장이 아니다 — errors 비어 있어야');
  assert.equal(r.semantic.collections.length, 2);
  assert.ok(r.semantic.collections[0].output.includes('STUB-OLD-QMD search 어휘 불일치 질의'),
    `search 서브커맨드가 아니었다: ${r.semantic.collections[0].output}`);
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

test('CUDA 크래시 — 같은 수집을 vulkan 강하로 재시도해 회수한다', () => {
  process.env.QMD_CLI_PATH = cudaCrashStub;
  const r = quietSearch('cuda 강하 질의');
  assert.equal(r.semantic.errors.length, 0, `강하 후에도 에러가 남았다: ${JSON.stringify(r.semantic.errors)}`);
  assert.equal(r.semantic.collections.length, 2);
  // stub은 QMD_LLAMA_GPU=vulkan일 때만 결과를 낸다 — 실렸다는 것 자체가 강하 증거.
  assert.ok(r.semantic.collections[0].output.includes('STUB-VULKAN-OK'),
    `vulkan 강하 결과가 아니었다: ${r.semantic.collections[0].output}`);
});

test.after(() => {
  delete process.env.QMD_CLI_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});
