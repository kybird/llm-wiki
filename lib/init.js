// llm-wiki init — 타겟 리포(cwd)에 wiki 시스템 골격을 복사.
// 복사 대상: doc/ 골격 + skills/ 4개 + githooks/ + scripts/(동기화).
// 스크립트는 복사하지 않는다 — 스킬이 글로벌 `llm-wiki` CLI를 호출하므로
// 타겟 리포에 스크립트를 둘 필요가 없다 (npm update 한 번으로 모든 리포 갱신).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { defaultCollectionNames } = require('./find-doc-root');

const PKG_ROOT = path.resolve(__dirname, '..');

// qmd 전역 설정 디렉토리 경로 — @tobilu/qmd의 우선순위(QMD_CONFIG_DIR > XDG_CONFIG_HOME >
// ~/.config/qmd)와 동일하게 맞춘다(collections.js 참고). 여기 없으면 qmd 미설치/미사용 상태라
// 충돌 자체가 불가능하므로 검사를 건너뛴다.
function qmdConfigDir() {
  if (process.env.QMD_CONFIG_DIR) return process.env.QMD_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'qmd');
  return path.join(os.homedir(), '.config', 'qmd');
}

// 전역 QMD 컬렉션 이름 충돌 검사 — 다른 프로젝트가 이미 같은 이름으로 등록돼 있으면
// (2026-07-25 실제로 발생: 두 프로젝트가 기본값을 그대로 써서 서로의 로그가 뒤섞여 검색됨,
// 에러 없이 조용히 실패하는 유형이라 알아채기 어려움) init 시점에 경고한다.
function warnIfCollectionNameCollides(names, cwd) {
  const indexPath = path.join(qmdConfigDir(), 'index.yml');
  if (!exists(indexPath)) return; // qmd 미사용 — 충돌 불가능

  let text;
  try {
    text = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return;
  }

  for (const name of [names.wiki, names.raw]) {
    const re = new RegExp(`^\\s{2}${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`, 'm');
    if (re.test(text)) {
      console.log(
        `⚠️  QMD collection "${name}" already exists in ${indexPath} (possibly from another project).\n` +
        `   Run 'llm-wiki compile index' and check the printed collection paths — if it points to a\n` +
        `   different repo, set a unique name in llm-wiki.config.json: { "collections": { "wiki": "...", "raw": "..." } }`
      );
    }
  }
}

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

  // 5. QMD 컬렉션 이름 충돌 검사 (리포 폴더명 기반 기본값이라도, 여러 리포명이 sanitize 후
  // 같은 이름으로 축약되거나 llm-wiki.config.json으로 수동 지정한 이름이 겹칠 수 있음).
  const defaultNames = defaultCollectionNames(docDir);
  warnIfCollectionNameCollides(defaultNames, cwd);

  // 6. git hooks 활성화 안내 (자동 실행 아님 — 사용자 의도 확인)
  console.log('\n--- Next steps ---');
  console.log('1. Enable git hooks (run once):');
  console.log('   git config core.hooksPath githooks');
  console.log('');
  console.log('2. (Optional) Enable semantic search:');
  console.log('   npm i @tobilu/qmd');
  console.log('   # without qmd, llm-wiki search falls back to grep');
  console.log(`   # QMD collection names default to this repo's folder name: "${defaultNames.wiki}" / "${defaultNames.raw}"`);
  console.log('');
  console.log('3. Set project name and/or override collection names (optional) — create llm-wiki.config.json:');
  console.log('   { "projectName": "my-project", "collections": { "wiki": "my-project-wiki", "raw": "my-project-wiki-raw" } }');
  console.log('');
  console.log('Done. AI agents will now use wiki-search/log/compile/lint.');
}

module.exports = { init };
