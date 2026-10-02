// migrate-doc-dir — doc/ → docs/ 1회 자동 마이그레이션 (0.6.0 레이아웃 전환).
// 트리거는 bin 진입점이 걸러준다 — auto-update와 같은 목록(search·compile·lint·skills·
// board·card·pick…resume). 제외 사유도 같다: wait·monitor는 stdout 첫 줄이 계약(이벤트
// 한 줄·URL)이고 init은 자체 동기화 흐름이 있다(init은 docs/ 스캐폴드로 자체 전환).
//
// 판정 신호는 find-doc-root.docLayoutRoot와 동일 — doc/wiki가 있는 레거시 루트만 옮긴다.
// init 흔적이 없는 일반 doc/·docs/ 폴더는 건드리지 않는다. 마커 파일이 없어도 1회성이
// 보장되는 이유: 이동 성공 자체가 완료 상태(docs/wiki가 생김)라 다음 명령의 판정이 바뀐다.
//
// 옵트아웃: llm-wiki.config.json { "migrateDocDir": false } — 그 레포는 레거시 doc/
// 폴백으로 계속 동작한다. 출력 없음 — 명시적 선택에 잔소리를 붙이지 않는다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { docLayoutRoot, primaryWorktreeRoot, loadConfig, defaultCollectionNames } = require('./find-doc-root');

// 마이그레이션 대상 레거시 루트(<root>/doc)를 찾는다. 없으면 null.
// findDocRoot의 선허다(주 워크트리 → 상위 탐색) — 링크 워크트리에서 실행돼도
// 정본이 사는 주 워크트리의 doc/을 옮긴다.
function findLegacyDocRoot(startDir) {
  if (process.env.LLM_WIKI_ROOT) return null; // 명시 오버라이드 존중 — 지정한 위치를 함부로 옮기지 않는다
  const start = startDir || process.cwd();
  const dirs = [];
  if (process.env.LLM_WIKI_WORKTREE_LOCAL !== '1') {
    const primary = primaryWorktreeRoot(start);
    if (primary) dirs.push(primary);
  }
  let dir = path.resolve(start);
  for (let i = 0; i < 20; i++) {
    dirs.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const d of dirs) {
    const found = docLayoutRoot(d);
    if (found) return path.basename(found) === 'doc' ? found : null; // docs면 이미 전환된 레포
  }
  return null;
}

// qmd 전역 설정에 구 경로가 남아 있으면 한 줄 안내. 이름은 그대로라 syncQmd가
// "이미 등록됨"으로 건너뛰고 경로만 썩는다(조용한 실패) — 그래서 문자열 검사로라도
// 말해줘야 한다. index.yml 직접 수정은 하지 않는다(다른 도구의 설정 파일이다).
function hintQmdIfStale(root) {
  const qmdDir = process.env.QMD_CONFIG_DIR
    || (process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, 'qmd') : null)
    || path.join(os.homedir(), '.config', 'qmd');
  const indexPath = path.join(qmdDir, 'index.yml');
  let text;
  try {
    text = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return; // qmd 미사용 — 안내 불요
  }
  const norm = String(root).replace(/\\/g, '/');
  if (!text.includes(`${norm}/doc/`) && !text.includes(String(root))) return;
  const names = defaultCollectionNames(path.join(root, 'doc'));
  console.log(`  qmd 컬렉션에 구 경로가 남아 있다 — qmd collection remove ${names.wiki} ${names.raw} 후 llm-wiki compile index로 재등록하라.`);
}

// 진입점에서 호출한다. 실패해도 절대 명령을 죽이지 않는다 — 연기하고 다음 명령이 재시도.
function maybeMigrateDocDir(startDir) {
  let legacy;
  try {
    legacy = findLegacyDocRoot(startDir);
  } catch {
    return; // 판정 자체가 실패하면 이번 명령은 모른 체한다
  }
  if (!legacy) return;
  const root = path.dirname(legacy);
  const cfg = loadConfig(legacy); // <root>/llm-wiki.config.json + cwd의 것
  if (cfg.migrateDocDir === false) return;

  const target = path.join(root, 'docs');
  const isGit = fs.existsSync(path.join(root, '.git'));
  try {
    if (fs.existsSync(target)) {
      // 관련 없는 docs/ 폴더가 이미 있는 레포 — 덮어쓰지 않고 사람에게 맡긴다.
      // 조용히 포기하면 영영 전환 안 되니 이것만은 매번 한 줄로 말한다.
      console.log('⚠ doc→docs 마이그레이션 보류 — docs/가 이미 있다. 수동으로 옮긴 뒤 doc/을 지우거나 llm-wiki.config.json에 "migrateDocDir": false를 두어라.');
      return;
    }
    let staged = false;
    if (isGit) {
      // git mv — 디렉토리 rename + tracked 파일 rename 스테이징. untracked(raw 로그 등)도 함께 이동한다.
      // doc/이 전부 untracked(커밋 전 init 직후)면 git mv가 실패한다 → 아래 rename 폴백.
      const r = spawnSync('git', ['mv', '--', 'doc', 'docs'], { cwd: root, encoding: 'utf8' });
      staged = r.status === 0;
    }
    if (!staged) fs.renameSync(legacy, target);
    console.log(`[doc → docs] 레이아웃 전환 완료${staged ? ' (git rename 스테이징 포함 — 커밋은 사용자 몫)' : ''}${isGit ? '' : ' (git 없는 폴더 — 파일시스템 rename)'}`);
    hintQmdIfStale(root);
  } catch (e) {
    // Windows: 모니터·에디터가 doc/을 열어두면 EPERM/EBUSY — 연기한다. 명령을 막지 않는다.
    console.log(`⚠ doc→docs 마이그레이션 연기 — ${e.message} (다음 명령에서 재시도)`);
  }
}

module.exports = { maybeMigrateDocDir, findLegacyDocRoot };
