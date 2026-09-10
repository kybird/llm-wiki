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

// ── 2026-09-10 접수 — card edit 무조건 성공 보고(결함 A)·의존성 후기 등록(결함 B)

test('card edit — 모르는 플래그·값 없는 플래그·플래그 없음은 실패하고 파일이 불변이다 (결함 A)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '엄격', '--goal', 'g']).status, 0);
    const p = path.join(b.cardsDir, '엄격.md');
    const before = fs.readFileSync(p, 'utf8');

    const r1 = b.run(['card', 'edit', '엄격', '--nonexistent-flag', '쓰레기']);
    assert.notEqual(r1.status, 0, '모르는 플래그는 실패');
    assert.ok((r1.stderr || '').includes('--nonexistent-flag'), '모르는 플래그 이름을 보고해야 한다');

    const r2 = b.run(['card', 'edit', '엄격', '--note']);
    assert.notEqual(r2.status, 0, '값 없는 --note는 실패');
    assert.ok((r2.stderr || '').includes('--note'), '값 없는 플래그 이름을 보고해야 한다');

    const r3 = b.run(['card', 'edit', '엄격']);
    assert.notEqual(r3.status, 0, '바꿀 것 없는 edit은 실패');

    assert.equal(fs.readFileSync(p, 'utf8'), before, '세 케이스 모두 파일 불변');
  } finally { b.cleanup(); }
});

test('card edit — 성공 출력이 실제로 무엇이 바뀌었는지 말한다 (결함 A)', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '선행']);
    b.run(['card', 'new', '보고', '--goal', 'g', '--ac', 'AC1']);
    const r = b.run(['card', 'edit', '보고', '--note', '노트', '--add-ac', 'AC2', '--add-depends', '선행']);
    assert.equal(r.status, 0);
    assert.ok(
      r.stdout.includes('note +1') && r.stdout.includes('ac +1') && r.stdout.includes('depends +선행'),
      `변경 요약이 실제 변경을 말해야 한다: ${r.stdout}`,
    );

    // 멱등 재시도 — 이미 걸린 의존성을 다시 걸면 성공 문구 없이 '변경 없음' (exit 0 유지)
    const retry = b.run(['card', 'edit', '보고', '--add-depends', '선행']);
    assert.equal(retry.status, 0, '멱등 재시도는 실패가 아니다');
    assert.ok(!retry.stdout.includes('Card edited:'), '아무것도 안 바뀌었으면 성공 문구를 찍지 않는다');
    assert.ok(retry.stdout.includes('변경 없음'));
  } finally { b.cleanup(); }
});

test('card edit — depends_on 추가·제거가 파일에 반영된다 (결함 B)', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '선행']);
    b.run(['card', 'new', '후행']);
    const parse = f => require('../lib/kanban').parseFrontmatter(fs.readFileSync(path.join(b.cardsDir, f), 'utf8'));

    const add = b.run(['card', 'edit', '후행', '--add-depends', '선행']);
    assert.equal(add.status, 0);
    assert.deepEqual(parse('후행.md').depends_on, ['선행'], '추가 반영');
    assert.ok(add.stdout.includes('depends +선행'), `추가가 출력에 보인다: ${add.stdout}`);

    const rm = b.run(['card', 'edit', '후행', '--remove-depends', '선행']);
    assert.equal(rm.status, 0);
    assert.ok(!('depends_on' in parse('후행.md')), '제거 반영');

    // 전체 교체 — --depends로 목록을 바꾼다
    b.run(['card', 'new', '제3의카드']);
    const repl = b.run(['card', 'edit', '후행', '--depends', '선행, 제3의카드']);
    assert.equal(repl.status, 0);
    assert.deepEqual(parse('후행.md').depends_on, ['선행', '제3의카드'], '전체 교체 반영');
  } finally { b.cleanup(); }
});

test('의존성 검증 — 없는 카드·자기 자신·순환은 거부된다 (card new/edit 같은 규칙)', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', 'A']);
    b.run(['card', 'new', 'B', '--depends', 'A']);
    b.run(['card', 'new', 'C']);
    const parse = f => require('../lib/kanban').parseFrontmatter(fs.readFileSync(path.join(b.cardsDir, f), 'utf8'));

    const r1 = b.run(['card', 'edit', 'C', '--add-depends', '유령']);
    assert.notEqual(r1.status, 0, '없는 카드 의존성 거부');
    assert.ok((r1.stderr || '').includes('유령'));

    const r2 = b.run(['card', 'edit', 'C', '--add-depends', 'C']);
    assert.notEqual(r2.status, 0, '자기 자신 의존성 거부');

    assert.equal(b.run(['card', 'edit', 'C', '--add-depends', 'B']).status, 0, 'C→B는 정상 (B→A만 있으므로)');
    const r3 = b.run(['card', 'edit', 'A', '--add-depends', 'C']);
    assert.notEqual(r3.status, 0, 'A→C→B→A 순환 거부');
    assert.ok((r3.stderr || '').includes('순환'));
    assert.ok(!Array.isArray(parse('A.md').depends_on), '거부 후 A는 파일 불변');

    const r4 = b.run(['card', 'new', 'D', '--depends', '유령']);
    assert.notEqual(r4.status, 0, 'card new에서도 같은 규칙');
    assert.ok(!fs.existsSync(path.join(b.cardsDir, 'D.md')), '검증 실패 시 카드가 만들어지지 않는다');

    const r5 = b.run(['card', 'edit', 'C', '--remove-depends', '유령']);
    assert.notEqual(r5.status, 0, '목록에 없는 의존성 제거는 오타다 — 거부');
  } finally { b.cleanup(); }
});

test('종결 카드를 의존성으로 넣는 것은 허용된다 — pick의 resolved 판정과 일치', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '끝난일', '--ac', 'AC1']);
    b.run(['card', 'edit', '끝난일', '--check-ac', '1']);
    b.run(['done', '끝난일', '--result', '완료']);
    b.run(['card', 'new', '이후일']);

    const r = b.run(['card', 'edit', '이후일', '--add-depends', '끝난일']);
    assert.equal(r.status, 0, 'done 의존성은 허용');

    const pick = b.run(['pick', '--claim', 't']);
    assert.equal(pick.status, 0);
    assert.ok(pick.stdout.includes('이후일'), '해소된 의존성은 pick을 막지 않는다');
  } finally { b.cleanup(); }
});

test('레거시 끊어진 의존성은 card edit --remove-depends로 정리된다', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '레거시']);
    const p = path.join(b.cardsDir, '레거시.md');
    // 검증 없던 시절의 카드 — 대상 카드가 사라진 의존성이 남아 pick을 영구히 막는다.
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^status: todo$/m, 'status: todo\ndepends_on: ["사라진 카드"]'));

    const r = b.run(['card', 'edit', '레거시', '--remove-depends', '사라진 카드']);
    assert.equal(r.status, 0, '끊어진 의존성 제거는 허용');
    assert.ok(!('depends_on' in require('../lib/kanban').parseFrontmatter(fs.readFileSync(p, 'utf8'))));
  } finally { b.cleanup(); }
});
