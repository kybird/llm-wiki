// findDocRoot 워크트리 회귀 — 보드는 프로젝트 자원이지 브랜치 자원이 아니다.
// 2026-09-12 sugarScan 실측(링크 워크트리마다 보드가 갈라짐 — 폐기 카드 되살아남,
// activity.jsonl 병합 충돌)을 임시 저장소로 재현해 못박는다.
// 실행: npm test (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findDocRoot } = require('../lib/find-doc-root');

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
}

// 드라이브 문자 대소·8.3 단축명 같은 Windows 경로 표기 차이를 흡수해 비교한다.
function real(p) {
  const r = fs.realpathSync.native(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

let repo = null;
let linked = null;

test.before(() => {
  // 임시 저장소: doc/wiki를 만들고 커밋한 뒤 링크 워크트리 하나를 얹는다.
  // 커밋에 doc/wiki가 포함돼야 링크 워크트리에도(체크아웃 사본) doc/wiki가 있다 —
  // 옵트아웃 테스트의 3단계 탐색이 워크트리 자기 doc을 찾는 근거.
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-wt-'));
  fs.mkdirSync(path.join(repo, 'doc', 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'doc', 'wiki', 'index.md'), '# index\n');
  assert.equal(git(['init', '--quiet'], repo).status, 0, 'git init 실패');
  assert.equal(git(['add', '-A'], repo).status, 0, 'git add 실패');
  assert.equal(
    git(['-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '--quiet', '-m', 'init'], repo).status,
    0, '초기 커밋 실패');
  linked = path.join(os.tmpdir(), path.basename(repo) + '-linked');
  const wt = git(['worktree', 'add', '--quiet', '-b', 'wt-test', linked], repo);
  if (wt.status !== 0) throw new Error(`git worktree add 실패: ${wt.stderr}`);
});

test.after(() => {
  // Windows: 링크 워크트리 디렉터리를 그냥 지우면 주 저장소 .git/worktrees에 잔여물이
  // 남으니 worktree remove로 정리한다. 정리 실패는 테스트 실패가 아니다.
  try {
    if (repo && fs.existsSync(repo)) {
      git(['worktree', 'remove', '--force', linked], repo);
      git(['worktree', 'prune'], repo);
      fs.rmSync(repo, { recursive: true, force: true });
    }
    if (linked && fs.existsSync(linked)) fs.rmSync(linked, { recursive: true, force: true });
  } catch { /* 임시 디렉터리 정리 실패는 무시 */ }
});

test('주 워크트리에서 호출 → 주 워크트리 doc', () => {
  assert.equal(real(findDocRoot(repo)), real(path.join(repo, 'doc')));
});

test('링크 워크트리에서 호출 → 주 워크트리 doc (이번 수정의 핵심)', () => {
  // 링크 워크트리에도 자기 doc/wiki(체크아웃 사본)가 있지만 주 워크트리 것이 이긴다.
  assert.ok(fs.existsSync(path.join(linked, 'doc', 'wiki')), '링크 워크트리에 doc/wiki 사본이 있어야 한다');
  assert.equal(real(findDocRoot(linked)), real(path.join(repo, 'doc')));
});

test('LLM_WIKI_WORKTREE_LOCAL=1 → 링크 워크트리 자기 doc (옵트아웃, 종전 동작)', () => {
  process.env.LLM_WIKI_WORKTREE_LOCAL = '1';
  try {
    assert.equal(real(findDocRoot(linked)), real(path.join(linked, 'doc')));
  } finally {
    delete process.env.LLM_WIKI_WORKTREE_LOCAL;
  }
});
