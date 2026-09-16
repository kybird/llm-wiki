// 마일스톤 회귀 테스트 — 카드 모델 확장(plan.md 3.8, 2026-09-16):
//   kind: milestone 카드 생성, 멤버 milestone 필드 검증(존재·kind·평면),
//   card edit 재지정(활성만), 왕복 직렬화 보존.
// 이 파일은 이후 카드(집기 제외·자동 종결, 보드 뷰)의 회귀도 함께 담는다.
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-ms-'));
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

test('card new --kind milestone — 마일스톤 카드를 만든다(제목 규율·Goal·AC 동일 적용)', () => {
  const b = makeBoard();
  try {
    const r = b.run(['card', 'new', '모니터 프론트엔드', '--kind', 'milestone', '--goal', '사람이 실시간으로 본다', '--ac', 'AC1']);
    assert.equal(r.status, 0, r.stderr);
    const content = fs.readFileSync(b.cardPath('모니터 프론트엔드'), 'utf8');
    assert.ok(content.includes('kind: milestone'), 'frontmatter에 kind가 심어진다');
    assert.ok(r.stdout.includes('kind: milestone'), '성공 출력에 kind 보고');
    assert.ok(content.includes('사람이 실시간으로 본다'), 'Goal 동일 적용');
    // 같은 제목 재생성은 기존 규율을 그대로 밟는다
    assert.equal(b.run(['card', 'new', '모니터 프론트엔드', '--kind', 'milestone']).status, 1, '제목 중복 거부');
    // 허용 외 kind 값 거부
    const bad = b.run(['card', 'new', '잘못된 종류', '--kind', 'epic']);
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes('--kind'), 'kind 값 안내');
  } finally { b.cleanup(); }
});

test('--milestone 검증 — 존재·kind=milestone·평면 위반을 쓰기 전에 거부한다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '계획 하나', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '멤버 후보', '--goal', 'g']).status, 0);

    const missing = b.run(['card', 'new', '고아 멤버', '--milestone', '없는 계획']);
    assert.equal(missing.status, 1);
    assert.ok(missing.stderr.includes('마일스톤 카드가 없다'), '존재 검증');

    const notMs = b.run(['card', 'new', '일반행 멤버', '--milestone', '멤버 후보']);
    assert.equal(notMs.status, 1);
    assert.ok(notMs.stderr.includes('마일스톤 카드가 아니다'), 'kind 검증');

    const flat = b.run(['card', 'new', '계획 둘', '--kind', 'milestone', '--milestone', '계획 하나']);
    assert.equal(flat.status, 1);
    assert.ok(flat.stderr.includes('평면'), '평면 위반 거부');
    assert.ok(!fs.existsSync(b.cardPath('계획 둘')), '실패는 파일을 안 만든다');

    const ok = b.run(['card', 'new', '정상 멤버', '--milestone', '계획 하나', '--goal', 'g']);
    assert.equal(ok.status, 0, ok.stderr);
    const content = fs.readFileSync(b.cardPath('정상 멤버'), 'utf8');
    assert.ok(content.includes('milestone: 계획 하나'), 'frontmatter에 소속 기록');
    assert.ok(!content.includes('kind:'), '일반 카드에는 kind를 안 심는다');
  } finally { b.cleanup(); }
});

test('card edit --milestone — 활성 카드만 재지정, 종결·평면은 거부', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '계획 A', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '계획 B', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '작업', '--milestone', '계획 A', '--goal', 'g']).status, 0);

    const r = b.run(['card', 'edit', '작업', '--milestone', '계획 B']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('milestone=계획 B'), '변경 요약에 재지정');
    assert.ok(fs.readFileSync(b.cardPath('작업'), 'utf8').includes('milestone: 계획 B'), '파일 반영');

    // 마일스톤 카드 자신에는 소속을 못 건다(평면)
    const flat = b.run(['card', 'edit', '계획 A', '--milestone', '계획 B']);
    assert.equal(flat.status, 1);
    assert.ok(flat.stderr.includes('평면'));

    // 종결 카드의 소속은 회고 이력 — 재편 거부
    assert.equal(b.run(['pick', '--claim', 't', '--card', '작업']).status, 0);
    assert.equal(b.run(['done', '작업', '--result', '끝']).status, 0);
    const term = b.run(['card', 'edit', '작업', '--milestone', '계획 A']);
    assert.equal(term.status, 1);
    assert.ok(term.stderr.includes('회고'), '종결 소속 보호');
  } finally { b.cleanup(); }
});

test('왕복 직렬화 — milestone·kind는 노트 추가 등 재작성을 거쳐 보존된다', () => {
  const b = makeBoard();
  try {
    assert.equal(b.run(['card', 'new', '왕복 계획', '--kind', 'milestone', '--goal', 'g']).status, 0);
    assert.equal(b.run(['card', 'new', '왕복 멤버', '--milestone', '왕복 계획', '--goal', 'g', '--ac', 'AC1']).status, 0);
    // 무관한 편집 한 번 → 전체 재직렬화 유발
    assert.equal(b.run(['card', 'edit', '왕복 멤버', '--note', '재작성 유발']).status, 0);
    const content = fs.readFileSync(b.cardPath('왕복 멤버'), 'utf8');
    assert.ok(content.includes('milestone: 왕복 계획'), 'milestone 왕복 보존');

    const parsed = kanban.parseFrontmatter(content);
    assert.equal(parsed.milestone, '왕복 계획', '파싱 결과');
    assert.equal(parsed.kind, undefined, '일반 카드 kind 부재 유지');
    const ms = kanban.parseFrontmatter(fs.readFileSync(b.cardPath('왕복 계획'), 'utf8'));
    assert.equal(ms.kind, 'milestone', 'kind 왕복 보존');

    // 값 없는 --milestone은 기존 플래그 규칙대로 실패
    assert.equal(b.run(['card', 'new', '값없음', '--milestone']).status, 1);
  } finally { b.cleanup(); }
});
