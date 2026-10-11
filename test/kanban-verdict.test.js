// verdict 회귀 테스트 — 종결 카드 사후 판정 경로 (2026-10-11 TTSTextViewer 사고):
//   "작업 완결(lifecycle)"과 "노선/제품 판정(outcome)"의 보드상 분리.
//   상태·폴더 불변 부착, 재판정 누적, 활성 카드 거부, 자동완결 문구, report 분리 집계.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-verdict-'));
  const docRoot = path.join(tmp, 'doc');
  kanban.scaffold(docRoot);
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return {
    tmp, docRoot, env, run,
    cardsDir: path.join(docRoot, 'kanban', 'cards'),
    doneDir: path.join(docRoot, 'kanban', 'done'),
    abandonedDir: path.join(docRoot, 'kanban', 'abandoned'),
    cardPath: (dir, title) => path.join(docRoot, 'kanban', dir, `${kanban.slugify(title)}.md`),
    activity: () => fs.readFileSync(path.join(docRoot, 'kanban', 'activity.jsonl'), 'utf8'),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

// 마일스톤 + 멤버 1장을 전원 종결시킨 뒤 판정을 붙이는 공통 시나리오.
function completedMilestone(b, msTitle, memberTitle) {
  b.run(['card', 'new', msTitle, '--kind', 'milestone', '--goal', '대의']);
  b.run(['card', 'new', memberTitle, '--milestone', msTitle, '--goal', 'g', '--ac', 'AC1']);
  b.run(['pick', '--claim', 't', '--card', memberTitle]);
  b.run(['done', memberTitle, '--result', '작업 완료']);
  return b.cardPath('done', msTitle); // 자동 종결로 done/ 에 있다
}

test('verdict — 종결 마일스톤에 판정: 상태·폴더 불변, frontmatter·Result·활동 반영', () => {
  const b = makeBoard();
  try {
    const msPath = completedMilestone(b, 'MOSS 사이클', 'SFT 라운드');
    const before = fs.readFileSync(msPath, 'utf8');

    const r = b.run(['verdict', 'MOSS 사이클', '--outcome', 'rejected', '--why', '억양 상한은 100M 사전학습 병목 — SFT로 불가']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('outcome: rejected'), '보고에 판정');
    assert.ok(r.stdout.includes('상태 불변'), '상태 불변 보고');

    // 상태·폴더 불변 — 파일은 여전히 done/ 안에 status: done
    assert.ok(fs.existsSync(msPath), '같은 폴더에 있다');
    assert.ok(!fs.existsSync(b.cardPath('cards', 'MOSS 사이클')), '활성으로 돌아가지 않는다');
    const meta = kanban.parseFrontmatter(fs.readFileSync(msPath, 'utf8'));
    assert.equal(meta.status, 'done', 'status 불변');
    assert.equal(meta.outcome, 'rejected', 'frontmatter outcome');
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(meta.outcome_at)), 'outcome_at 타임스탬프');

    const after = fs.readFileSync(msPath, 'utf8');
    assert.ok(after.includes('VERDICT: rejected'), 'Result에 판정 라인');
    assert.ok(after.length > before.length, 'append-only — 내용은 늘기만 한다');
    assert.ok(after.includes('억양 상한은 100M 사전학습 병목'), '판정 사유 보존');

    assert.ok(b.activity().includes('"milestone-verdict"'), '활동 로그 milestone-verdict');
    assert.ok(b.activity().includes('rejected — 억양 상한'), '활동 detail');
  } finally { b.cleanup(); }
});

test('일반 카드 verdict + 재판정 — 최신이 frontmatter를 이기고 이력은 라인으로 누적', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '단독 작업', '--goal', 'g', '--ac', 'AC1']);
    b.run(['pick', '--claim', 't', '--card', '단독 작업']);
    b.run(['done', '단독 작업', '--result', '끝']);
    const p = b.cardPath('done', '단독 작업');

    assert.equal(b.run(['verdict', '단독 작업', '--outcome', 'adopted', '--why', '1차 판정']).status, 0);
    const first = b.run(['verdict', '단독 작업', '--outcome', 'rejected', '--why', '2차 판정이 이긴다']);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(first.stdout.includes('이전 판정(adopted)'), '갱신 보고');

    const meta = kanban.parseFrontmatter(fs.readFileSync(p, 'utf8'));
    assert.equal(meta.outcome, 'rejected', '최신 판정 우선');
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.includes('VERDICT:'));
    assert.equal(lines.length, 2, '이력은 라인으로 누적');
    assert.ok(lines[0].includes('adopted') && lines[1].includes('rejected'), '순서 보존');
    assert.equal(kanban.parseFrontmatter(content).status, 'done', '상태 불변 유지');
    assert.ok(b.activity().includes('"verdict"'), '일반 카드 활동은 verdict');
  } finally { b.cleanup(); }
});

test('활성 카드 거부 — 판정은 done --result 에 담으라 안내한다', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '살아있는 카드', '--goal', 'g']);
    const r = b.run(['verdict', '살아있는 카드', '--outcome', 'adopted', '--why', 'w']);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('활성 카드'), '활성 카드 거부');
    assert.ok(r.stderr.includes('done --result'), '올바른 경로 안내');
    const content = fs.readFileSync(b.cardPath('cards', '살아있는 카드'), 'utf8');
    assert.ok(!content.includes('outcome:'), '파일 오염 없음');
  } finally { b.cleanup(); }
});

test('플래그 검증 — 허용 외 outcome·--why 누락·모르는 플래그는 실패', () => {
  const b = makeBoard();
  try {
    const msPath = completedMilestone(b, '검증용 계획', '검증 멤버');
    const bad = b.run(['verdict', '검증용 계획', '--outcome', 'blocked', '--why', 'w']);
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes('adopted|rejected|superseded'), '허용 값 안내');

    const noWhy = b.run(['verdict', '검증용 계획', '--outcome', 'adopted']);
    assert.equal(noWhy.status, 1);
    assert.ok(noWhy.stderr.includes('사용법'), '사용법 안내');

    const unknown = b.run(['verdict', '검증용 계획', '--outcome', 'adopted', '--why', 'w', '--force']);
    assert.equal(unknown.status, 1);
    assert.ok(unknown.stderr.includes('모르는 플래그'), '오타 플래그 차단');

    const meta = kanban.parseFrontmatter(fs.readFileSync(msPath, 'utf8'));
    assert.equal(meta.outcome, undefined, '실패는 파일을 안 바꾼다');
  } finally { b.cleanup(); }
});

test('abandon된 카드에도 판정을 붙일 수 있다 — reopen이 아닌 부착 경로', () => {
  const b = makeBoard();
  try {
    b.run(['card', 'new', '접은 노선', '--goal', 'g', '--ac', 'AC1']);
    b.run(['pick', '--claim', 't', '--card', '접은 노선']);
    b.run(['abandon', '접은 노선', '--reason', '이 길이 아니었다', '--no-raw-log']);
    const r = b.run(['verdict', '접은 노선', '--outcome', 'superseded', '--why', '더 나은 노선으로 대체됨']);
    assert.equal(r.status, 0, r.stderr);
    const meta = kanban.parseFrontmatter(fs.readFileSync(b.cardPath('abandoned', '접은 노선'), 'utf8'));
    assert.equal(meta.status, 'abandoned', '상태 불변');
    assert.equal(meta.outcome, 'superseded', '판정 부착');
  } finally { b.cleanup(); }
});

test('자동완결 문구 — Result·활동 detail이 작업 완결≠판정을 명시한다', () => {
  const b = makeBoard();
  try {
    const msPath = completedMilestone(b, '문구 계획', '문구 멤버');
    const ms = fs.readFileSync(msPath, 'utf8');
    assert.ok(ms.includes('전원 종결 자동 반영'), '기존 접두 유지(기존 테스트 호환)');
    assert.ok(ms.includes('노선/제품 판정이 아니다'), '판정 아님 명시');
    assert.ok(ms.includes('verdict'), '판정 경로 안내');
    const ev = b.activity().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(e => e && e.action === 'milestone-done').pop();
    assert.ok(ev.detail.includes('작업 완결·판정 별도'), '활동 detail에 판정 별도 취지');
  } finally { b.cleanup(); }
});

test('board report — 판정 마일스톤은 done과 분리 집계, 판정 없으면 기존 스키마 그대로', () => {
  const b = makeBoard();
  try {
    // 판정 없는 보드 먼저 — 기존 보드 하위호환
    b.run(['card', 'new', '옛 계획', '--kind', 'milestone', '--goal', 'g']);
    b.run(['card', 'new', '옛 멤버', '--milestone', '옛 계획', '--goal', 'g', '--ac', 'AC1']);
    b.run(['pick', '--claim', 't', '--card', '옛 멤버']);
    b.run(['done', '옛 멤버', '--result', 'r']);
    let report = JSON.parse(b.run(['board', 'report', '--json']).stdout);
    assert.equal(report.convergence.done, 2, '판정 없으면 마일스톤+멤버 둘 다 done(기존 동작)');
    assert.deepEqual(report.convergence.verdicts, { adopted: 0, rejected: 0, superseded: 0 }, '빈 판정 버킷');
    assert.deepEqual(report.convergence.verdictMilestones, [], '빈 판정 목록');

    // 판정 부착 — 마일스톤은 done 카운트에서 분리된다
    b.run(['verdict', '옛 계획', '--outcome', 'rejected', '--why', '사후 기각']);
    report = JSON.parse(b.run(['board', 'report', '--json']).stdout);
    assert.equal(report.convergence.done, 1, '판정 마일스톤은 done에서 제외');
    assert.equal(report.convergence.verdicts.rejected, 1, 'rejected 집계');
    assert.equal(report.convergence.verdictMilestones.length, 1);
    assert.equal(report.convergence.verdictMilestones[0].title, '옛 계획');
    assert.equal(report.convergence.verdictMilestones[0].outcome, 'rejected');

    // 텍스트 보고에도 분리 집계 줄
    const text = b.run(['board', 'report']).stdout;
    assert.ok(text.includes('마일스톤 판정(verdict)'), '텍스트 판정 줄');
    assert.ok(text.includes('rejected 1'), '집계 내용');
    assert.ok(text.includes('옛 계획 — rejected'), '판정 카드 목록');
  } finally { b.cleanup(); }
});

test('board 뷰 — 종결 마일스톤 ✓ 줄에 판정이 함께 표시된다', () => {
  const b = makeBoard();
  try {
    completedMilestone(b, '뷰 계획', '뷰 멤버');
    let r = b.run(['board']);
    assert.ok(r.stdout.includes('✓ 뷰 계획 — 1/1 (done)'), '판정 없으면 기존 출력 그대로');
    b.run(['verdict', '뷰 계획', '--outcome', 'rejected', '--why', '기각']);
    r = b.run(['board']);
    assert.ok(r.stdout.includes('✓ 뷰 계획 — 1/1 (done · 판정 rejected)'), '판정 표시');
  } finally { b.cleanup(); }
});
