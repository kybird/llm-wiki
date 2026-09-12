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

// ── 가드 2 — 모르는 플래그를 조용히 삼키지 않는다 (사고 2) ────────────────

test('모르는 플래그 — 일곱 명령이 각각 실패하고 카드 파일과 activity 로그가 그대로다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '엄격칸반', '--goal', 'g', '--ac', 'AC1']).status, 0);
    const cardP = path.join(b.cardsDir, '엄격칸반.md');
    const cardBefore = fs.readFileSync(cardP, 'utf8');
    const actBefore = fs.readFileSync(b.activityPath, 'utf8');

    const cases = [
      ['pick', '--claim', 'x', '--clam', 'y'],        // 오타 — 예전엔 무시돼 다른 카드가 집혔다
      ['handoff', '엄격칸반', '--question', 'q', '--note', 'x'],
      ['done', '엄격칸반', '--result', 'r', '--reason', 'x'],
      ['supersede', '엄격칸반', '--by', 'a', '--into', 'x'],
      ['abandon', '엄격칸반', '--reason', 'r', '--quiet'],
      ['reopen', '엄격칸반', '--why', 'w', '--force'],
      ['resume', '엄격칸반', '--note', 'n', '--why', 'x'],
    ];
    for (const argv of cases) {
      const r = b.run(argv);
      assert.notEqual(r.status, 0, `실패해야 한다: ${argv.join(' ')}`);
      assert.ok((r.stderr || '').includes('모르는 플래그'), `모르는 플래그를 보고해야 한다: ${argv[0]}`);
    }
    assert.equal(fs.readFileSync(cardP, 'utf8'), cardBefore, '카드 불변');
    assert.equal(fs.readFileSync(b.activityPath, 'utf8'), actBefore, 'activity 불변');
  } finally { b.cleanup(); }
});

test('값 없는 필수 플래그 — pick --claim·resume --note도 조용히 넘어가지 않는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '값없음', '--goal', 'g']).status, 0);
    // 예전엔 pick --claim이 'unnamed-agent'로 조용히 폴백됐다 — 오타와 구분이 안 된다.
    const r1 = b.run(['pick', '--claim']);
    assert.notEqual(r1.status, 0, '값 없는 --claim은 실패');
    assert.ok((r1.stderr || '').includes('--claim'));
    // resume --note도 마찬가지 — true가 심겨 기본 문구로 폴백되던 길이다.
    const r2 = b.run(['resume', '값없음', '--note']);
    assert.notEqual(r2.status, 0, '값 없는 --note는 실패');
    assert.ok((r2.stderr || '').includes('--note'));
    const cardP = path.join(b.cardsDir, '값없음.md');
    assert.ok(fs.readFileSync(cardP, 'utf8').includes('status: todo'), '아무 카드도 안 집혔다');
  } finally { b.cleanup(); }
});

// ── pick --card — 지정 집기 (게이트 우회 없음) ─────────────────────────────

test('pick --card — 의존 미충족 카드를 집지 않고 이유를 낸다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '선행', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['card', 'new', '후행', '--depends', '선행']).status, 0);
    const p = path.join(b.cardsDir, '후행.md');
    const before = fs.readFileSync(p, 'utf8');
    const r = b.run(['pick', '--card', '후행', '--claim', 't']);
    assert.equal(r.status, 0, '게이트 보고는 오류가 아니다 — 통상 pick과 같은 계약');
    assert.ok(!r.stdout.includes('PICKED'), '집지 않는다');
    assert.ok(r.stdout.includes('의존 미충족'), '무엇이 막았는지 말한다');
    assert.ok(r.stdout.includes('선행'), '어떤 의존이 미충족인지 말한다');
    assert.equal(fs.readFileSync(p, 'utf8'), before, '카드 파일 그대로');
  } finally { b.cleanup(); }
});

test('pick --card — 남이 클레임 중인 카드를 집지 않는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '남의것', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--card', '남의것', '--claim', 'claude-1']).status, 0);
    const p = path.join(b.cardsDir, '남의것.md');
    const before = fs.readFileSync(p, 'utf8');
    const r = b.run(['pick', '--card', '남의것', '--claim', 'glm-1']);
    assert.ok(!r.stdout.includes('PICKED'), '집지 않는다');
    assert.ok(r.stdout.includes('클레임 중'), '클레임이 막았다고 말한다');
    assert.ok(r.stdout.includes('claude-1'), '누구의 클레임인지 말한다');
    assert.equal(fs.readFileSync(p, 'utf8'), before, '클레임 정보 불변');
  } finally { b.cleanup(); }
});

test('pick --card — 없는 제목이면 실패하고 아무 파일도 바뀌지 않는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '있는것', '--ac', 'AC1']).status, 0);
    const p = path.join(b.cardsDir, '있는것.md');
    const before = fs.readFileSync(p, 'utf8');
    const actBefore = fs.readFileSync(b.activityPath, 'utf8');
    const r = b.run(['pick', '--card', '유령카드', '--claim', 't']);
    assert.notEqual(r.status, 0, '지정한 카드가 없으면 실패');
    assert.ok((r.stderr || '').includes('유령카드'), '찾지 못한 제목을 보고한다');
    assert.equal(fs.readFileSync(p, 'utf8'), before, '다른 카드도 집히지 않는다');
    assert.equal(fs.readFileSync(b.activityPath, 'utf8'), actBefore, 'activity 불변');
  } finally { b.cleanup(); }
});

test('pick --card — ordinal 최저가 아닌 카드를 지목해 집는다 (--json 스키마 동일)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '첫째']).status, 0); // ordinal 1000
    assert.equal(b.run(['card', 'new', '둘째']).status, 0); // ordinal 2000
    const r = b.run(['pick', '--card', '둘째', '--claim', 't', '--json']);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.schemaVersion, 1, '스키마 버전 동일');
    assert.equal(out.kind, 'kanban-pick', 'kind 동일');
    assert.equal(out.picked.title, '둘째', '지목한 카드');
    assert.equal(out.reason, null);
    const parse = f => kanban.parseFrontmatter(fs.readFileSync(path.join(b.cardsDir, f), 'utf8'));
    assert.equal(parse('둘째.md').status, 'doing', '둘째는 doing');
    assert.equal(parse('둘째.md').claimed_by, 't');
    assert.equal(parse('첫째.md').status, 'todo', 'ordinal 최저 첫째는 안 집힌다');
    // activity 로그 — 기존 claimed 형태 그대로
    const events = kanban.readActivity({ activityPath: b.activityPath });
    assert.ok(events.some(e => e.action === 'claimed' && e.title === '둘째' && e.actor === 't'),
      'claimed 이벤트가 기존 형태로 남는다');
  } finally { b.cleanup(); }
});

test('pick --card — review·not_before·종결·WIP 상한 게이트도 그대로 막힌다', () => {
  const b = makeBoard();
  try {
    // review — handoff로 park한 카드
    assert.equal(b.run(['card', 'new', '판정대기', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--card', '판정대기', '--claim', 'a']).status, 0);
    assert.equal(b.run(['handoff', '판정대기', '--question', 'q?']).status, 0);
    const r1 = b.run(['pick', '--card', '판정대기', '--claim', 'b']);
    assert.ok(r1.stdout.includes('review'), 'review 게이트 사유');

    // not_before — 미래 날짜
    assert.equal(b.run(['card', 'new', '예약', '--not-before', '2099-01-01']).status, 0);
    const r2 = b.run(['pick', '--card', '예약', '--claim', 'b']);
    assert.ok(r2.stdout.includes('not_before'), 'not_before 게이트 사유');

    // 종결 — done 폴더의 카드
    assert.equal(b.run(['card', 'new', '끝난것', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['card', 'edit', '끝난것', '--check-ac', '1']).status, 0);
    assert.equal(b.run(['done', '끝난것', '--result', '완료']).status, 0);
    const r3 = b.run(['pick', '--card', '끝난것', '--claim', 'b']);
    assert.ok(r3.stdout.includes('종결'), '종결 카드 사유');

    // WIP 상한 — 기본 2. 판정대기(handoff 반납) 이후 doing은 끝난것 pick 없이
    // a가 잡은 '판정대기'는 review로 반납됐으므로 doing 0 → 두 장 집고 세 번째 차단.
    assert.equal(b.run(['card', 'new', 'A', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['card', 'new', 'B', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['card', 'new', 'C', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--card', 'A', '--claim', 'w1']).status, 0);
    assert.equal(b.run(['pick', '--card', 'B', '--claim', 'w2']).status, 0);
    const r4 = b.run(['pick', '--card', 'C', '--claim', 'w3']);
    assert.ok(r4.stdout.includes('wip-limit'), 'WIP 상한 사유');
    assert.ok(!r4.stdout.includes('PICKED'), '집히지 않는다');
  } finally { b.cleanup(); }
});

test('pick --card 없이 — 종전대로 ordinal 최저를 집는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '첫째']).status, 0);
    assert.equal(b.run(['card', 'new', '둘째']).status, 0);
    const r = b.run(['pick', '--claim', 't']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('PICKED'));
    assert.ok(r.stdout.includes('첫째'), 'ordinal 최저');
    const parse = f => kanban.parseFrontmatter(fs.readFileSync(path.join(b.cardsDir, f), 'utf8'));
    assert.equal(parse('첫째.md').status, 'doing');
    assert.equal(parse('둘째.md').status, 'todo');
  } finally { b.cleanup(); }
});
