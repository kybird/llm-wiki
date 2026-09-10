// 라이브러리 단위 왕복 테스트 — 2026-09-09 리뷰 수습(5-1/5-2)의 임시 재현 스크립트를
// 정식 회귀로 승격. 같은 벽을 다시 치지 않게 한다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kanban = require('../lib/kanban');

// ── frontmatter 값 형태 왕복 (5-2: 값이 변형되지 않는다) ──────────────────

test('스칼라 왕복 — 배열 모양/따옴표 모양 문자열이 문자열로 남는다', () => {
  const cases = ['[a, b]', `동일(")따옴표`, "'홑시작", '쉼표, 있음', 'a:b/c', 'plain', '["j"]'];
  for (const t of cases) {
    const v1 = kanban.parseFrontmatter(kanban.serializeFrontmatter({ title: t }) + '\n---').title;
    assert.equal(v1, t, `왕복 변형: ${t} → ${v1}`);
  }
});

test('비대칭 따옴표는 박리되지 않고 원문 그대로', () => {
  const v = kanban.parseFrontmatter('---\ntitle: "a\'\n---').title;
  assert.equal(v, `"a'`);
});

test('배열 왕복 — 원소의 쉼표·괄호가 분해되지 않는다', () => {
  const arr = ['a', 'b,c', '[괄호]'];
  const v = kanban.parseFrontmatter(kanban.serializeFrontmatter({ depends_on: arr }) + '\n---').depends_on;
  assert.deepEqual(v, arr);
});

test('레거시 비인용 배열 [a, b]도 여전히 파싱된다', () => {
  const v = kanban.parseFrontmatter('---\ndepends_on: [a, b]\n---').depends_on;
  assert.deepEqual(v, ['a', 'b']);
});

// ── board.yml 파싱 (5-2: 행내 주석 오염) ─────────────────────────────────

test('statuses 파싱이 행내 주석의 ]에 오염되지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-yml-'));
  const yml = path.join(tmp, 'board.yml');
  fs.writeFileSync(yml, 'statuses: [todo, doing, review]   # [done] 은 폴더가 말한다\n');
  assert.deepEqual(kanban.loadConfig({ boardYmlPath: yml }).statuses, ['todo', 'doing', 'review']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── 본문 섹션 왕복 (5-1-2: 섹션 하이재크) ────────────────────────────────

test('Notes 안의 ## Goal 줄이 섹션 경계로 오인되지 않는다', () => {
  // 하이재크 시도: Notes 본문에 관리 섹션 헤더와 같은 모양의 줄이 들어온다.
  const parsed = {
    goal: '진짜 골',
    ac: [{ checked: false, idx: 1, text: 'AC1' }],
    sections: new Map([['Notes', '첫 줄\n## Goal\n가로챈 내용\n끝']]),
  };
  const content = kanban.serializeCard({ title: 't', status: 'todo' }, parsed);
  const back = kanban.parseBody(content);
  // Notes 전체가 살아 있고(append-only 계약) Goal은 원문 그대로다.
  assert.equal(back.sections.get('Notes'), '첫 줄\n ## Goal\n가로챈 내용\n끝');
  assert.equal(back.goal, '진짜 골');
});

test('AC 센티넬 안 비-AC 줄이 왕복에서 소실되지 않는다 (5-2)', () => {
  const content = [
    '---', 'title: t', 'status: todo', '---', '',
    '## Goal', '<!-- kanban:goal:begin -->', 'g', '<!-- kanban:goal:end -->', '',
    '## Acceptance Criteria', '<!-- kanban:ac:begin -->',
    '- [ ] #1 실제 AC', '근거 링크: 어딘가',
    '<!-- kanban:ac:end -->', '',
  ].join('\n');
  const rt = kanban.parseBody(kanban.serializeCard(
    { title: 't', status: 'todo' }, kanban.parseBody(content)));
  assert.ok(rt.ac[0].text.includes('근거 링크: 어딘가'), `연속행 소실: ${JSON.stringify(rt.ac)}`);
});

// ── 클레임 만료 판정 ─────────────────────────────────────────────────────

test('isClaimExpired — 만료된 클레임 판정', () => {
  const config = { claimTimeoutMinutes: 60 };
  assert.equal(kanban.isClaimExpired({ meta: { claimed_at: new Date(Date.now() - 2 * 3600e3).toISOString() } }, config), true);
  assert.equal(kanban.isClaimExpired({ meta: { claimed_at: new Date(Date.now() - 5 * 60e3).toISOString() } }, config), false);
  assert.equal(kanban.isClaimExpired({ meta: {} }, config), true); // 클레임 없음 = 만료
});
