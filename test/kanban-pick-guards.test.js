// pick 가드·지정 집기(--card) 종단간 테스트 — 임시 보드(LLM_WIKI_ROOT)에서 실제
// CLI를 돌린다. 2026-09-11·12 사고를 회귀로 못박는다:
//   사고 1 — 탐색용 `pick --help` 호출이 실제로 카드를 집어 엉뚱한 클레임 발생
//   사고 2 — 없는 pick --card 플래그가 조용히 무시돼 다른 카드가 집힘
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

// kanban-write.test.js와 같은 방식 — 테스트마다 임시 보드를 스캐폴드한다.
// 실레포(sugarScan 등)를 건드리지 않는다.
function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-guard-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state') };
  const run = (args, opts = {}) => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8', ...opts });
  return {
    tmp, docRoot, env, run,
    cardsDir: path.join(docRoot, 'kanban', 'cards'),
    activityPath: path.join(docRoot, 'kanban', 'activity.jsonl'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

// ── 가드 1 — 탐색용 --help 호출이 보드를 바꾸지 않는다 (사고 1) ────────────

test('pick --help/-h — 사용법만 출력하고 카드 파일과 activity 로그를 한 글자도 바꾸지 않는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '가드대상', '--goal', 'g']).status, 0);
    const cardP = path.join(b.cardsDir, '가드대상.md');
    const cardBefore = fs.readFileSync(cardP, 'utf8');
    const actBefore = fs.readFileSync(b.activityPath, 'utf8');

    for (const argv of [['pick', '--help'], ['pick', '-h'], ['pick', '--claim', 'x', '--help']]) {
      const r = b.run(argv);
      assert.equal(r.status, 0, `종료 코드 0: ${argv.join(' ')}`);
      assert.ok(r.stdout.includes('pick'), `사용법을 출력한다: ${argv.join(' ')}`);
      assert.equal(fs.readFileSync(cardP, 'utf8'), cardBefore, `카드 불변: ${argv.join(' ')}`);
      assert.equal(fs.readFileSync(b.activityPath, 'utf8'), actBefore, `activity 불변: ${argv.join(' ')}`);
    }
    assert.ok(cardBefore.includes('status: todo'), '사전 조건 — 아직 todo다');
  } finally { b.cleanup(); }
});

test('handoff/done/supersede/abandon/reopen/resume/card --help — 명령이 실행되지 않는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '수호', '--goal', 'g', '--ac', 'AC1']).status, 0);
    const cardP = path.join(b.cardsDir, '수호.md');
    const cardBefore = fs.readFileSync(cardP, 'utf8');
    const actBefore = fs.readFileSync(b.activityPath, 'utf8');

    const cases = [
      ['handoff', '--help'], ['done', '--help'], ['supersede', '--help'],
      ['abandon', '--help'], ['reopen', '--help'], ['resume', '--help'],
      ['card', '--help'], ['card', 'new', '--help'], ['card', 'edit', '--help'],
    ];
    for (const argv of cases) {
      const r = b.run(argv);
      assert.equal(r.status, 0, `종료 코드 0: ${argv.join(' ')}`);
      assert.ok(r.stdout.includes('사용법'), `사용법 문자열 출력: ${argv.join(' ')}`);
    }
    assert.equal(fs.readFileSync(cardP, 'utf8'), cardBefore, '카드 불변');
    assert.equal(fs.readFileSync(b.activityPath, 'utf8'), actBefore, 'activity 불변');
  } finally { b.cleanup(); }
});

test('wait --help — 대기에 들어가지 않고 사용법을 찍고 종료 코드 0으로 나간다', () => {
  const b = makeBoard();
  try {
    const r = b.run(['wait', '--help']);
    assert.equal(r.status, 0, '--help는 오류가 아니다');
    assert.ok(r.stdout.length > 0, '사용법 출력 있음');
    assert.ok(!r.stderr.includes('waiting:'), '대기 진입 안내가 없다 = 대기하지 않았다');
  } finally { b.cleanup(); }
});
