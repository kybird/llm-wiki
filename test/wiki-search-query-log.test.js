// search 질의 로깅 회귀 — 2026-10-15 설계 §3: 모든 질의+결과 수가
// docs/raw/search-queries.jsonl에 append되고 10k줄 상한을 지킨다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeDocs() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-qlog-'));
  const docRoot = path.join(tmp, 'doc');
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(docRoot, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(docRoot, 'wiki', '개념.md'), '---\ntitle: 개념\n---\n왕복 보존 이야기\n');
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  const logPath = path.join(docRoot, 'raw', 'search-queries.jsonl');
  return {
    tmp, docRoot, env, run, logPath,
    entries: () => fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('질의 로깅 — 질의와 결과 수가 append된다', () => {
  const b = makeDocs();
  try {
    const r1 = b.run(['search', '왕복']);
    assert.equal(r1.status, 0, r1.stderr);
    const e1 = b.entries();
    assert.equal(e1.length, 1, '첫 질의 1줄');
    assert.equal(e1[0].query, '왕복');
    assert.equal(e1[0].grep, 1, 'grep 매칭 파일 수');
    assert.equal(typeof e1[0].semantic, 'number');
    assert.ok(e1[0].ts, '타임스탬프');

    b.run(['search', '왕복 보존']);
    assert.equal(b.entries().length, 2, '두 번째 질의 append');
  } finally { b.cleanup(); }
});

test('질의 로깅 — 10k줄 상한, 오래된 줄부터 절단', () => {
  const b = makeDocs();
  try {
    fs.writeFileSync(b.logPath, Array.from({ length: 10000 }, (_, i) => JSON.stringify({ ts: `t${i}`, query: `q${i}`, grep: 0, semantic: 0 })).join('\n') + '\n');
    b.run(['search', '왕복']);
    const lines = fs.readFileSync(b.logPath, 'utf8').split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 10000, '상한 유지');
    assert.ok(!lines[0].includes('"q0"'), '가장 오래된 줄 절단');
    assert.ok(lines[lines.length - 1].includes('"query":"왕복"'), '최신 질의 보존');
  } finally { b.cleanup(); }
});
