// lint 날짜 링크 회귀 테스트 — Grounding의 [[YYYY-MM-DD]] 원시 로그 참조는
// wiki-log 규약이 보장하는 정당한 링크 대상이다(2026-10-02 카드). raw 날짜는
// docs/raw/<날짜>.md 존재로 해석한다 — 오탐(존재하는 raw를 깨짐 보고)과
// 놓침(없는 날짜·진짜 깨진 페이지를 유효 보고) 둘 다 못박는다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeDocs() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-date-'));
  const docRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docRoot, 'wiki', 'concepts'), { recursive: true });
  fs.mkdirSync(path.join(docRoot, 'raw'), { recursive: true });
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  const writeWiki = (name, body) => fs.writeFileSync(
    path.join(docRoot, 'wiki', 'concepts', `${name}.md`),
    `---\nstatus: active\ncreated: 2026-10-11\n---\n# ${name}\n\n${body}\n`);
  return {
    tmp, docRoot, env, run, writeWiki,
    writeRaw: date => fs.writeFileSync(path.join(docRoot, 'raw', `${date}.md`), `# ${date}\n내용\n`),
    report: () => JSON.parse(run(['lint', '--json']).stdout),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('[[날짜]] 링크 — raw 로그가 있으면 유효, 없으면 깨짐, 진짜 깨진 링크는 여전히 잡힌다', () => {
  const b = makeDocs();
  try {
    b.writeRaw('2026-09-24');
    b.writeWiki('근거-문서', [
      '- 확장(2026-09-24): [[2026-09-24]] Case 1 — 근거 참조는 정당한 링크다.',
      '- 없는 날짜 참조: [[2099-01-01]]',
      '- 없는 페이지 참조: [[실제로-없는-페이지]]',
    ].join('\n'));

    const report = b.report();
    const broken = report.brokenLinks;

    // 존재하는 raw 날짜 참조는 깨짐에서 사라진다(오탐 수습).
    assert.ok(!broken.some(l => l.includes('[[2026-09-24]]')), `존재하는 raw 날짜는 유효해야 한다: ${JSON.stringify(broken)}`);

    // raw 파일이 없는 날짜는 여전히 깨짐 — 오타(2026-09-25 vs 09-24)를 못 잡으면 이 검사가 무력해진다.
    assert.ok(broken.some(l => l.includes('[[2099-01-01]]')), '없는 날짜는 깨짐 유지');

    // 일반 페이지 오탐 완화가 날짜 규칙에 묻히지 않는지 — 없는 페이지는 그대로 잡힌다.
    assert.ok(broken.some(l => l.includes('[[실제로-없는-페이지]]')), '없는 페이지는 깨짐 유지');
    assert.equal(broken.length, 2, `정확히 2건만 깨짐이어야 한다: ${JSON.stringify(broken)}`);
  } finally { b.cleanup(); }
});

test('날짜가 아닌 정상 링크 회귀 — 같은 규칙으로 유효 처리된다', () => {
  const b = makeDocs();
  try {
    b.writeWiki('대상-페이지', '내용');
    b.writeWiki('링크-문서', '[[대상-페이지]] 를 참조한다.');
    const report = b.report();
    assert.equal(report.brokenLinks.length, 0, JSON.stringify(report.brokenLinks));
  } finally { b.cleanup(); }
});
