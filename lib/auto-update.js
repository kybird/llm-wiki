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
const { execSync } = require('child_process');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { syncCopies } = require('./init');
const { findQmd } = require('./find-qmd');
// compareVersions는 lib/version-cmp.js로 추출(2026-11-23) — find-qmd와 공유.
// 아래 module.exports에서 그대로 재수출한다(기존 require 경로 호환).
const { compareVersions } = require('./version-cmp');
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
// deps.checkSelfSkew — 테스트 주입점(네트워크 없이 배선을 검증한다). 생략하면 진짜 확인.
function maybeAutoUpdate(deps = {}) {
  try {
    const docRoot = findDocRoot();
    const root = path.dirname(path.resolve(docRoot));

    // init된 흔적이 없는 디렉터리에서는 아무것도 쓰지 않는다 — 모르는 리포 오염 금지.
    // (findDocRoot의 cwd/docs 폴백이 낯선 디렉터리를 돌려줄 수 있다.)
    // docs/가 정본, doc/은 레거시(마이그레이션 전·옵트아웃) — 양쪽 다 흔적으로 인정.
    const initMark =
      fs.existsSync(path.join(root, 'docs', 'kanban')) ||
      fs.existsSync(path.join(root, 'docs', 'wiki')) ||
      fs.existsSync(path.join(root, 'doc', 'kanban')) ||
      fs.existsSync(path.join(root, 'doc', 'wiki'));
    if (!initMark) return;

    const cfg = loadConfig(docRoot); // 설정 파일은 레포 루트 — 레이아웃 무관
    if (cfg.autoUpdate === false) return; // 옵트아웃 — init 재실행으로만 갱신
    if (process.env.LLM_WIKI_NO_AUTO_UPDATE === '1') return; // 일회성 끄기

    // 기계의 프로젝트 등록부 — monitor --all(플릿)이 이 머신의 보드들을 아는
    // 길이다. 버전 동기화와 무관하게 매번 갱신한다(마지막 본 시각 포함).
    recordProject(docRoot, cfg);

    // 자기 스큐 힌트(기계 단위·하루 1회) — 레포 스탬프 조기 반환보다 앞에 둔다: 스큐가
    // 있는 정상 상태(스탬프 == 실행 버전)가 정작 이 힌트가 필요한 상태다.
    const skew = (deps.checkSelfSkew || checkSelfSkew)();
    if (skew && skew.to) {
      console.log(
        `  ⚠ llm-wiki 스큐 — 실행 v${skew.from}, npm 최신 v${skew.to}. ` +
        `갱신은 사용자 터미널에서(기계 전역 변경 — 에이전트가 대신 실행하지 않는다): npm update -g @kybird/llm-wiki`
      );
    }

    const sp = stampPath(root);
    if (readStamp(sp) === PKG_VERSION) return; // 이 버전으로 이미 동기화됨

    const copies = syncCopies(root, { apply: true, config: cfg });
    const actions = [...copies.skills, ...copies.scripts, ...copies.hooks, ...copies.agents];
    const changed = actions.filter(a => a.status === 'updated' || a.status === 'copied' || a.status === 'injected');
    const userModified = actions.filter(a => a.status === 'user-modified').length;
    const diverged = actions.filter(a => a.status === 'diverged');

    fs.mkdirSync(path.dirname(sp), { recursive: true });
    fs.writeFileSync(sp, PKG_VERSION);

    // qmd 동반 갱신(기계 단위) — 미설치·최신·이번 버전 처리 완료면 조용히 지나간다.
    // 실패는 경고 한 줄로 끝내되 기계 스탬프를 찍지 않아 다음 레포·명령에서 재시도한다.
    const qmd = syncQmd();
    if (qmd && qmd.to) {
      console.log(`  · qmd ${qmd.from} → ${qmd.to} 갱신(npm i -g 동반 — win32 CUDA 리랭커 크래시 예방)`);
    }
    if (qmd && qmd.error) {
      console.log(`  ⚠ qmd 동반 갱신 실패(${qmd.error}) — 다음 기회 재시도. 수동: npm i -g @tobilu/qmd@latest`);
    }

    // 조용한 no-op 금지(계약): 뭘 바꿨는지 한 줄로 말한다. 바뀐 게 없으면 침묵.
    if (changed.length > 0) {
      const updated = changed.filter(a => a.status === 'updated').length;
      const injected = changed.filter(a => a.status === 'injected').length;
      const copied = changed.length - updated - injected;
      const agentsNote = injected > 0 ? ` · AGENTS.md 섹션 주입 ${injected}` : '';
      const skipped = userModified > 0 ? ` · 사용자 수정본 건너뜀 ${userModified}` : '';
      const divergedNote = diverged.length > 0 ? ` · 버전 분기 건너뜀 ${diverged.length}` : '';
      console.log(
        `llm-wiki v${PKG_VERSION}: npm 업데이트 자동 반영 — 사본 갱신 updated ${updated} · copied ${copied}${agentsNote}${skipped}${divergedNote}` +
        ` (상세: llm-wiki init --check)`
      );
    }
    // 분기는 바꾼 게 없어도 침묵하면 안 된다 — 되돌림 사고의 후보 알림이다.
    if (diverged.length > 0) {
      const rels = [...new Set(diverged.map(a => a.rel))];
      console.log(
        `  ⚠ 버전 분기(같은 버전 번호·내용 상이, 로컬 진화 의심 — 덮지 않았음): ${rels.join(', ')} — llm-wiki init --check`
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

// ── qmd 동반 갱신 (2026-11-21, 사용자 결정 B안) ─────────────────────────────
// llm-wiki 업데이트의 자동 반영 패스가 설치된 qmd도 최신으로 끌어올린다. qmd의
// 상위 호환 업데이트가 win32 CUDA 리랭커 공존 크래시(2.9.0에서 수리) 같은 결함
// 수리를 실을 때, 각 머신이 수동 npm i -g를 기억해야 하는 전파 구멍을 닫는다.
//   - 미설치면 설치하지 않는다(선택 의존성 계약 유지).
//   - 기계 단위 스탬프(<stateDir>/auto-update/qmd.version)로 이 llm-wiki 버전에서
//     이미 처리했으면 스킵 — 첫 명령을 친 레포 하나만 npm을 돌린다.
//   - 실패(npm 부재·네트워크·권한)는 경고만 하고 스탬프를 찍지 않는다 → 재시도.
//   - LLM_WIKI_STATE_DIR 격리(테스트 밀폐) 중엔 기계 전역 부작용도 격리된다.
function qmdStampPath() {
  return path.join(stateDir(), 'auto-update', 'qmd.version');
}

// qmd CLI 진입점 경로에서 @tobilu/qmd 패키지 루트를 찾는다(package.json 이름 확인).
function qmdPackageRoot(qmdPath) {
  let dir = path.resolve(path.dirname(qmdPath));
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@tobilu/qmd') return { dir, version: String(pkg.version || '0') };
    } catch { /* 상향 계속 */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// 순수 로직(주입 테스트 대상): {qmdPkg, latestFn, installFn, stampRead, stampWrite}
function syncQmdCore(o) {
  if (o.stampRead() === PKG_VERSION) return null; // 이 llm-wiki 버전에서 이미 처리
  if (!o.qmdPkg) return null; // 미설치 — 설치하지 않는다
  let latest;
  try {
    latest = String(o.latestFn()).trim().split(/\r?\n/).filter(Boolean).pop();
  } catch (e) {
    return { error: `npm view 실패: ${String(e && e.message || e).slice(0, 80)}` };
  }
  if (!/^\d+\.\d+/.test(latest || '')) {
    return { error: `레지스트리 응답 해석 불가: ${String(latest).slice(0, 40)}` };
  }
  if (compareVersions(o.qmdPkg.version, latest) >= 0) {
    o.stampWrite(PKG_VERSION); // 최신 확인도 처리 완료 — 이번 버전은 다시 묻지 않는다
    return null;
  }
  const from = o.qmdPkg.version;
  o.installFn(latest); // throw 시 아래 catch — 스탬프 미기입으로 재시도 보장
  o.stampWrite(PKG_VERSION);
  return { from, to: latest };
}

// 실제 결합부 — npm 호출과 기계 스탬프. maybeAutoUpdate의 버전 불일치 패스에서만
// 불리므로(레포당 llm-wiki 버전당 1회) 네트워크 비용이 매 명령에 붙지 않는다.
function syncQmd() {
  if (process.env.LLM_WIKI_STATE_DIR) return null; // 테스트 밀폐 = 전역 부작용 밀폐
  try {
    return syncQmdCore({
      qmdPkg: qmdPackageRoot(findQmd() || ''),
      latestFn: () => execSync('npm view @tobilu/qmd version', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 20000,
      }),
      installFn: (latest) => execSync(`npm i -g @tobilu/qmd@${latest}`, {
        stdio: 'ignore', timeout: 300000,
      }),
      stampRead: () => readStamp(qmdStampPath()),
      stampWrite: (v) => {
        fs.mkdirSync(path.dirname(qmdStampPath()), { recursive: true });
        fs.writeFileSync(qmdStampPath(), v);
      },
    });
  } catch (e) {
    return { error: String(e && e.message || e).slice(0, 80) };
  }
}

// ── 자기 스큐 힌트 (2026-11-23) ─────────────────────────────────────────────
// 자동 반영 패스는 사본과 qmd를 끌어올리지만 llm-wiki 명령 자신은 못 바꾼다 — 한 기계가
// 다른 기계가 출시한 수리를 모른 채 낡은 CLI로 계속 일한다(낡은 CLI는 실패하지 않고
// 자기 이전 계약을 조용히 건너뛴다). 실행 버전과 npm 최신을 비교해 최신이 앞서면
// 한 줄만 말한다. 설치는 하지 않는다 — 기계 전역 변경은 사용자 터미널의 몫.
//   - 레포 스탬프 조기 반환 앞에서 돈다: 스큐가 있는 정상 상태(스탬프 == 실행 버전)가
//     정작 이 힌트가 필요한 상태라, 패스 안에 두면 그때 조용해진다.
//   - 주기는 기계 단위 시간 스탬프(<stateDir>/auto-update/self-skew.checked) — 하루 1회.
//   - 스탬프를 네트워크 호출 앞에 찍는다(qmd와 반대): 실패에 스탬프를 안 찍으면 오프라인
//     머신이 매 명령 타임아웃을 기다린다. 힌트는 하루 늦어도 되는 물건이다.
//   - 실패는 조용히 — 힌트 자체의 실패를 경고하면 그게 소음이 된다.
//   - 못 잡는 것: 정본 레포가 출시보다 앞선 스큐 — 레지스트리도 같은 버전이라 비교가
//     조용하다(2026-11-07 전역 0.6.0 사고, 2026-11-23 lint 거짓 무사).
const SELF_SKEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

function selfSkewStampPath() {
  return path.join(stateDir(), 'auto-update', 'self-skew.checked');
}

// 순수 로직(주입 테스트 대상): {pkgVersion, latestFn, stampRead, stampWrite, nowFn, intervalMs}
function selfSkewCore(o) {
  const last = Number(o.stampRead());
  const now = o.nowFn();
  // 시계가 거꾸로 간 스탬프(음수)는 못 믿는다 — 이번에 다시 본다.
  if (Number.isFinite(last) && now - last >= 0 && now - last < o.intervalMs) return null;
  o.stampWrite(String(now)); // throw 시 그 예외가 올라가 네트워크 호출을 막는다
  let latest;
  try {
    latest = String(o.latestFn()).trim().split(/\r?\n/).filter(Boolean).pop();
  } catch (e) {
    return { error: `npm view 실패: ${String(e && e.message || e).slice(0, 80)}` };
  }
  if (!/^\d+\.\d+/.test(latest || '')) {
    return { error: `레지스트리 응답 해석 불가: ${String(latest).slice(0, 40)}` };
  }
  if (compareVersions(o.pkgVersion, latest) >= 0) return null;
  return { from: o.pkgVersion, to: latest };
}

// 실제 결합부 — npm 호출과 기계 스탬프. 실패는 전부 null(조용).
function checkSelfSkew() {
  if (process.env.LLM_WIKI_STATE_DIR) return null; // 테스트 밀폐 = 네트워크·전역 부작용 밀폐
  try {
    return selfSkewCore({
      pkgVersion: PKG_VERSION,
      latestFn: () => execSync('npm view @kybird/llm-wiki version', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000,
      }),
      stampRead: () => readStamp(selfSkewStampPath()),
      stampWrite: (v) => {
        fs.mkdirSync(path.dirname(selfSkewStampPath()), { recursive: true });
        fs.writeFileSync(selfSkewStampPath(), v);
      },
      nowFn: Date.now,
      intervalMs: SELF_SKEW_INTERVAL_MS,
    });
  } catch {
    // 스탬프를 못 쓰면(읽기 전용 홈 등) 네트워크도 부르지 않는다 — 매 명령 호출 방지.
    return null;
  }
}

module.exports = {
  maybeAutoUpdate, stampPath, recordProject, readProjects,
  syncQmdCore, compareVersions, qmdPackageRoot, qmdStampPath,
  selfSkewCore, checkSelfSkew, selfSkewStampPath, SELF_SKEW_INTERVAL_MS,
};
