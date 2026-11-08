// wiki-compile QMD 동기화 회귀 — 경로 드리프트 자가치유(B)·0건 색인 경고(C).
// 2026-11-07 사고(카드 "QMD 컬렉션 경로 드리프트 자가치유"): doc→docs 마이그레이션 뒤
// 전역 등록부의 죽은 경로가 이름-only 검사를 통과해 9일간 0건 색인이
// "✓ QMD search index synced." 로 위장됐다. 상태 저장 qmd stub(QMD_CLI_PATH 주입 —
// unpromoted 테스트의 관례 계승)으로 등록부를 흉내내 종단으로 못박는다.
// 전역 등록부(~/.config/qmd)는 건드리지 않는다 — stub 상태는 전부 tmp 안에.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');
const STUB_SRC = path.join(__dirname, 'fixtures', 'qmd-stub.js');
const { parseCollectionsList, samePath } = require('../lib/qmd-collections');

test('parseCollectionsList — 공백 포함 이름(수동 --name 오버라이드)도 블록으로 잡는다', () => {
  const out = [
    'Collections (2):',
    '',
    'my wiki (qmd://my wiki/)',
    '  Pattern:  **/*.md',
    '  Files:    3',
    '  Updated:  just now',
    '',
    'ttswiki (qmd://ttswiki/)',
    '  Pattern:  **/*.md',
    '  Files:    0',
    '  Updated:  9d ago',
    '',
  ].join('\n');
  const blocks = parseCollectionsList(out);
  assert.equal(blocks['my wiki'].Files, '3', '공백 이름 블록 파싱(2026-11-08 리뷰 회귀망)');
  assert.equal(blocks['ttswiki'].Files, '0');
  assert.equal(Object.keys(blocks).length, 2, '헤더 아닌 줄이 블록을 오염시키지 않는다');
  assert.deepEqual(parseCollectionsList('No collections found.\n'), {}, '빈 목록 → {}');
  // samePath — win32 대소문자·구분자 흡수
  assert.ok(samePath('D:\\A\\doc\\wiki'.replace(/\\/g, '/'), 'd:/a/doc/wiki') || samePath('d:/a/doc/wiki', 'd:\\a\\doc\\wiki'.replace(/\\/g, '/')), '정규화 비교');
});

function makeDocs() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qmd-sync-'));
  const docRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docRoot, 'wiki', 'concepts'), { recursive: true });
  fs.mkdirSync(path.join(docRoot, 'raw'), { recursive: true });
  fs.writeFileSync(path.join(docRoot, 'wiki', 'index.md'), '---\ntags: [index]\n');
  // config는 문서 루트가 아니라 그 상위(레포 루트) 관례 — loadConfig가 docRoot/..를 본다
  fs.writeFileSync(path.join(tmp, 'llm-wiki.config.json'),
    JSON.stringify({ collections: { wiki: 'qatest-wiki', raw: 'qatest-raw' } }));
  const stub = path.join(tmp, 'qmd-stub.js');
  fs.copyFileSync(STUB_SRC, stub);
  const statePath = path.join(tmp, 'qmd-state.json');
  const env = {
    ...process.env,
    LLM_WIKI_ROOT: docRoot,
    LLM_WIKI_STATE_DIR: path.join(tmp, 'state'),
    LLM_WIKI_NO_AUTO_UPDATE: '1',
    QMD_CLI_PATH: stub,
  };
  return {
    tmp, docRoot, statePath,
    seed: registry => fs.writeFileSync(statePath, JSON.stringify(registry)),
    state: () => JSON.parse(fs.readFileSync(statePath, 'utf8')),
    writeWikiMd: () => fs.writeFileSync(path.join(docRoot, 'wiki', 'concepts', 'a.md'), '# a\n'),
    writeRawMd: date => fs.writeFileSync(path.join(docRoot, 'raw', `${date}.md`), `# ${date}\n`),
    // cwd를 tmp로 — loadConfig 후보 1순위가 process.cwd()라 스폰 위치의 config가
    // 우선한다(실사용 = 레포 루트에서 실행과 동일한 모양).
    run: args => spawnSync(process.execPath, [CLI, ...args], { cwd: tmp, env, encoding: 'utf8' }),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('B — 등록 경로 드리프트를 compile index 1회로 교정하고 실제 색인이 일어난다', () => {
  const b = makeDocs();
  try {
    b.writeWikiMd();
    b.writeRawMd('2026-01-01');
    // 사고 상태 시드: 이름은 등록, 경로는 죽은 doc/ 시절 경로(TTSTextViewer 1a4432e5 직후)
    b.seed({ collections: {
      'qatest-wiki': { path: path.join(b.tmp, 'doc', 'wiki'), pattern: '**/*.md', files: 0 },
      'qatest-raw': { path: path.join(b.tmp, 'doc', 'raw'), pattern: '**/*.md', files: 0 },
    } });

    const r = b.run(['compile', 'index']);
    assert.ok(r.stdout.includes('재등록:'), `재등록 로그가 출력돼야 한다:\n${r.stdout}`);
    assert.ok(r.stdout.includes('✓ QMD search index synced.'), `치유 뒤 성공 보고:\n${r.stdout}`);

    const st = b.state().collections;
    assert.equal(st['qatest-wiki'].path, path.join(b.docRoot, 'wiki'), '등록부가 docs/wiki를 가리킨다');
    assert.equal(st['qatest-raw'].path, path.join(b.docRoot, 'raw'), '등록부가 docs/raw를 가리킨다');
    assert.ok(st['qatest-wiki'].files > 0, `위키 실제 색인(AC#1): ${st['qatest-wiki'].files}`);
    assert.ok(st['qatest-raw'].files > 0, `raw 실제 색인: ${st['qatest-raw'].files}`);

    // 멱등 — 재차 돌면 재등록 없이 성공(재시도≠실패)
    const r2 = b.run(['compile', 'index']);
    assert.ok(!r2.stdout.includes('재등록:'), `경로가 맞으면 재등록하지 않는다:\n${r2.stdout}`);
    assert.ok(r2.stdout.includes('✓ QMD search index synced.'));
  } finally { b.cleanup(); }
});

test('C — 대상에 .md가 있는데 0건 색인이면 ⚠ 경고, ✓ 금지, qmdSynced:false', () => {
  const b = makeDocs();
  try {
    b.writeWikiMd();
    // 경로는 정확 — update가 0건만 보고하는 상태(zeroIndex)로 출력 정직성만 검증
    b.seed({ zeroIndex: true, collections: {
      'qatest-wiki': { path: path.join(b.docRoot, 'wiki'), pattern: '**/*.md', files: 0 },
      'qatest-raw': { path: path.join(b.docRoot, 'raw'), pattern: '**/*.md', files: 0 },
    } });

    const text = b.run(['compile', 'index']);
    assert.ok(text.stdout.includes('⚠'), `경고 출력(AC#2):\n${text.stdout}`);
    assert.ok(!text.stdout.includes('✓ QMD search index synced.'), `성공 문구 금지(AC#2):\n${text.stdout}`);

    // compile index --json은 봉투 앞에 진행 로그가 섞인다(기존 동작) — 봉투부터 파싱
    const out = b.run(['compile', 'index', '--json']).stdout;
    const json = JSON.parse(out.slice(out.search(/\{\s*"schemaVersion"/)));
    assert.equal(json.qmdSynced, false, 'json 봉투 qmdSynced:false (AC#2)');
  } finally { b.cleanup(); }
});

test('빈 raw(초기 스캐폴드)는 0건 경고로 오인하지 않는다', () => {
  const b = makeDocs();
  try {
    b.writeWikiMd(); // wiki에만 .md — raw는 빔(정상 상태)
    b.seed({ collections: {
      'qatest-wiki': { path: path.join(b.docRoot, 'wiki'), pattern: '**/*.md', files: 1 },
      'qatest-raw': { path: path.join(b.docRoot, 'raw'), pattern: '**/*.md', files: 0 },
    } });

    const r = b.run(['compile', 'index']);
    assert.ok(!r.stdout.includes('⚠'), `빈 raw는 경고 대상 아님:\n${r.stdout}`);
    assert.ok(r.stdout.includes('✓ QMD search index synced.'));
  } finally { b.cleanup(); }
});
