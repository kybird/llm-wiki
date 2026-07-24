// llm-wiki init — 타겟 리포(cwd)에 wiki 시스템 골격을 복사.
// 복사 대상: doc/ 골격 + skills/ 4개 + githooks/ + scripts/(동기화).
// 스크립트는 복사하지 않는다 — 스킬이 글로벌 `llm-wiki` CLI를 호출하므로
// 타겟 리포에 스크립트를 둘 필요가 없다 (npm update 한 번으로 모든 리포 갱신).
const fs = require('fs');
const path = require('path');

const PKG_ROOT = path.resolve(__dirname, '..');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function init() {
  const cwd = process.cwd();

  console.log(`Initializing llm-wiki in: ${cwd}\n`);

  // 1. doc/ 골격
  const docDir = path.join(cwd, 'doc');
  const templatesDoc = path.join(PKG_ROOT, 'templates', 'doc');
  if (exists(path.join(docDir, 'wiki', 'index.md'))) {
    console.log('✓ doc/ already exists, skipping scaffold.');
  } else {
    copyRecursive(templatesDoc, docDir);
    console.log('✓ Created doc/ (raw/, wiki/index.md)');
  }

  // 2. skills/ (정본). 에이전트 CLI별로 읽는 위치가 다르므로:
  //    .agents/skills/ — 표준 정본 (ZCode, Cursor 등)
  //    .claude/skills/ — Claude Code 복사본
  //    동기화는 githooks/sync 스크립트가 담당 (아래 설치).
  const skillsSrc = path.join(PKG_ROOT, 'skills');
  for (const target of ['.agents/skills', '.claude/skills']) {
    const dest = path.join(cwd, target);
    copyRecursive(skillsSrc, dest);
    console.log(`✓ Copied skills/ → ${target}/`);
  }

  // 3. scripts/ 동기화 스크립트
  const scriptsSrc = path.join(PKG_ROOT, 'templates', 'scripts');
  const scriptsDest = path.join(cwd, 'scripts');
  if (!exists(scriptsDest)) fs.mkdirSync(scriptsDest, { recursive: true });
  copyRecursive(scriptsSrc, scriptsDest);
  console.log('✓ Copied sync scripts → scripts/');

  // 4. githooks/pre-commit
  const hooksSrc = path.join(PKG_ROOT, 'templates', 'githooks');
  const hooksDest = path.join(cwd, 'githooks');
  if (!exists(hooksDest)) fs.mkdirSync(hooksDest, { recursive: true });
  copyRecursive(hooksSrc, hooksDest);
  console.log('✓ Copied githooks/');

  // 5. git hooks 활성화 안내 (자동 실행 아님 — 사용자 의도 확인)
  console.log('\n--- Next steps ---');
  console.log('1. Enable git hooks (run once):');
  console.log('   git config core.hooksPath githooks');
  console.log('');
  console.log('2. (Optional) Enable semantic search:');
  console.log('   npm i @tobilu/qmd');
  console.log('   # without qmd, llm-wiki search falls back to grep');
  console.log('');
  console.log('3. Set project name (optional) — create llm-wiki.config.json:');
  console.log('   { "projectName": "my-project" }');
  console.log('');
  console.log('Done. AI agents will now use wiki-search/log/compile/lint.');
}

module.exports = { init };
