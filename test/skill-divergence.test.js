// 버전 마커 무결성 — 같은 skill-version 번호에 내용이 다른 복사본(이중 카운터 분기)을
// 덮어쓰지 못하게 하는 회귀. 2026-10-13·11-09 구템플릿 되돌림 사고의 감지 실패 원인:
// 마커가 살아있으면 무조건 정본이 이겨서 덮었기 때문이다. syncMarkedFiles(init·
// auto-update)와 skills sync(git 채널) 양쪽을 다 검증한다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stampPath } = require('../lib/auto-update');

const PKG_ROOT = path.join(__dirname, '..');

// 임시 소비 레포 — wiki + 칸반 골격. 스탬프·등록부는 임시 state 디렉터리로 밀폐.
function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-div-'));
  const docRoot = path.join(tmp, 'docs');
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true });
  require('../lib/kanban').scaffold(docRoot);
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-div-state-'));
  const run = (args) => spawnSync('node', [path.join(PKG_ROOT, 'bin', 'llm-wiki.js'), ...args], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, LLM_WIKI_STATE_DIR: state },
  });
  return { tmp, docRoot, state, run };
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* 정리 실패는 무시 */ }
  }
}

// 정본 work-loop을 한 줄 변형한다 — skill-version 라인은 그대로(이중 카운터 상태 재현).
function tamperedWorkLoop() {
  const pkg = fs.readFileSync(path.join(PKG_ROOT, 'skills', 'work-loop', 'SKILL.md'), 'utf8');
  return pkg.replace('# When to use', '# When to use (LOCAL EVOLUTION)');
}

function seedSkill(tmp, name, content, target = '.agents') {
  const dir = path.join(tmp, target, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
  return path.join(dir, 'SKILL.md');
}

test('같은 버전·내용 분기 복사본을 init이 덮지 않고 diverged로 보고한다', () => {
  const b = makeRepo();
  try {
    const dest = seedSkill(b.tmp, 'work-loop', tamperedWorkLoop());
    const before = fs.readFileSync(dest, 'utf8');

    const r = b.run(['init']);
    assert.equal(r.status, 0, `init 실패: ${r.stderr}`);
    assert.ok(r.stdout.includes('diverged'), `diverged 보고가 없다: ${r.stdout}`);
    assert.ok(r.stdout.includes('버전 분기'), `분기 안내가 없다: ${r.stdout}`);
    assert.equal(fs.readFileSync(dest, 'utf8'), before, '분기 복사본이 덮어써졌다 — 사고 재현');
  } finally { cleanup(b.tmp, b.state); }
});

test('auto-update(board 디스패치)도 분기를 건너뛰고 한 줄로 보고한다', () => {
  const b = makeRepo();
  try {
    const dest = seedSkill(b.tmp, 'work-loop', tamperedWorkLoop());
    const before = fs.readFileSync(dest, 'utf8');
    // 스탬프를 옛 버전으로 밀어 자동 갱신을 발화시킨다.
    process.env.LLM_WIKI_STATE_DIR = b.state;
    const sp = stampPath(b.tmp);
    delete process.env.LLM_WIKI_STATE_DIR;
    fs.mkdirSync(path.dirname(sp), { recursive: true });
    fs.writeFileSync(sp, '0.0.0');

    const r = b.run(['board']);
    assert.equal(r.status, 0, `board 실패: ${r.stderr}`);
    assert.ok(r.stdout.includes('버전 분기'), `분기 보고가 없다: ${r.stdout}`);
    assert.ok(!/updated [1-9]/.test(r.stdout), `분기 상태에서 뭔가 갱신됐다: ${r.stdout}`);
    assert.equal(fs.readFileSync(dest, 'utf8'), before, '분기 복사본이 덮어써졌다');
  } finally { cleanup(b.tmp, b.state); }
});

test('줄바꿈(CRLF)만 다른 복사본은 분기가 아니다 — 다시 쓰지도 않는다', () => {
  const b = makeRepo();
  try {
    const pkg = fs.readFileSync(path.join(PKG_ROOT, 'skills', 'work-loop', 'SKILL.md'), 'utf8');
    // /\r?\n/ → \r\n: 원본이 어떤 EOL 혼합이든 순수 CRLF 판을 만든다(단순 /\n/g 치환은
    // 원본 CRLF에 \r\r\n을 만들어 잔여 \r이 남는다 — 정규화 뒤에도 다른 문자열이 된다).
    const dest = seedSkill(b.tmp, 'work-loop', pkg.replace(/\r?\n/g, '\r\n'));

    const r = b.run(['init']);
    assert.equal(r.status, 0, `init 실패: ${r.stderr}`);
    assert.ok(!r.stdout.includes('diverged'), `EOL 차이를 분기로 오판: ${r.stdout}`);
    assert.ok(fs.readFileSync(dest, 'utf8').includes('\r\n'), 'EOL 차이만으로 다시 썼다');
  } finally { cleanup(b.tmp, b.state); }
});

test('낡은 버전 마커는 종전대로 정본이 이긴다 — 분기 가드가 정상 갱신을 막지 않는다', () => {
  const b = makeRepo();
  try {
    const dest = seedSkill(b.tmp, 'work-loop', 'old prompt\nskill-version: 1\n');

    const r = b.run(['init']);
    assert.equal(r.status, 0, `init 실패: ${r.stderr}`);
    const fresh = fs.readFileSync(path.join(PKG_ROOT, 'skills', 'work-loop', 'SKILL.md'), 'utf8');
    assert.equal(fs.readFileSync(dest, 'utf8'), fresh, '낡은 마커 사본이 갱신돼야 한다');
  } finally { cleanup(b.tmp, b.state); }
});

test('skills sync(git 채널)도 같은 버전 분기를 --yes여도 덮지 않고 보고한다', { timeout: 120000 }, () => {
  const b = makeRepo();
  try {
    // 소스 = 이 레포 자체(로컬 경로 clone) — 정본 skills/가 곧 sync 소스다.
    const add = b.run(['skills', 'add', PKG_ROOT]);
    assert.equal(add.status, 0, `skills add 실패: ${add.stderr}`);

    // 1) 정상 설치: 분기 아닌 스킬은 그대로 들어온다(work-loop 신규 설치).
    const dest = seedSkill(b.tmp, 'work-loop', tamperedWorkLoop());
    const before = fs.readFileSync(dest, 'utf8');
    seedSkill(b.tmp, 'wiki-log', 'old\nskill-version: 1\n');

    const r = b.run(['skills', 'sync', '--yes', '--skill', 'work-loop']);
    assert.equal(r.status, 0, `sync 실패: ${r.stderr}`);
    assert.ok(r.stdout.includes('버전 분기'), `분기 보고가 없다: ${r.stdout}`);
    assert.equal(fs.readFileSync(dest, 'utf8'), before, '--yes 가 분기 복사본을 덮었다 — 사고 재현');

    // 2) 낡은 마커(v1)는 승인(--yes) 경로로 정상 갱신된다.
    const r2 = b.run(['skills', 'sync', '--yes', '--skill', 'wiki-log']);
    assert.equal(r2.status, 0, `sync(정상 갱신) 실패: ${r2.stderr}`);
    const freshLog = fs.readFileSync(path.join(PKG_ROOT, 'skills', 'wiki-log', 'SKILL.md'), 'utf8');
    // clone 체크아웃은 autocrlf로 CRLF일 수 있다 — 줄바꿈 정규화 뒤 비교.
    const norm = t => t.replace(/\r\n/g, '\n');
    assert.equal(
      norm(fs.readFileSync(path.join(b.tmp, '.agents', 'skills', 'wiki-log', 'SKILL.md'), 'utf8')),
      norm(freshLog), '낡은 마커 스킬은 --yes 로 갱신돼야 한다');
  } finally { cleanup(b.tmp, b.state); }
});
