// unpick(doing→todo 반납) 회귀 테스트 — 2026-09-22:
//   pick의 역수. 사유(--why) 필수, 클레임 해제, Notes에 UNPICKED 기록, activity에
//   unpicked. todo·review·done·종결은 저맞는 명령을 안내해 거부한다(조용한 우회
//   금지 — resume이 review만, reopen이 done만 받는 것과 같은 규칙). 반납 직후
//   WIP 칸이 비어 다음 pick이 바로 가능하다.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-unpick-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return {
    tmp, docRoot, env, run,
    cardPath: title => path.join(docRoot, 'kanban', 'cards', `${kanban.slugify(title)}.md`),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('unpick — doing 카드를 todo로 반납한다(클레임 해제·UNPICKED 기록·활동 로그)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '반납대상', '--goal', 'g', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '반납대상']).status, 0);

    const r = b.run(['unpick', '반납대상', '--why', 'pick --help 사고로 엉뚱한 카드를 집었다']);
    assert.equal(r.status, 0, r.stderr);
    const content = fs.readFileSync(b.cardPath('반납대상'), 'utf8');
    const meta = kanban.parseFrontmatter(content);
    assert.equal(meta.status, 'todo', 'todo 복귀');
    assert.equal(meta.claimed_by, undefined, '클레임 해제');
    assert.equal(meta.claimed_at, undefined, '클레임 시각 해제');
    const notes = content.split('## Notes')[1].split('##')[0];
    assert.ok(notes.includes('UNPICKED: pick --help 사고로 엉뚱한 카드를 집었다'), 'Notes에 사유 기록');
    const activity = fs.readFileSync(path.join(b.docRoot, 'kanban', 'activity.jsonl'), 'utf8');
    assert.ok(activity.includes('"unpicked"'), '활동 로그');
    assert.ok(activity.includes('pick --help 사고'), '활동 로그에 사유 상세');
  } finally { b.cleanup(); }
});

test('unpick — 사유 없으면 거부한다(USAGE·값 없는 플래그)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '일', '--goal', 'g']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '일']).status, 0);

    const noWhy = b.run(['unpick', '일']);
    assert.equal(noWhy.status, 1);
    assert.ok(noWhy.stderr.includes('--why'), '사유 필수 안내');
    const before = fs.readFileSync(b.cardPath('일'), 'utf8');
    assert.ok(before.includes('status: doing'), '거부는 상태를 안 바꾼다');

    const blank = b.run(['unpick', '일', '--why']);
    assert.equal(blank.status, 1);
    assert.ok(blank.stderr.includes('사용법'), '값 없는 --why 거부(done·reopen과 같은 USAGE 경로)');
    assert.ok(fs.readFileSync(b.cardPath('일'), 'utf8').includes('status: doing'), '여전히 상태 불변');
  } finally { b.cleanup(); }
});

test('unpick 상태 가드 — todo·review·done·종결은 저맞는 명령을 안내해 거부', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '대기중', '--goal', 'g']).status, 0);
    const todo = b.run(['unpick', '대기중', '--why', '왜']);
    assert.equal(todo.status, 1);
    assert.ok(todo.stderr.includes('이미 todo'), 'todo 안내');

    assert.equal(b.run(['card', 'new', '판정중', '--goal', 'g']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '판정중']).status, 0);
    assert.equal(b.run(['handoff', '판정중', '--question', 'q']).status, 0);
    const review = b.run(['unpick', '판정중', '--why', '왜']);
    assert.equal(review.status, 1);
    assert.ok(review.stderr.includes('resume'), 'review는 resume 안내');

    assert.equal(b.run(['card', 'new', '끝남', '--goal', 'g', '--ac', 'AC1']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '끝남']).status, 0);
    assert.equal(b.run(['done', '끝남', '--result', 'r']).status, 0);
    const done = b.run(['unpick', '끝남', '--why', '왜']);
    assert.equal(done.status, 1);
    assert.ok(done.stderr.includes('reopen'), 'done은 reopen 안내');
  } finally { b.cleanup(); }
});

test('unpick — 반납 직후 WIP 칸이 비어 다음 pick이 바로 가능하다', () => {
  const b = makeBoard();
  try {
    for (const t of ['A일', 'B일', 'C일']) {
      assert.equal(b.run(['card', 'new', t, '--goal', 'g']).status, 0);
    }
    assert.equal(b.run(['pick', '--claim', 't', '--card', 'A일']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', 'B일']).status, 0);
    const wip = b.run(['pick', '--claim', 't']);
    assert.ok(wip.stdout.includes('wip-limit'), '세 번째 pick은 WIP 상한');

    assert.equal(b.run(['unpick', 'A일', '--why', '의존이 아직 안 풀렸다']).status, 0);
    const again = b.run(['pick', '--claim', 't']);
    assert.ok(again.stdout.includes('PICKED'), '반납 즉시 재집기 가능');
    assert.ok(again.stdout.includes('A일'), '최저 ordinal(A일)을 다시 집는다');
    assert.ok(again.stdout.includes('status: doing'), '다시 doing');
  } finally { b.cleanup(); }
});
