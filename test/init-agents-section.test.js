// AGENTS.md 관리 섹션 자동 동기화 — 2026-11-09 전파 간 계통 수정의 회귀.
// "매 세션이 무조건 읽는 면"이 시드 시점에 얼어 계약 변화(doc→docs 전환 등)가 소비
// 레포에 전파되지 않던 갭: llm-wiki:section 마커 블록만 패키지가 갱신하고, 마커 밖은
// 불가침이며, 마커 없는 기존 파일(구판 시드·손본)은 append로 채택한다(덮어쓰기 아님).
//   1 마커 없는 파일 → append 채택, 기존 내용 바이트 보존
//   2 마커 살아있고 낡음 → 블록만 치환, 마커 밖 보존
//   3 최신 → 쓰지 않음(멱등)   4 옵트아웃 → 미각   5 미설치 → 시드
//   6 사용자가 섹션 삭제 → 재채택(다음 갱신에 다시 append)
//   7 CLI 통합 — npm update 후 첫 명령(auto-update)이 주입하고 보고한다
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncAgentsSection, syncCopies } = require('../lib/init');

const PKG_ROOT = path.join(__dirname, '..');
const SECTION_START = '<!-- llm-wiki:section start';
const SECTION_END = '<!-- llm-wiki:section end -->';

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-sec-'));
}

// 정본 템플릿에서 관리 블록만 뽑는다(테스트 기대값).
function templateBlock() {
  const t = fs.readFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md'), 'utf8');
  const s = t.indexOf(SECTION_START);
  const e = t.indexOf(SECTION_END);
  return t.slice(s, e + SECTION_END.length);
}

test('마커 없는 기존 파일 — append 채택, 기존 내용은 바이트 보존', () => {
  const tmp = tmpRepo();
  try {
    const mine = '# 내 레포 지시\n\n이 파일은 내가 손으로 쓴 것이다.\n';
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), mine);
    const r = syncAgentsSection(tmp, { apply: true });
    assert.equal(r.status, 'injected', '채택 상태');
    const after = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(after.startsWith(mine), '기존 내용 앞부분이 그대로여야 한다');
    assert.ok(after.includes(templateBlock()), '정본 블록이 append돼야 한다');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('마커 살아있고 낡음 — 블록만 치환, 마커 밖 보존', () => {
  const tmp = tmpRepo();
  try {
    const mine = '# 내 레포 지시 — 위\n';
    const tail = '\n내 추가 섹션 — 아래\n';
    const stale = mine + SECTION_START + '\n구판 계약 내용\n' + SECTION_END + tail;
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), stale);
    const r = syncAgentsSection(tmp, { apply: true });
    assert.equal(r.status, 'updated', '갱신 상태');
    const after = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(after.startsWith(mine), '마커 앞 사용자 영역 불가침');
    assert.ok(after.endsWith(tail), '마커 뒤 사용자 영역 불가침');
    assert.ok(after.includes(templateBlock()), '블록이 정본으로 치환돼야 한다');
    assert.ok(!after.includes('구판 계약 내용'), '낡은 블록 내용은 사라져야 한다');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('최신 블록 — 멱등, 다시 쓰지 않는다', () => {
  const tmp = tmpRepo();
  try {
    const t = fs.readFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md'), 'utf8');
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), t);
    const p = path.join(tmp, 'AGENTS.md');
    const before = fs.statSync(p).mtimeMs;
    const r = syncAgentsSection(tmp, { apply: true });
    assert.equal(r.status, 'ok', '최신 상태');
    assert.equal(fs.statSync(p).mtimeMs, before, '같은 내용이면 쓰면 안 된다');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('옵트아웃 — agentsMdSection:false면 syncCopies가 손대지 않는다', () => {
  const tmp = tmpRepo();
  try {
    const mine = '# 손본 파일\n';
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), mine);
    const out = syncCopies(tmp, { apply: true, config: { agentsMdSection: false, hooksPath: 'x' } });
    assert.equal(out.agents[0].status, 'opted-out', '옵트아웃 상태');
    assert.equal(fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8'), mine, '파일 불가침');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('AGENTS.md 미설치 — 시드(템플릿 그대로, 마커 포함)', () => {
  const tmp = tmpRepo();
  try {
    const r = syncAgentsSection(tmp, { apply: true });
    assert.equal(r.status, 'copied', '시드 상태');
    const t = fs.readFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md'), 'utf8');
    assert.equal(fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8'), t, '템플릿과 동일');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('사용자가 섹션를 지웠다 — 다음 갱신에 재채택(append)', () => {
  const tmp = tmpRepo();
  try {
    // 먼저 주입해 두고, 사용자가 블록(마커 포함)을 지운 상태를 만든다.
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# 내 레포\n');
    syncAgentsSection(tmp, { apply: true });
    const withSection = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
    const stripped = withSection.replace(templateBlock(), '');
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), stripped);
    const r = syncAgentsSection(tmp, { apply: true });
    assert.equal(r.status, 'injected', '재채택은 append로');
    assert.ok(fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8').includes(templateBlock()));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CLI 통합 — auto-update가 구판 파일에 섹션를 주입하고 보고한다', () => {
  const tmp = tmpRepo();
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-sec-state-'));
  try {
    // init 흔적(docs/wiki + kanban 골격) + 구판 AGENTS.md(마커 없음)
    fs.mkdirSync(path.join(tmp, 'docs', 'wiki'), { recursive: true });
    require('../lib/kanban').scaffold(path.join(tmp, 'docs'));
    const mine = '# 과거 시드 파일 — 0.5.x 시절 그대로\n';
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), mine);

    const r = spawnSync('node', [path.join(PKG_ROOT, 'bin', 'llm-wiki.js'), 'board'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...process.env, LLM_WIKI_ROOT: path.join(tmp, 'docs'), LLM_WIKI_STATE_DIR: state },
    });
    assert.equal(r.status, 0, `board 실패: ${r.stderr}`);
    const after = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(after.startsWith(mine), '기존 내용 불가침');
    assert.ok(after.includes(templateBlock()), '관리 섹션 주입');
    assert.ok(after.includes('docs/`(복수)가 정본'), '레이아웃 계약 문구가 주입됐다');
    assert.ok(r.stdout.includes('AGENTS.md 섹션 주입'), `보고 줄 누락: ${r.stdout}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(state, { recursive: true, force: true });
  }
});
