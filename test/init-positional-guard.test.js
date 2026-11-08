// init 위치인자 가드 회귀 — `init check` 같은 --check 오타가 풀 init(쓰기)으로
// 조용히 변환되는 함정(pick 2026-11-08 계열, 같은 날 스윕에서 발견).
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'llm-wiki.js');

function tmpRepo(name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `kb-init-${name}-`));
  const run = args => spawnSync(process.execPath, [CLI, ...args], {
    cwd: tmp, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, LLM_WIKI_STATE_DIR: path.join(tmp, 'state'), LLM_WIKI_NO_AUTO_UPDATE: '1' },
  });
  return { tmp, run, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test('init <위치인자> — 조용한 풀 init 오실행 대신 이름을 말하고 실패한다', () => {
  const b = tmpRepo('guard');
  try {
    const r = b.run(['init', 'check']); // --check를 단어로 친 오타
    assert.notEqual(r.status, 0, '위치인자는 실패');
    assert.ok((r.stdout + r.stderr).includes('위치인자'), `사유가 출력돼야 한다:\n${r.stdout}${r.stderr}`);
    assert.ok(!fs.existsSync(path.join(b.tmp, 'docs')), '아무것도 쓰지 않는다');
    // 정상 경로 불변 — bare init은 스캐폴딩한다
    const ok = b.run(['init']);
    assert.equal(ok.status, 0, 'bare init은 성공');
    assert.ok(fs.existsSync(path.join(b.tmp, 'docs', 'wiki')), '스캐폴딩 전제');
    // --check도 불변
    const chk = b.run(['init', '--check']);
    assert.equal(chk.status, 0, '--check는 성공');
  } finally { b.cleanup(); }
});
