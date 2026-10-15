// 무소속 마일스톤 회귀 — 2026-10-15 규약(plan.md 3.8 개정):
//   card new 기본 소속(무소속 자동 생성 1회 + 재사용), conclusion 필드 왕복 보존,
//   conclusion: never 마일스톤은 멤버 전원 종결 후에도 활성 유지.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-un-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return {
    tmp, docRoot, env, run,
    cardsDir: path.join(docRoot, 'kanban', 'cards'),
    cardPath: title => path.join(docRoot, 'kanban', 'cards', `${kanban.slugify(title)}.md`),
    activity: () => fs.readFileSync(path.join(docRoot, 'kanban', 'activity.jsonl'), 'utf8'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('card new 기본 소속 — 무소속 자동 생성 1회 + 전 카드 부착(마일스톤 카드 제외)', () => {
  const b = makeBoard();
  try {
    const r1 = b.run(['card', 'new', '인터럽트 A', '--goal', 'g']);
    assert.equal(r1.status, 0, r1.stderr);
    const a = fs.readFileSync(b.cardPath('인터럽트 A'), 'utf8');
    assert.ok(a.includes('milestone: 무소속'), '소속 없는 card new는 무소속 소속');
    assert.ok(r1.stdout.includes('무소속'), '성공 출력에 무소속 보고');

    const ms = fs.readFileSync(b.cardPath('무소속'), 'utf8');
    assert.ok(ms.includes('kind: milestone'), '무소속은 마일스톤 카드');
    assert.ok(ms.includes('conclusion: never'), '종료 규칙 never');
    assert.ok(ms.includes('status: todo'), '활성 상태');

    const r2 = b.run(['card', 'new', '인터럽트 B', '--goal', 'g']);
    assert.equal(r2.status, 0, r2.stderr);
    const bb = fs.readFileSync(b.cardPath('인터럽트 B'), 'utf8');
    assert.ok(bb.includes('milestone: 무소속'), '두 번째 카드도 무소속');
    const msFiles = fs.readdirSync(b.cardsDir).filter(f => f.includes('무소속'));
    assert.equal(msFiles.length, 1, '무소속 카드는 1개만(재사용, 재생성 아님)');

    // 마일스톤 카드 자신은 기본 부착 금지(평면 위반 방지)
    assert.equal(b.run(['card', 'new', '계획 X', '--kind', 'milestone', '--goal', 'g']).status, 0);
    const plan = fs.readFileSync(b.cardPath('계획 X'), 'utf8');
    assert.ok(!plan.includes('milestone:'), '마일스톤 카드에는 소속을 심지 않는다');

    // 명시적 소속은 기본 부착을 이긴다
    assert.equal(b.run(['card', 'new', '계획 멤버', '--milestone', '계획 X', '--goal', 'g']).status, 0);
    const member = fs.readFileSync(b.cardPath('계획 멤버'), 'utf8');
    assert.ok(member.includes('milestone: 계획 X'), '명시 소속 우선');
  } finally { b.cleanup(); }
});

test('conclusion 필드 왕복 보존 — 파싱→직렬화→재파싱이 값을 그대로 돌려준다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '왕복 검증', '--goal', 'g']).status, 0);
    const content = fs.readFileSync(b.cardPath('무소속'), 'utf8');
    const meta1 = kanban.parseFrontmatter(content);
    assert.equal(meta1.conclusion, 'never', '1차 파싱');
    const again = kanban.serializeCard(meta1, kanban.parseBody(content));
    const meta2 = kanban.parseFrontmatter(again);
    assert.equal(meta2.conclusion, 'never', '재직렬화 후에도 보존');
    assert.deepEqual(meta1, meta2, 'frontmatter 전체 왕복 동일');
  } finally { b.cleanup(); }
});

test('conclusion never — 멤버 전원 종결 후에도 무소속은 활성(milestone-done 없음)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '단독 인터럽트', '--goal', 'g', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '단독 인터럽트']).status, 0);
    assert.equal(b.run(['card', 'edit', '단독 인터럽트', '--check-ac', '1']).status, 0);
    assert.equal(b.run(['done', '단독 인터럽트', '--result', '끝']).status, 0);

    assert.ok(fs.existsSync(b.cardPath('무소속')), '무소속은 cards/에 남는다(활성)');
    const ms = fs.readFileSync(b.cardPath('무소속'), 'utf8');
    assert.ok(ms.includes('status: todo'), '종결되지 않았다');
    assert.ok(!b.activity().includes('milestone-done'), 'milestone-done 활동이 없다');
  } finally { b.cleanup(); }
});

test('기본 종료 규칙(members) 마일스톤은 여전히 전원 종결 시 종결된다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '계획 M', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '멤버', '--milestone', '계획 M', '--goal', 'g', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '멤버']).status, 0);
    assert.equal(b.run(['card', 'edit', '멤버', '--check-ac', '1']).status, 0);
    assert.equal(b.run(['done', '멤버', '--result', '끝']).status, 0);
    assert.ok(!fs.existsSync(b.cardPath('계획 M')), '무소속 아닌 마일스톤은 자동 종결(done/ 이동)');
    assert.ok(b.activity().includes('milestone-done'), 'milestone-done 활동');
  } finally { b.cleanup(); }
});
