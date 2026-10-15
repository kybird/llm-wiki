// raw Case 골격 lint 회귀 — 2026-10-15 설계 §5: 헤더 라인 형식과 6개 고정 섹션을
// 검사하되 2026-10-16 이후 날짜 파일만 엄격(레거시 마이그레이션 보호 컷오프).
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function makeDocs() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-rawskel-'));
  const docRoot = path.join(tmp, 'doc');
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  const raw = path.join(docRoot, 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const env = { ...process.env, LLM_WIKI_ROOT: docRoot, LLM_WIKI_NO_AUTO_UPDATE: '1' };
  const run = args => spawnSync('node', [CLI, ...args], { env, encoding: 'utf8' });
  return { tmp, docRoot, raw, env, run, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const GOOD = `## [2026-10-17 error] Case 1: 좋은 골격

### Grounding
- Git Context: \`hash:abc1234\`
- Confidence: 5/5

### 검색 단서
card edit 소속 거부, scope amend

### 상황
\`Error: 진행 중 마일스톤에 카드 추가는 범위 변경이다\`

### 가설
오타인 줄 알았다.

### 판정
봉인 가드가 막은 것 — 규약상 범위 변경.

### 조치
--scope-amend 사유를 붙였다.

### Related Knowledge
- Concepts: [[card-file-anatomy]]
`;

test('골격 위반 검사 — 헤더 형식·섹션 누락·빈 파일, 컷오프 이전은 보호', () => {
  const b = makeDocs();
  try {
    // 컷오프 이후 날짜: 위반 있는 파일
    fs.writeFileSync(path.join(b.raw, '2026-10-17.md'),
      '# 2026-10-17\n\n## Case 1: 헤더 형식 구식\n\n### Grounding\n- x\n\n### 상황\n증상\n');
    // 컷오프 이전 날짜: 똑같이 위반해도 보호
    fs.writeFileSync(path.join(b.raw, '2026-10-13.md'),
      '# 2026-10-13\n\n## Case 1: 레거시\n\n### Grounding\n- x\n');

    const j = JSON.parse(b.run(['lint', '--json']).stdout);
    assert.equal(j.rawSkeleton.length, 2, '헤더 위반 1 + 섹션 누락 1(레거시 파일은 제외)');
    assert.ok(j.rawSkeleton.some(i => i.includes('헤더 라인 형식 위반')), '헤더 형식');
    assert.ok(j.rawSkeleton.some(i => i.includes('고정 섹션 누락')), '섹션 누락');
    assert.ok(!j.rawSkeleton.some(i => i.includes('레거시')), '컷오프 이전 미검사');
    assert.ok(!j.rawSkeleton.some(i => i.includes('빈 에피소드')), 'Case 있는 파일은 빈 파일 아님');

    const text = b.run(['lint']).stdout;
    assert.ok(text.includes('Raw Case Skeleton'), '텍스트 보고');
  } finally { b.cleanup(); }
});

test('골격 준수 — 새 계약 파일은 위반 없이 통과, 빈 파일은 지적', () => {
  const b = makeDocs();
  try {
    fs.writeFileSync(path.join(b.raw, '2026-10-18.md'), `# 2026-10-18\n\n${GOOD}`);
    fs.writeFileSync(path.join(b.raw, '2026-10-19.md'), '# 2026-10-19\n\n아무 Case 없음\n');
    const j = JSON.parse(b.run(['lint', '--json']).stdout);
    assert.equal(j.rawSkeleton.length, 1, '좋은 골격 통과, 빈 파일만 지적');
    assert.ok(j.rawSkeleton[0].includes('빈 에피소드'));
  } finally { b.cleanup(); }
});
