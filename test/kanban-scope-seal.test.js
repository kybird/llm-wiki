// 범위 봉인(scope seal) 회귀 테스트 — 2026-09-21 규약(sugarScan 사용 설계 확정):
//   마일스톤 멤버는 계획 시점(kanban-plan 분해)의 카드가 전부다. 진행 중 마일스톤에
//   card edit --milestone 으로 카드를 붙이는 길은 --scope-amend "<사유>" 없으면
//   거부되고, 사유는 카드 Notes에 '범위 변경'으로 남는다. 봉인 위반 추가가 조용히
//   통과되면 안 된다(파일 불변·exit 1). board report 의 review 노화·마일스톤 경과일
//   신지표 계산도 여기서 검증한다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');
const DAY_MS = 86400000;

function makeBoard() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-seal-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return {
    tmp, docRoot, env, run,
    cardsDir: path.join(docRoot, 'kanban', 'cards'),
    cardPath: title => path.join(docRoot, 'kanban', 'cards', `${kanban.slugify(title)}.md`),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

test('봉인 가드 — 멤버 있는 마일스톤에 소속 추가는 --scope-amend 없으면 거부(파일 불변)', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '진행계획', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '기존멤버', '--milestone', '진행계획', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '떠돌이', '--goal', 'g']).status, 0);

    const before = fs.readFileSync(b.cardPath('떠돌이'), 'utf8');
    const r = b.run(['card', 'edit', '떠돌이', '--milestone', '진행계획']);
    assert.equal(r.status, 1, '거부');
    assert.ok(r.stderr.includes('범위 변경'), '범위 변경 안내');
    assert.ok(r.stderr.includes('--scope-amend'), '플래그 안내');
    assert.ok(r.stderr.includes('무소속'), '무소속 백로그 우회 안내');
    assert.equal(fs.readFileSync(b.cardPath('떠돌이'), 'utf8'), before, '봉인 위반이 조용히 통과되지 않는다 — 파일 불변');
  } finally { b.cleanup(); }
});

test('봉인 통과 — --scope-amend 사유와 함께면 소속되고 Notes에 범위 변경이 남는다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '진행계획', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '기존멤버', '--milestone', '진행계획', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '떠돌이', '--goal', 'g']).status, 0);

    const r = b.run(['card', 'edit', '떠돌이', '--milestone', '진행계획', '--scope-amend', '긴급: 사용자 요청으로 마감범위가 늘었다']);
    assert.equal(r.status, 0, r.stderr);
    const content = fs.readFileSync(b.cardPath('떠돌이'), 'utf8');
    assert.ok(content.includes('milestone: 진행계획'), '소속 반영');
    const notes = content.split('## Notes')[1].split('##')[0];
    assert.ok(notes.includes('범위 변경'), "Notes에 '범위 변경' 기록");
    assert.ok(notes.includes('긴급: 사용자 요청'), '사유 원문 보존');
    assert.ok(r.stdout.includes('범위 변경'), '성공 출력 보고');
  } finally { b.cleanup(); }
});

test('봉인 예외·어법 — 멤버 0장 마일스톤은 자유 소속, 플래그 남발은 거부', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '빈계획', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '첫멤버', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '혼자', '--goal', 'g']).status, 0);

    // 멤버 0장 — 아직 계획 분해 중이다: 봉인 없이 붙는다(계획 시점 소속).
    assert.equal(b.run(['card', 'edit', '첫멤버', '--milestone', '빈계획']).status, 0);

    // --scope-amend 단독(소속 지정 없음)은 의미가 없다 — 거부.
    const solo = b.run(['card', 'edit', '혼자', '--scope-amend', '사유']);
    assert.equal(solo.status, 1);
    assert.ok(solo.stderr.includes('--milestone'));

    // 멤버 0장 마일스톤에 --scope-amend — 봉인이 안 걸렸는데 사유는 필요 없다.
    assert.equal(b.run(['card', 'new', '새계획', '--kind', 'milestone', '--goal', 'g']).status, 0);
    const unsealed = b.run(['card', 'edit', '혼자', '--milestone', '새계획', '--scope-amend', '불필요']);
    assert.equal(unsealed.status, 1);
    assert.ok(unsealed.stderr.includes('멤버가 없다'));

    // 값 없는 --scope-amend — 기존 문자열 플래그 규칙대로 실패.
    assert.equal(b.run(['card', 'edit', '혼자', '--milestone', '빈계획', '--scope-amend']).status, 1);

    // 같은 소속 재지정(멱등 재시도)은 봉인을 다시 묻지 않는다.
    const again = b.run(['card', 'edit', '첫멤버', '--milestone', '빈계획']);
    assert.equal(again.status, 0);
    assert.ok(again.stdout.includes('변경 없음'));
  } finally { b.cleanup(); }
});

test('봉인 유지 — 전 멤버 종결·마일스톤 review 대기 상태에도 소속 추가는 범위 변경', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '거의끝난계획', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '마지막일', '--milestone', '거의끝난계획', '--goal', 'g', '--ac', 'AC1']).status, 0);
    // 마일스톤을 판정 대기로 park → 마지막 멤버 종결 후에도 활성(review)으로 남는다.
    assert.equal(b.run(['handoff', '거의끝난계획', '--question', '이 계획을 그대로 닫나?']).status, 0);
    assert.equal(b.run(['pick', '--claim', 't', '--card', '마지막일']).status, 0);
    assert.equal(b.run(['done', '마지막일', '--result', 'r']).status, 0);
    assert.ok(fs.existsSync(path.join(b.cardsDir, kanban.slugify('거의끝난계획') + '.md')), '마일스톤 review 유지');

    // 결승선은 이미 확정됐다 — 여기에 카드를 더하는 것도 범위 변경이다.
    assert.equal(b.run(['card', 'new', '늦은일', '--goal', 'g']).status, 0);
    const late = b.run(['card', 'edit', '늦은일', '--milestone', '거의끝난계획']);
    assert.equal(late.status, 1);
    assert.ok(late.stderr.includes('범위 변경'));
  } finally { b.cleanup(); }
});

test('board report — review 노화(가장 오래된 대기·7일 초과)와 마일스톤 경과일을 계산한다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '오래대기', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '새대기', '--goal', 'g']).status, 0);
    assert.equal(b.run(['handoff', '오래대기', '--question', 'q1']).status, 0);
    assert.equal(b.run(['handoff', '새대기', '--question', 'q2']).status, 0);
    assert.equal(b.run(['card', 'new', '늙은계획', '--kind', 'milestone', '--goal', 'g']).status, 0);

    // 시간 의존 상태 시딩 — CLI에는 과거 시각을 쓰는 길이 없으므로 정본 파일의
    // 타임스탬프만 교체한다(핸드오프 줄 8일 전, created 12일 전).
    const backdateHandoff = (title, ts) => {
      const p = b.cardPath(title);
      fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(
        /^- .+ — QUESTION:/m, `- ${ts} — QUESTION:`));
    };
    const iso = d => new Date(d).toISOString();
    const localDate = d => {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    backdateHandoff('오래대기', iso(Date.now() - 8 * DAY_MS));
    backdateHandoff('새대기', iso(Date.now() - 1 * DAY_MS));
    const msPath = b.cardPath('늙은계획');
    fs.writeFileSync(msPath, fs.readFileSync(msPath, 'utf8').replace(
      /^created: \d{4}-\d{2}-\d{2}$/m,
      `created: ${localDate(new Date(Date.now() - 12 * DAY_MS))}`));

    const j = JSON.parse(b.run(['board', 'report', '--json']).stdout);
    assert.equal(j.reviewAging.oldestWaitingDays, 8, '가장 오래된 대기 일수');
    assert.equal(j.reviewAging.over7Days, 1, '7일 초과 건수(8일 1건만)');
    assert.equal(j.reviewAging.unknownAge, 0);
    const old = j.waitingQueue.find(w => w.title === '오래대기');
    const fresh = j.waitingQueue.find(w => w.title === '새대기');
    assert.equal(old.waitingDays, 8, '대기 큐 항목별 노화');
    assert.equal(fresh.waitingDays, 1);
    assert.equal(j.milestoneAges.length, 1);
    assert.equal(j.milestoneAges[0].title, '늙은계획');
    assert.equal(j.milestoneAges[0].elapsedDays, 12, '마일스톤 경과일(생성일 기준)');

    // 텍스트 보고서에도 같은 지표가 뜬다 — 아침의 사람이 보는 한 화면.
    const text = b.run(['board', 'report']).stdout;
    assert.ok(text.includes('REVIEW 노화 — 가장 오래된 대기'), '노화 줄');
  } finally { b.cleanup(); }
});
