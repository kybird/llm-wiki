// 무소속 뷰·리포트·lint 회귀 — 2026-10-15 규약(plan.md 3.8):
//   board 무소속 영구 표기(마일스톤 개수 분리), board report 무소속 통계 분리 +
//   인테이크 지표 + 방치 묶음, lint 보드 이슈 지적.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-unview-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  // lint가 wiki 없이 죽지 않게 최소 docs/wiki + raw 를 깐다
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(docRoot, 'raw'), { recursive: true });
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  const cardPath = (dir, title) => path.join(docRoot, 'kanban', dir, `${kanban.slugify(title)}.md`);
  return {
    tmp, docRoot, env, run, cardPath,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('board 뷰 — 무소속은 마일스톤 개수에서 분리된 영구 줄로 나온다', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '인터럽트 1', '--goal', 'g']); // 무소속 자동 생성
    b.run(['card', 'new', '인터럽트 2', '--goal', 'g']);
    b.run(['card', 'new', '진짜 계획', '--kind', 'milestone', '--goal', 'g']);

    const out = b.run(['board']).stdout;
    assert.ok(out.includes('마일스톤 (1)'), '계획 마일스톤만 센다(무소속 제외)');
    assert.ok(out.includes('무소속 (영구) — 대기 2장 · 누적 2장'), '영구 줄: 대기·누적(완료율 아님)');
    assert.ok(!out.includes('무소속 — 0/2'), '완료율 표기 아님');
  } finally { b.cleanup(); }
});

test('board report — 무소속 통계 분리 + 인테이크 지표 + 방치 묶음 지적', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '계획 M', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '대기 인터럽트', '--goal', 'g']); // 무소속

    // 방치 묶음 — 전원 종결인 활성 마일스톤(사후 편입 조립 후 종결 망각)
    b.run(['card', 'new', '묶음', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '지난일', '--goal', 'g', '--ac', 'AC1']);
    b.run(['pick', '--claim', 't', '--card', '지난일']);
    b.run(['done', '지난일', '--result', '끝']);
    b.run(['card', 'edit', '지난일', '--milestone', '묶음', '--retro', '같은 목적']);

    const j = JSON.parse(b.run(['board', 'report', '--json']).stdout);
    assert.ok(!j.milestoneAges.some(m => m.title === '무소속'), '경과 통계에서 무소속 제외');
    assert.equal(j.unassigned.pending, 1, '대기 인터럽트 1장');
    assert.equal(j.unassigned.total, 1, '누적 1장');
    assert.equal(j.staleBundles.length, 1, '방치 묶음 감지');
    assert.equal(j.staleBundles[0].title, '묶음');

    const text = b.run(['board', 'report']).stdout;
    assert.ok(text.includes('무소속(인터럽트 인테이크): 대기 1장 · 누적 1장'), '텍스트 인테이크 줄');
    assert.ok(text.includes('방치 묶음'), '텍스트 방치 묶음 경고');
  } finally { b.cleanup(); }
});

test('lint — 멤버 전원 종결인 활성 마일스톤을 보드 이슈로 지적한다', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '묶음', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '지난일', '--goal', 'g', '--ac', 'AC1']);
    b.run(['pick', '--claim', 't', '--card', '지난일']);
    b.run(['done', '지난일', '--result', '끝']);
    b.run(['card', 'edit', '지난일', '--milestone', '묶음', '--retro', 'r']);

    const j = JSON.parse(b.run(['lint', '--json']).stdout);
    assert.equal(j.boardIssues.length, 1);
    assert.ok(j.boardIssues[0].includes('묶음'), '방치 묶음 지적');

    // 완결하면 이슈가 사라진다
    b.run(['done', '묶음', '--result', '사후 묶음 완결']);
    const j2 = JSON.parse(b.run(['lint', '--json']).stdout);
    assert.equal(j2.boardIssues.length, 0, '완결 후 이슈 소멸');
  } finally { b.cleanup(); }
});

test('monitor — /api/board가 무소속 마일스톤에 conclusion never를 실어 보낸다(영구 렌더 근거)', async () => {
  const b = makeBoard();
  const child = spawn('node', [CLI, 'monitor', '--port', '0'], { env: b.env });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', d => { out += d; });
  try {
    b.run(['card', 'new', '인터럽트', '--goal', 'g']); // 무소속 자동 생성
    const deadline = Date.now() + 10000;
    let url = '';
    while (Date.now() < deadline && !/^http:\/\/127\.0\.0\.1:\d+$/.test(out.split('\n')[0] || '')) {
      await new Promise(r => setTimeout(r, 100));
    }
    url = out.split('\n')[0];
    assert.ok(url, `모니터 URL: ${out}`);
    let board = null;
    for (let i = 0; i < 30 && !board; i++) {
      try { board = await (await fetch(`${url}/api/board`)).json(); } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const ms = board.milestones.find(m => m.title === '무소속');
    assert.ok(ms, '마일스톤 패널에 무소속 표시');
    assert.equal(ms.conclusion, 'never', '영구(conclusion never) 표식 — 뷰가 대기·누적으로 렌더하는 근거');
    assert.equal(ms.counts.active, 1, '대기 인터럽트 1장');
  } finally {
    child.kill();
    b.cleanup();
  }
});
