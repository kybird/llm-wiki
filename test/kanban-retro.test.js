// 사후 편입 회귀 — 2026-10-15 규약(plan.md 3.8 개정):
//   종결 카드 --retro 편입(활성 마일스톤만, 감사 3종), 거부 경로(무사유·종결
//   대상·활성 카드 retro·플래그 배타), 활성 해제 무소속 환원, 봉인 무소속 비적용,
//   종결 카드 해제(--retro 필수, 종결 마일스톤 불변).
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-retro-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  const cardPath = (dir, title) => path.join(docRoot, 'kanban', dir, `${kanban.slugify(title)}.md`);
  return {
    tmp, docRoot, env, run, cardPath,
    read: (dir, title) => fs.readFileSync(cardPath(dir, title), 'utf8'),
    activity: () => fs.readFileSync(path.join(docRoot, 'kanban', 'activity.jsonl'), 'utf8'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

function doneCard(b, title) {
  b.run(['pick', '--claim', 't', '--card', title]);
  b.run(['done', title, '--result', '끝']);
}

test('사후 편입 — 종결 카드를 활성 마일스톤에 retro 사유로 편입, 감사 3종', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '묶음 계획', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '지난 인터럽트', '--goal', 'g', '--ac', 'AC1']);
    doneCard(b, '지난 인터럽트');

    const r = b.run(['card', 'edit', '지난 인터럽트', '--milestone', '묶음 계획', '--retro', '같은 목적 발견']);
    assert.equal(r.status, 0, r.stderr);
    const card = b.read('done', '지난 인터럽트');
    assert.ok(card.includes('milestone: 묶음 계획'), '소속 변경');
    assert.ok(card.includes('사후 편입: 마일스톤 \'묶음 계획\''), '카드 Notes 감사');
    assert.ok(b.read('cards', '묶음 계획').includes('사후 편입: \'지난 인터럽트\''), '마일스톤 Result 감사');
    assert.ok(b.activity().includes('retro-attach'), 'activity 감사');
    assert.ok(b.read('cards', '묶음 계획').includes('status: todo'), '편입은 종결을 트리거하지 않는다');
  } finally { b.cleanup(); }
});

test('사후 편입 거부 — 무사유·종결 마일스톤 대상·활성 카드 retro·플래그 배타', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '묶음', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '끝난일', '--goal', 'g', '--ac', 'AC1']);
    doneCard(b, '끝난일');
    b.run(['card', 'new', '살아있는일', '--goal', 'g']);

    const noReason = b.run(['card', 'edit', '끝난일', '--milestone', '묶음']);
    assert.equal(noReason.status, 1);
    assert.ok(noReason.stderr.includes('--retro'), '사유 없는 종결 편입 거부');

    // 종결 마일스톤 — 멤버 전원 종결로 자동 종결된 계획
    b.run(['card', 'new', '닫힌계획', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '닫힌멤버', '--milestone', '닫힌계획', '--goal', 'g', '--ac', 'AC1']);
    doneCard(b, '닫힌멤버');
    assert.ok(!fs.existsSync(b.cardPath('cards', '닫힌계획')), '닫힌계획은 자동 종결됨');

    const closedTarget = b.run(['card', 'edit', '끝난일', '--milestone', '닫힌계획', '--retro', 'r']);
    assert.equal(closedTarget.status, 1);
    assert.ok(closedTarget.stderr.includes('종결된 마일스톤'), '종결 대상 거부(불변)');

    const activeRetro = b.run(['card', 'edit', '살아있는일', '--milestone', '묶음', '--retro', 'r']);
    assert.equal(activeRetro.status, 1);
    assert.ok(activeRetro.stderr.includes('종결 카드 전용'), '활성 카드 retro 거부');

    const both = b.run(['card', 'edit', '살아있는일', '--milestone', '묶음', '--scope-amend', 'a', '--retro', 'r']);
    assert.equal(both.status, 1);
    assert.ok(both.stderr.includes('같이 쓰지 않는다'), 'scope-amend·retro 배타');

    const alone = b.run(['card', 'edit', '끝난일', '--retro', 'r']);
    assert.equal(alone.status, 1);
    assert.ok(alone.stderr.includes('함께 쓴다'), 'retro 단독 거부');
  } finally { b.cleanup(); }
});

test('활성 해제 — 필드 삭제 대신 무소속 환원', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '묶음', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '이사 갈 카드', '--milestone', '묶음', '--goal', 'g']);
    const r = b.run(['card', 'edit', '이사 갈 카드', '--remove-milestone']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(b.read('cards', '이사 갈 카드').includes('milestone: 무소속'), '무소속 환원');

    const again = b.run(['card', 'edit', '이사 갈 카드', '--remove-milestone']);
    assert.equal(again.status, 1);
    assert.ok(again.stderr.includes('이미 무소속'), '무소속 해제는 no-op 거부');
  } finally { b.cleanup(); }
});

test('봉인 무소속 비적용 — 멤버 있는 무소속에 활성 카드 부착이 자유롭다', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '첫 인터럽트', '--goal', 'g']); // 무소속 자동 생성(멤버 1)
    b.run(['card', 'new', '묶음', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '주차 이동', '--milestone', '묶음', '--goal', 'g']);

    const r = b.run(['card', 'edit', '주차 이동', '--milestone', '무소속']);
    assert.equal(r.status, 0, r.stderr, '무소속엔 봉인이 없다(scope-amend 불필요)');
    assert.ok(b.read('cards', '주차 이동').includes('milestone: 무소속'));
    assert.ok(!b.read('cards', '주차 이동').includes('범위 변경'), '범위 변경으로 기록되지 않는다');

    const amend = b.run(['card', 'edit', '주차 이동', '--milestone', '무소속', '--scope-amend', 'x']);
    // 이미 무소속이라 meta.milestone === milestoneTitle — 봉인 블록 자체를 안 지난다.
    // 멤버 있는 다른 계획에 scope-amend 없이 붙이는 건 여전히 봉인된다(기존 규약).
    b.run(['card', 'edit', '주차 이동', '--milestone', '묶음']);
    const sealed = b.run(['card', 'edit', '첫 인터럽트', '--milestone', '묶음']);
    assert.equal(sealed.status, 1);
    assert.ok(sealed.stderr.includes('범위 변경'), '일반 계획 봉인은 그대로');
  } finally { b.cleanup(); }
});

test('종결 카드 해제 — retro 사유로 무소속 환원, 종결 마일스톤 소속은 불변', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '묶음', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '오판분류', '--goal', 'g', '--ac', 'AC1']);
    doneCard(b, '오판분류');
    b.run(['card', 'edit', '오판분류', '--milestone', '묶음', '--retro', '사후 편입']);

    const noReason = b.run(['card', 'edit', '오판분류', '--remove-milestone']);
    assert.equal(noReason.status, 1);
    assert.ok(noReason.stderr.includes('--retro'), '종결 해제엔 사유');

    const r = b.run(['card', 'edit', '오판분류', '--remove-milestone', '--retro', '오분류 정정']);
    assert.equal(r.status, 0, r.stderr);
    const card = b.read('done', '오판분류');
    assert.ok(card.includes('milestone: 무소속'), '무소속 환원(필드 삭제 아님)');
    assert.ok(card.includes('사후 편입 해제'), 'Notes 감사');
    assert.ok(b.activity().includes('retro-detach'), 'activity 감사');

    // 종결 마일스톤 소속 해제 불가 — 닫힌계획 멤버로 만들고 시도
    b.run(['card', 'new', '닫힌계획', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '닫힌멤버', '--milestone', '닫힌계획', '--goal', 'g', '--ac', 'AC1']);
    doneCard(b, '닫힌멤버');
    const frozen = b.run(['card', 'edit', '닫힌멤버', '--remove-milestone', '--retro', 'r']);
    assert.equal(frozen.status, 1);
    assert.ok(frozen.stderr.includes('불변'), '종결 마일스톤 멤버는 불변');
  } finally { b.cleanup(); }
});
