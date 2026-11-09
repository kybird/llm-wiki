// llm-wiki init — 타겟 리포(cwd)에 wiki 시스템 골격을 복사.
// 복사 대상: docs/ 골격 + skills/ 4개 + githooks/ + scripts/(동기화).
// 스크립트는 복사하지 않는다 — 스킬이 글로벌 `llm-wiki` CLI를 호출하므로
// 타겟 리포에 스크립트를 둘 필요가 없다 (npm update 한 번으로 모든 리포 갱신).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { defaultCollectionNames, loadConfig, docLayoutRoot } = require('./find-doc-root');
const { maybeMigrateDocDir } = require('./migrate-doc-dir');

const PKG_ROOT = path.resolve(__dirname, '..');

// 스킬 설치 대상 — 에이전트 CLI별로 읽는 위치가 다르다.
//   .agents/skills/ — 표준 정본 (ZCode, Cursor 등)
//   .claude/skills/ — Claude Code 복사본
const SKILL_TARGETS = ['.agents/skills', '.claude/skills'];

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

// ── 마커 있는 사본 동기화 (plan.md 6.1 + 개선계획 1-7, 2026-08-29 훅/스크립트로 확장) ──
// 패키지 정본(skills/, templates/)의 각 파일은 버전 마커를 갖는다.
// 복사본과 정본이 다를 때:
//   - 복사본에 마커가 살아있으면 → 미수정 판정. 정본이 이겨서 덮어쓴다(갱신 가능).
//   - 복사본에서 마커가 사라졌으면 → 사용자가 손댄 것. 건너뛴다.
//     스킬은 frontmatter의 skill-version:, 훅·스크립트는 본문의 llm-wiki-template-version:.
// apply=false면 아무것도 쓰지 않고 판정만 돌려준다 (init --check).
function syncMarkedFiles(srcDir, targets, markerRe, { apply = false } = {}) {
  const actions = [];
  for (const rel of listFilesRecursive(srcDir)) {
    const srcPath = path.join(srcDir, rel);
    const srcContent = fs.readFileSync(srcPath, 'utf8');
    for (const target of targets) {
      const destPath = path.join(target, rel);
      const action = { rel, target, status: 'ok' };
      if (!fs.existsSync(destPath)) {
        action.status = 'missing';
        if (apply) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
          action.status = 'copied';
        }
      } else {
        const destContent = fs.readFileSync(destPath, 'utf8');
        if (destContent !== srcContent) {
          if (!markerRe.test(destContent)) {
            action.status = 'user-modified';
          } else {
            action.status = apply ? 'updated' : 'stale';
            if (apply) fs.writeFileSync(destPath, srcContent);
          }
        }
      }
      actions.push(action);
    }
  }
  return actions;
}

const SKILL_VERSION_RE = /^skill-version:\s*\d+\s*$/m;
// 훅(bash #주석)과 .bat(REM 주석)을 함께 커버하는 부분문자열 마커.
const TEMPLATE_VERSION_RE = /llm-wiki-template-version:\s*\d+/;

function syncSkills(skillsSrc, targets, options = {}) {
  return syncMarkedFiles(skillsSrc, targets, SKILL_VERSION_RE, options);
}

// ── AGENTS.md 관리 섹션 동기화 (2026-11-09 — 전파 갭 계통 수정) ──────────────
// "매 세션이 무조건 읽는 면"(AGENTS.md)이 시드 시점에 얼어 있어 계약 변화(0.6.0
// doc→docs 전환 등)가 소비 레포의 에이전트에게 전파되지 않았다(2026-11-09
// TTSTextViewer 진단 오판 사고 — QMD 등록부는 자가치유됐지만 진단한 에이전트가
// 구계약을 알고 있었다). plan.md 6.3·6.4의 "레포 소유·합성 배관 금지" 원칙은
// 마커 밖 영역과 '여러 저자 합성' 금지로 그대로 유지하되, llm-wiki:section 마커로
// 감싼 단일 저자 블록만 패키지가 갱신한다.
//   - 마커 쌍이 살아있으면 → 블록(마커 포함)을 정본으로 치환. 파일의 나머지는 불가침.
//   - 마커가 없으면(구판 시드·손본 파일) → 파일 끝에 append(채택). 덮어쓰기가 아니라
//     추가이므로 6.1 "사용자가 손댄 파일은 덮어쓰지 않는다"와 양립한다.
//   - 옵트아웃: llm-wiki.config.json { "agentsMdSection": false }.
const AGENTS_SECTION_START = '<!-- llm-wiki:section start';
const AGENTS_SECTION_END = '<!-- llm-wiki:section end -->';

// 텍스트에서 관리 블록(시작 마커 시작 → 끝 마커 끝)을 뽑는다. 마커 쌍이 온전치
// 않으면 null. 문자열 인덱스 수술이라 마커 밖 줄바꿈·인코딩은 바이트 보존된다.
function extractAgentsSection(text) {
  const s = text.indexOf(AGENTS_SECTION_START);
  if (s === -1) return null;
  const e = text.indexOf(AGENTS_SECTION_END, s);
  if (e === -1) return null;
  return text.slice(s, e + AGENTS_SECTION_END.length);
}

function templateAgentsSection() {
  try {
    return extractAgentsSection(fs.readFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md'), 'utf8'));
  } catch {
    return null; // 정본 템플릿을 못 읽으면 조용히 스킵 — 명령을 막지 않는다
  }
}

// 실제 파일명을 찾는다 — Windows에선 agents.md 소문자로 살아 있을 수 있다(케이스 보존).
function findAgentsMd(cwd) {
  if (exists(path.join(cwd, 'AGENTS.md'))) return path.join(cwd, 'AGENTS.md');
  try {
    const hit = fs.readdirSync(cwd).find(e => e.toLowerCase() === 'agents.md' && e !== 'AGENTS.md');
    if (hit) return path.join(cwd, hit);
  } catch { /* 디렉터리 읽기 실패 — 없음 취급 */ }
  return null;
}

function syncAgentsSection(cwd, { apply = false } = {}) {
  const action = { rel: 'AGENTS.md', target: cwd, status: 'ok' };
  const block = templateAgentsSection();
  if (!block) return { ...action, status: 'no-template-section' };

  const agentsPath = findAgentsMd(cwd);
  if (!agentsPath) {
    action.status = apply ? 'copied' : 'missing';
    if (apply) fs.copyFileSync(path.join(PKG_ROOT, 'templates', 'AGENTS.md'), path.join(cwd, 'AGENTS.md'));
    return action;
  }

  const text = fs.readFileSync(agentsPath, 'utf8');
  const existing = extractAgentsSection(text);
  if (existing === block) return action; // 최신 — 쓰지 않는다
  if (existing !== null) {
    // 마커 쌍 살아있음 — 블록만 치환(마커 밖 불가침).
    action.status = apply ? 'updated' : 'stale';
    if (apply) {
      fs.writeFileSync(agentsPath, text.slice(0, text.indexOf(AGENTS_SECTION_START)) + block + text.slice(text.indexOf(AGENTS_SECTION_END) + AGENTS_SECTION_END.length));
    }
    return action;
  }
  // 마커 없음 — append 채택(구판 시드·손본 파일 모두).
  action.status = apply ? 'injected' : 'injectable';
  if (apply) {
    const sep = text.endsWith('\n') || text.length === 0 ? '\n' : '\n\n';
    fs.writeFileSync(agentsPath, text + sep + block + '\n');
  }
  return action;
}

function listFilesRecursive(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      files.push(...listFilesRecursive(full, base));
    } else {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

function printSkillSyncReport(actions, cwd) {
  const label = { copied: 'installed', updated: 'updated', stale: 'stale', 'user-modified': 'user-modified', ok: 'ok', missing: 'missing', injected: 'injected', injectable: 'injectable', 'opted-out': 'opted-out', 'no-template-section': 'no-template-section' };
  for (const a of actions) {
    console.log(`  [${label[a.status] || a.status}] ${path.relative(cwd, path.join(a.target, a.rel))}`);
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

// skills/·scripts/·githooks/AGENTS.md 섹션 사본을 마커 규칙대로 동기화한다 — init 본체와
// 자동 갱신(lib/auto-update.js)이 같은 쓰기를 공유한다. 따로 두면 어느 한쪽만 새로워진다.
// config는 hooksPath·agentsMdSection 판정에 필요 — 없으면 여기서 읽는다.
function syncCopies(cwd, { apply = false, config } = {}) {
  const cfg = config || loadConfig(path.join(cwd, 'docs'));
  const out = { skills: [], scripts: [], hooks: [], agents: [], hooksSkipped: null };

  out.skills = syncSkills(
    path.join(PKG_ROOT, 'skills'),
    SKILL_TARGETS.map(t => path.join(cwd, t)),
    { apply }
  );

  const scriptsDest = path.join(cwd, 'scripts');
  if (apply) fs.mkdirSync(scriptsDest, { recursive: true });
  out.scripts = syncMarkedFiles(path.join(PKG_ROOT, 'templates', 'scripts'), [scriptsDest], TEMPLATE_VERSION_RE, { apply });

  if (cfg.hooksPath) {
    out.hooksSkipped = cfg.hooksPath;
  } else {
    const hooksDest = path.join(cwd, 'githooks');
    if (apply) fs.mkdirSync(hooksDest, { recursive: true });
    out.hooks = syncMarkedFiles(path.join(PKG_ROOT, 'templates', 'githooks'), [hooksDest], TEMPLATE_VERSION_RE, { apply });
  }

  // AGENTS.md 관리 섹션 — 같은 쓰기 경로를 탄다(시드 시점 이후의 계약 변화가
  // npm update 후 첫 명령으로 소비 레포에 저절로 전파된다).
  out.agents = cfg.agentsMdSection === false
    ? [{ rel: 'AGENTS.md', target: cwd, status: 'opted-out' }]
    : [syncAgentsSection(cwd, { apply })];
  return out;
}

function init(options = {}) {
  // LLM_WIKI_ROOT는 문서 루트 자체를 가리킨다(doc·docs basename 무관) — 오버라이드가
  // 있으면 그 경로를 그대로 골격 위치로 삼는다. 무시하면 init은 골격을 cwd/docs에
  // 놓고 다른 명령은 오버라이드 루트를 읽어 "kanban이 없다 → init을 실행하라"의
  // 안내 무한루프가 된다(2026-09-09 리뷰 5-2).
  // 레거시 doc/ 레포에서의 init 재실행은 마이그레이션을 먼저 발화시키고 docs/를
  // 상대한다 — 옵트아웃(migrateDocDir:false) 레포만 doc/ 골격을 유지한다.
  let cwd;
  let docDir;
  if (process.env.LLM_WIKI_ROOT) {
    docDir = path.resolve(process.env.LLM_WIKI_ROOT);
    cwd = path.dirname(docDir); // 기존 동작 — 사본(.agents·scripts·githooks)은 레포 루트에 산다
  } else {
    cwd = process.cwd();
    maybeMigrateDocDir(cwd);
    docDir = docLayoutRoot(cwd) || path.join(cwd, 'docs');
  }

  // --check: 아무것도 쓰지 않고 레포 복사본 vs 패키지 정본의 신선함만 보고 (개선계획 1-7).
  if (options.check) {
    console.log(`Checking llm-wiki skills in: ${cwd}\n`);
    const cfg = loadConfig(docDir);
    const actions = syncSkills(path.join(PKG_ROOT, 'skills'), SKILL_TARGETS.map(t => path.join(cwd, t)), { apply: false });
    // 스킬뿐 아니라 훅·스크립트 사본도 같은 마커 규칙으로 점검한다.
    actions.push(...syncMarkedFiles(path.join(PKG_ROOT, 'templates', 'scripts'), [path.join(cwd, 'scripts')], TEMPLATE_VERSION_RE, { apply: false }));
    if (cfg.hooksPath) {
      console.log(`  [declared] hooks → ${cfg.hooksPath} (레포가 정본 경로를 직접 쓴다 — 사본 점검 생략)\n`);
    } else {
      actions.push(...syncMarkedFiles(path.join(PKG_ROOT, 'templates', 'githooks'), [path.join(cwd, 'githooks')], TEMPLATE_VERSION_RE, { apply: false }));
    }
    // AGENTS.md 관리 섹션도 같이 점검한다(injectable = 마커 없는 기존 파일 — 채택 대기).
    if (cfg.agentsMdSection !== false) actions.push(syncAgentsSection(cwd, { apply: false }));
    printSkillSyncReport(actions, cwd);
    console.log('\nLegend:');
    console.log('  stale          — 패키지 정본이 더 새롭다. `llm-wiki init`으로 갱신.');
    console.log('  user-modified  — 버전 마커가 없어 건너뛴 복사본 (사용자 수정 존중, plan.md 6.1).');
    console.log('  missing        — 미설치. `llm-wiki init`으로 설치.');
    console.log('  injectable     — AGENTS.md에 관리 섹션이 없다(구판 시드·손본). 다음 자동 갱신에서 append 채택된다.');
    return;
  }

  console.log(`Initializing llm-wiki in: ${cwd}\n`);

  // 1. docs/ 골격 (레거시 doc/은 docLayoutRoot가 돌려준 docDir 그대로 유지)
  const templatesDoc = path.join(PKG_ROOT, 'templates', 'docs');
  if (exists(path.join(docDir, 'wiki', 'index.md'))) {
    console.log(`✓ ${path.relative(cwd, docDir) || 'docs/'} already exists, skipping scaffold.`);
  } else {
    copyRecursive(templatesDoc, docDir);
    console.log(`✓ Created ${path.basename(docDir)}/ (raw/, wiki/index.md)`);
  }

  // 1b. kanban/ 골격 — 칸반 코어 (개선계획 2단계). 이미 있으면 아무것도 덮지 않는다.
  const kanbanDir = path.join(docDir, 'kanban');
  if (!exists(kanbanDir)) {
    require('./kanban').scaffold(docDir);
    console.log(`✓ Created ${path.basename(docDir)}/kanban/ (board.yml, cards/, done/, superseded/, abandoned/, activity.jsonl)`);
  }

  // 1c. AGENTS.md 시드·섹션 갱신은 아래 syncCopies가 담당한다(2~4와 같은 쓰기 경로 —
  //     시드·채택·섹션 치환 규칙은 syncAgentsSection 주석 참조). 구판 "존재하면 절대
  //     건드리지 않는다" 동작은 2026-11-09 전파 갭 사고로 폐기 — 마커 밖만 불가침.

  // 2~4. skills/·scripts/·githooks/AGENTS.md 사본 동기화 — 마커 규칙(살아있으면 갱신,
  //     지웠으면 사용자 수정본으로 건너뜀)은 syncCopies가 지킨다. init과 자동 갱신이 공유.
  const cfg = loadConfig(docDir);
  const copies = syncCopies(cwd, { apply: true, config: cfg });
  for (const target of SKILL_TARGETS) {
    console.log(`✓ Synced skills/ → ${target}/`);
  }
  printSkillSyncReport(copies.skills, cwd);
  console.log('✓ Synced templates/scripts → scripts/');
  printSkillSyncReport(copies.scripts, cwd);
  if (copies.hooksSkipped) {
    console.log(`✓ hooks: 레포 선언 경로 ${copies.hooksSkipped} 를 그대로 쓴다 (githooks/ 사본 없음).`);
  } else {
    console.log('✓ Synced templates/githooks → githooks/');
    printSkillSyncReport(copies.hooks, cwd);
  }
  const agentsMsg = {
    copied: '✓ Created AGENTS.md (seed — llm-wiki:section 마커 밖은 이 레포의 것)',
    injected: '✓ AGENTS.md에 관리 섹션을 추가했다 (마커 밖 기존 내용 불가침)',
    updated: '✓ AGENTS.md 관리 섹션을 갱신했다 (마커 밖 불가침)',
    'opted-out': '✓ AGENTS.md 관리 섹션: config 옵트아웃 — 갱신하지 않는다',
  };
  const a = copies.agents[0];
  if (agentsMsg[a.status]) console.log(agentsMsg[a.status]);

  // 5. QMD 컬렉션 이름 충돌 검사 (리포 폴더명 기반 기본값이라도, 여러 리포명이 sanitize 후
  // 같은 이름으로 축약되거나 llm-wiki.config.json으로 수동 지정한 이름이 겹칠 수 있음).
  const defaultNames = defaultCollectionNames(docDir);
  warnIfCollectionNameCollides(defaultNames, cwd);

  // 6. git hooks 활성화 안내 (자동 실행 아님 — 사용자 의도 확인)
  console.log('\n--- Next steps ---');
  console.log('1. Enable git hooks (run once):');
  console.log(`   git config core.hooksPath ${cfg.hooksPath || 'githooks'}`);
  console.log('');
  console.log('2. (Optional) Enable semantic search:');
  console.log('   npm i @tobilu/qmd');
  console.log('   # without qmd, llm-wiki search falls back to grep');
  console.log(`   # QMD collection names default to this repo's folder name: "${defaultNames.wiki}" / "${defaultNames.raw}"`);
  console.log('');
  console.log('3. Set project name / collection names / hooks path (optional) — llm-wiki.config.json:');
  console.log('   { "projectName": "my-project", "collections": { "wiki": "my-project-wiki", "raw": "my-project-wiki-raw" },');
  console.log('     "hooksPath": "templates/githooks" }   # githooks/ 사본 대신 정본 경로를 직접 사용');
  console.log('');
  console.log('Done. AI agents will now use wiki-search/log/compile/lint + work-loop/board.');
}

module.exports = { init, syncCopies, syncAgentsSection };
