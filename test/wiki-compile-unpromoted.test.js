// compile list 미승격 은폐 회귀 테스트 — raw를 승격 없이 compile index만 돌려도
// list가 계속 보고해야 한다(2026-10-02 카드: 밤샘 컴파일 절차에서 발화한 갭).
// 승격 판정은 유도다 — wiki가 [[<날짜>]] 또는 raw/<날짜>.md 형태로 그 raw를
// 언급하면 승격(상태 추가 없음).
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');
// 날짜 비교(new-date vs unpromoted)를 결정적으로 만들기 위해 시계를 고정하지 않고
// '어제' 날짜 raw를 쓴다 — lastCompiled(오늘)보다 과거면 해시 규칙의 세계다.
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeDocs() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-unp-'));
  const docRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docRoot, 'wiki', 'concepts'), { recursive: true });
  fs.mkdirSync(path.join(docRoot, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(docRoot, 'wiki', 'index.md'), '---\ntags: [index]\n');
  fs.writeFileSync(path.join(docRoot, 'llm-wiki.config.json'),
    JSON.stringify({ collections: { wiki: 'test-wiki', raw: 'test-raw' } }));
  // qmd no-op stub — 진짜 qmd가 깔린 머신에서 테스트가 색인·임베딩을 몰고 오지
  // 않게 findQmd를 여기로 고정한다(컬렉션 목록 비어있음 → add/update/embed 전부 0종료).
  const qmdStub = path.join(tmp, 'qmd-stub.js');
  fs.writeFileSync(qmdStub, 'process.exit(0);\n');
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1', QMD_CLI_PATH: qmdStub };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return {
    tmp, docRoot, run,
    writeRaw: (date, body = '내용') => fs.writeFileSync(path.join(docRoot, 'raw', `${date}.md`), `# ${date}\n${body}\n`),
    writeWiki: (name, body) => fs.writeFileSync(path.join(docRoot, 'wiki', 'concepts', `${name}.md`), `---\nstatus: active\ncreated: 2026-10-11\n---\n# ${name}\n\n${body}\n`),
    list: () => JSON.parse(run(['compile', 'list', '--json']).stdout),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('승격 없이 compile index만 돌린 raw — list가 unpromoted로 계속 보고한다', () => {
  const b = makeDocs();
  try {
    const date = yesterday();
    b.writeRaw(date, '## Case 1: 밤샘 기록\n');
    // 승격 없이 index만 돈다 — 현재 결함: 상태가 해시를 기록해 list에서 사라진다.
    assert.equal(b.run(['compile', 'index', '--json']).status, 0, 'index 성공 전제');

    const data = b.list();
    const entry = data.newLogs.find(l => l.name === `${date}.md`);
    assert.ok(entry, `미승격 raw가 list에 있어야 한다: ${JSON.stringify(data.newLogs)}`);
    assert.equal(entry.reason, 'unpromoted', '이유는 unpromoted');

    // 텍스트 렌더에도 보고된다
    const text = b.run(['compile', 'list']).stdout;
    assert.ok(text.includes(`${date}.md`), '텍스트 출력에 raw 이름');
  } finally { b.cleanup(); }
});

test('wiki가 참조하면 승격 — [[날짜]]와 raw 경로 언급 둘 다 unpromoted에서 빠진다', () => {
  const b = makeDocs();
  try {
    const d1 = yesterday();
    const d2 = '2026-01-02';
    b.writeRaw(d1); b.writeRaw(d2);
    b.writeWiki('근거1', `- Evidence: [[${d1}]] Case 1\n`);
    b.writeWiki('근거2', `- Evidence: docs/raw/${d2}.md Case 2\n`);
    assert.equal(b.run(['compile', 'index', '--json']).status, 0);

    const data = b.list();
    assert.ok(!data.newLogs.some(l => l.name === `${d1}.md`), '[[날짜]] 참조 = 승격');
    assert.ok(!data.newLogs.some(l => l.name === `${d2}.md`), 'raw 경로 참조 = 승격');
  } finally { b.cleanup(); }
});

test('기존 변경 감지 회귀 — index 후 raw를 고치면 modified로 보고한다', () => {
  const b = makeDocs();
  try {
    const date = yesterday();
    b.writeRaw(date, '원본');
    assert.equal(b.run(['compile', 'index', '--json']).status, 0);
    b.writeRaw(date, '원본\n\n수정 발생');
    const entry = b.list().newLogs.find(l => l.name === `${date}.md`);
    assert.ok(entry, '수정된 raw는 보고');
    assert.equal(entry.reason, 'modified', '이유는 modified');
  } finally { b.cleanup(); }
});
