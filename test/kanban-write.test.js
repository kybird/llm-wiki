// 쓰기 경로 CLI 종단간 테스트 — 임시 보드(LLM_WIKI_ROOT)에서 실제 CLI를 돌린다.
// 2026-09-09 리뷰의 재현된 데이터 손실 4건 + 락 경쟁을 회귀로 못박는다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

// 테스트마다 임시 보드를 스캐폴드한다 — 실레포를 건드리지 않는다.
function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
  const docRoot = path.join(tmp, 'doc');
  require('../lib/kanban').scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot };
  const run = (args, opts = {}) => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8', ...opts });
  return {
    tmp, docRoot, env, run,
    cardsDir: path.join(docRoot, 'kanban', 'cards'),
    doneDir: path.join(docRoot, 'kanban', 'done'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('섹션 하이재크 — Notes에 ## Goal을 넣어도 본문이 살아있고 Goal이 보존된다 (5-1-2)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '하이재크', '--goal', '진짜 골']).status, 0);
    // Notes에 관리 섹션 헤더와 같은 모양의 줄을 심는다 (개행 포함 단일 인자).
    const r = b.run(['card', 'edit', '하이재크', '--note', '첫 줄\n## Goal\n가로채려는 내용\n끝']);
    assert.equal(r.status, 0);
    const content = fs.readFileSync(path.join(b.cardsDir, '하이재크.md'), 'utf8');
    assert.ok(content.includes(' ## Goal'), '이스케이프된 헤더 줄이 있어야 한다');
    const back = require('../lib/kanban').parseBody(content);
    assert.ok(back.sections.get('Notes').includes('가로채려는 내용'), 'Notes 내용 소실');
    assert.equal(back.goal, '진짜 골', 'Goal이 하이재크당했다');
  } finally { b.cleanup(); }
});

test('중복 제목 — 종결 카드와 같은 제목 재생성이 거부된다 (5-1-3)', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '동명', '--ac', 'AC1']);
    b.run(['card', 'edit', '동명', '--check-ac', '1']);
    assert.equal(b.run(['done', '동명', '--result', '첫 완료']).status, 0);
    const again = b.run(['card', 'new', '동명']);
    assert.notEqual(again.status, 0, '재생성이 거부돼야 한다');
    // 아카이브 원본의 Result가 그대로다.
    const archived = fs.readFileSync(path.join(b.doneDir, '동명.md'), 'utf8');
    assert.ok(archived.includes('첫 완료'));
  } finally { b.cleanup(); }
});

test('pick 비카드 — cards/의 비카드 .md를 집지 않고 내용을 훼손하지 않는다 (5-1-4)', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '진짜 카드', '--goal', 'g']);
    const notACard = 'README 같은 것 — frontmatter status 없음';
    fs.writeFileSync(path.join(b.cardsDir, 'not-a-card.md'), notACard);
    const r = b.run(['pick', '--claim', 'tester']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('진짜 카드'), '진짜 카드를 집어야 한다');
    assert.equal(fs.readFileSync(path.join(b.cardsDir, 'not-a-card.md'), 'utf8'), notACard, '비카드 파일이 훼손됐다');
  } finally { b.cleanup(); }
});

test('동시 done 경쟁 — 정확히 하나만 성공하고 이중 상태가 없다 (5-2 락 전면화)', async () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '경주', '--ac', 'AC1']);
    const procs = [0, 1].map(() => spawn('node', [CLI, 'done', '경주', '--result', '경주'], { env: b.env }));
    const codes = await Promise.all(procs.map(p => new Promise(res => p.on('exit', res))));
    assert.equal(codes.filter(c => c === 0).length, 1, `성공은 정확히 하나: ${codes}`);
    assert.equal(fs.readdirSync(b.doneDir).filter(f => f.endsWith('.md')).length, 1, 'done/에 1파일');
    assert.equal(fs.readdirSync(b.cardsDir).filter(f => f.endsWith('.md')).length, 0, 'cards/에 잔여 없음(이중 상태 없음)');
  } finally { b.cleanup(); }
});

test('renew-claim — 만료된 클레임 갱신이 거부된다 (5-2)', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '리뉴', '--goal', 'g']);
    b.run(['pick', '--claim', 'tester']);
    const cardPath = path.join(b.cardsDir, '리뉴.md');
    const expired = new Date(Date.now() - 2 * 3600e3).toISOString();
    fs.writeFileSync(cardPath, fs.readFileSync(cardPath, 'utf8').replace(/claimed_at: .*/, `claimed_at: ${expired}`));
    const r = b.run(['card', 'edit', '리뉴', '--renew-claim']);
    assert.notEqual(r.status, 0, '만료 클레임 갱신 거부');
    assert.ok((r.stderr || '').includes('만료'));
  } finally { b.cleanup(); }
});

test('락 점유 중 변이는 거부된다 — 콜백 안 fail도 락을 반납한다', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '점유', '--goal', 'g']);
    const lockDir = path.join(b.docRoot, 'kanban', '.lock', 'write');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'lock.json'), JSON.stringify({ pid: -1, at: Date.now() }));
    assert.notEqual(b.run(['done', '점유', '--result', 'x']).status, 0, '점유 중 거부');
    fs.rmSync(lockDir, { recursive: true, force: true });
    assert.equal(b.run(['done', '점유', '--result', 'x']).status, 0, '해제 후 성공');
    // 거부 경로(fail → process.exit)를 지난 뒤에도 락이 남아있지 않은지 —
    // 만료 renew 거부는 fail 안에서 exit하므로 다음 명령이 막히면 누출이다.
    b.run(['card', 'new', '리뉴2', '--goal', 'g']);
    b.run(['pick', '--claim', 't2']);
    const p = path.join(b.cardsDir, '리뉴2.md');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/claimed_at: .*/, `claimed_at: ${new Date(Date.now() - 2 * 3600e3).toISOString()}`));
    assert.notEqual(b.run(['card', 'edit', '리뉴2', '--renew-claim']).status, 0);
    assert.equal(b.run(['card', 'new', '누출확인', '--goal', 'g']).status, 0, 'fail 후 락 누출 없음');
  } finally { b.cleanup(); }
});
