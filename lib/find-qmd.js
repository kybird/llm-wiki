// @tobilu/qmd CLI 진입점 탐색.
// qmd는 optional dependency이므로 설치 위치가 다양할 수 있다.
//   1. 환경변수 QMD_CLI_PATH (명시적 오버라이드 — 의도적 핀은 이걸로)
//   2. 이 패키지의 node_modules (optionalDependencies로 설치된 경우)
//   3. cwd의 node_modules (타겟 리포가 별도로 npm i @tobilu/qmd 한 경우)
//   4. 글로벌 npm root (npm i -g @tobilu/qmd — auto-update B안이 관리하는 사본)
//
// 여러 곳에 함께 있으면 **package.json 버전이 가장 높은 사본**을 쓴다(2026-11-23).
// 고정 발견 순서(자기 트리 → cwd → 글로벌)였을 때 자기 트리 사구본(2.8.3,
// n-l-c 3.20.0)이 B안이 관리하는 글로벌 신사본(2.9.0, n-l-c 3.22.3)을 가려,
// 채택된 크래시 처방(2026-11-21 adopted)이 해석 단계에서 무력화됐다 — llm-wiki
// search 리랭커 CUDA 크래시 재발(2026-11-23). 늙은 그림자가 새 사본을 이기는
// 방향은 어느 쪽이든 차단한다(역방향: 번들이 더 새면 번들이 이긴다).
// 의도적으로 구버전을 핀하려면 QMD_CLI_PATH로 명시해라.
//
// 어느 곳에서도 찾지 못하면 null 반환 → 호출측에서 grep fallback으로 강하.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { compareVersions } = require('./version-cmp');

const QMD_CLI_REL = 'dist/cli/qmd.js';

// qmd CLI 경로(<pkgRoot>/dist/cli/qmd.js)에서 패키지 버전을 읽는다 — 실패는 null.
function qmdVersionOf(cliPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(cliPath, '..', '..', '..', 'package.json'), 'utf8'));
    return pkg && pkg.version ? String(pkg.version) : null;
  } catch (e) {
    return null; // package.json 부재·파손 — 후보 자체는 유효할 수 있다
  }
}

// 순수 로직(주입 테스트 대상): 존재가 확인된 후보 경로들 중 쓸 것을 고른다.
// 버전을 읽은 후보가 항상 우선하고 그중 최신이 이긴다. 아무도 버전을 못 읽으면
// 발견 순(위 후보 순서)을 따른다 — 확실성이 가용성을 이겨선 안 된다.
function pickQmd(existing) {
  let best = null;
  let bestV = null;
  for (const p of existing) {
    const v = qmdVersionOf(p);
    if (v === null) {
      if (best === null) best = p; // 폴백 후보로 기억 (버전 있는 후보가 나타나면 밀린다)
      continue;
    }
    if (bestV === null || compareVersions(v, bestV) > 0) {
      best = p;
      bestV = v;
    }
  }
  return best;
}

function findQmd() {
  // 1) 환경변수 명시 오버라이드 — 버전 비교 없이 그대로 존중한다.
  if (process.env.QMD_CLI_PATH && fs.existsSync(process.env.QMD_CLI_PATH)) {
    return process.env.QMD_CLI_PATH;
  }

  const candidates = [];

  // 2) 이 패키지 자신의 의존성 트리에서 resolve.
  //    qmd package.json이 exports로 서브패스를 제한하므로 './package.json' 직접 resolve는
  //    ERR_PACKAGE_PATH_NOT_EXPORTED 실패. main 진입점(dist/index.js)을 resolve한 뒤
  //    패키지 루트로 역추적한다 — main은 exports에 노출되어 있으므로 안전.
  try {
    const mainPath = require.resolve('@tobilu/qmd');
    // main은 <pkgRoot>/dist/index.js 형태 → <pkgRoot>를 얻으려 dist/의 부모.
    candidates.push(path.join(path.dirname(path.dirname(mainPath)), QMD_CLI_REL));
  } catch (e) {
    // optional이므로 없을 수 있음 — 정상
  }

  // 3) cwd의 node_modules
  candidates.push(path.join(process.cwd(), 'node_modules/@tobilu/qmd', QMD_CLI_REL));

  // 4) 글로벌 npm root
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    candidates.push(path.join(globalRoot, '@tobilu/qmd', QMD_CLI_REL));
  } catch (e) {
    // npm을 사용할 수 없는 환경
  }

  const existing = candidates.filter((p) => p && fs.existsSync(p));
  if (existing.length === 0) return null;
  return pickQmd(existing);
}

module.exports = { findQmd, pickQmd, qmdVersionOf };
