// @tobilu/qmd CLI 진입점 탐색.
// qmd는 optional dependency이므로 설치 위치가 다양할 수 있다.
//   1. 이 패키지의 node_modules (optionalDependencies로 설치된 경우)
//   2. cwd의 node_modules (타겟 리포가 별도로 npm i @tobilu/qmd 한 경우)
//   3. 글로벌 npm root (npm i -g @tobilu/qmd 한 경우)
//   4. 환경변수 QMD_CLI_PATH (명시적 오버라이드)
//
// 어느 곳에서도 찾지 못하면 null 반환 → 호출측에서 grep fallback으로 강하.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const QMD_CLI_REL = 'dist/cli/qmd.js';

function findQmd() {
  // 1) 환경변수 명시 오버라이드
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

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { findQmd };
