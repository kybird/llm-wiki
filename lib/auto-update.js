// npm 업데이트 자동 반영 (README "Updating").
// 설치된 패키지 버전과 이 레포가 마지막으로 동기화한 버전이 다르면, init과 같은
// 마커 인식 동기화(syncCopies)를 자동으로 돈다 — 사용자는 npm update 만 하면 되고
// 사본(skills/·scripts/·githooks)은 다음 어떤 명령에서든 따라온다.
//
// 버전 스탬프는 사용자 홈(~/.llm-wiki/auto-update/<레포경로해시>.version)에 둔다 —
// 소비 리포의 커밋 트리를 오염시키지 않고, git 없는 디렉터리에서도 동작한다.
// LLM_WIKI_STATE_DIR로 위치를 바꿀 수 있다(테스트 밀폐용).
// 어떤 실패든 조용히 넘어간다 — 갱신 실패가 명령 자체를 막으면 안 된다.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { syncCopies } = require('./init');
const { version: PKG_VERSION } = require('../package.json');

function stateDir() {
  return process.env.LLM_WIKI_STATE_DIR || path.join(os.homedir(), '.llm-wiki');
}

function stampPath(repoRoot) {
  // resolve로 정규화해 해시 — 슬래시/백슬래시 모양 차이가 키를 갈라놓지 않게.
  const key = crypto.createHash('md5').update(path.resolve(repoRoot)).digest('hex').slice(0, 16);
  return path.join(stateDir(), 'auto-update', `${key}.version`);
}

function readStamp(p) {
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return null;
  }
}

// 명령 디스패치 직전에 부른다. docRoot를 (있다면) findDocRoot로 스스로 정한다.
function maybeAutoUpdate() {
  try {
    const docRoot = findDocRoot();
    const root = path.dirname(path.resolve(docRoot));

    // init된 흔적이 없는 디렉터리에서는 아무것도 쓰지 않는다 — 모르는 리포 오염 금지.
    // (findDocRoot의 cwd/doc 폴백이 낯선 디렉터리를 돌려줄 수 있다.)
    const initMark =
      fs.existsSync(path.join(root, 'doc', 'kanban')) ||
      fs.existsSync(path.join(root, 'doc', 'wiki'));
    if (!initMark) return;

    const cfg = loadConfig(path.join(root, 'doc'));
    if (cfg.autoUpdate === false) return; // 옵트아웃 — init 재실행으로만 갱신
    if (process.env.LLM_WIKI_NO_AUTO_UPDATE === '1') return; // 일회성 끄기

    // 기계의 프로젝트 등록부 — monitor --all(플릿)이 이 머신의 보드들을 아는
    // 길이다. 버전 동기화와 무관하게 매번 갱신한다(마지막 본 시각 포함).
    recordProject(docRoot, cfg);

    const sp = stampPath(root);
    if (readStamp(sp) === PKG_VERSION) return; // 이 버전으로 이미 동기화됨

    const copies = syncCopies(root, { apply: true, config: cfg });
    const actions = [...copies.skills, ...copies.scripts, ...copies.hooks];
    const changed = actions.filter(a => a.status === 'updated' || a.status === 'copied');
    const userModified = actions.filter(a => a.status === 'user-modified').length;

    fs.mkdirSync(path.dirname(sp), { recursive: true });
    fs.writeFileSync(sp, PKG_VERSION);

    // 조용한 no-op 금지(계약): 뭘 바꿨는지 한 줄로 말한다. 바뀐 게 없으면 침묵.
    if (changed.length > 0) {
      const updated = changed.filter(a => a.status === 'updated').length;
      const copied = changed.length - updated;
      const skipped = userModified > 0 ? ` · 사용자 수정본 건너뜀 ${userModified}` : '';
      console.log(
        `llm-wiki v${PKG_VERSION}: npm 업데이트 자동 반영 — 사본 갱신 updated ${updated} · copied ${copied}${skipped}` +
        ` (상세: llm-wiki init --check)`
      );
    }
  } catch {
    // 자동 갱신은 부가 기능이다 — 어떤 실패든 명령을 막지 않는다.
  }
}

// ── 기계의 프로젝트 등록부 (monitor --all 플릿의 발견 소스) ─────────────────
// <stateDir>/projects.json — { "<리포 절대경로>": { name, docRoot, lastSeen } }.
// 능동 명령(maybeAutoUpdate)과 monitor 시작이 매번 갱신한다. 플릿은 파일이
// 정본인 보드들을 직접 읽으므로, 이 등록부는 "어떤 프로젝트가 이 머신에 사나"의
// 유일한 목록이다 — 스탬프 해시는 경로를 못 되돌려서 이 용도로 못 쓴다.
function registryPath() {
  return path.join(stateDir(), 'projects.json');
}

function recordProject(docRoot, cfg) {
  try {
    const root = path.dirname(path.resolve(docRoot));
    const name = (cfg && cfg.projectName) || path.basename(root);
    let data = {};
    try { data = JSON.parse(fs.readFileSync(registryPath(), 'utf8')); } catch { /* 없음 — 첫 등록 */ }
    data[root] = { name, docRoot: path.resolve(docRoot), lastSeen: new Date().toISOString() };
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(registryPath(), JSON.stringify(data, null, 2) + '\n');
  } catch {
    // 등록부는 부가 기능이다 — 실패가 명령을 막지 않는다(maybeAutoUpdate와 같은 규칙).
  }
}

function readProjects() {
  try {
    const data = JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
    return Object.values(data)
      .filter(p => p && p.docRoot && fs.existsSync(path.join(p.docRoot, 'kanban')))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch {
    return [];
  }
}

module.exports = { maybeAutoUpdate, stampPath, recordProject, readProjects };
