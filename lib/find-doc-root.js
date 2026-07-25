// cwd 기반 doc/ 루트 자동 탐색.
// llm-wiki는 어느 리포에서 실행되든 동작해야 하므로, 스크립트 자신의 위치(__dirname)
// 에 의존하지 않고 cwd에서 위로 올라가며 `doc/wiki`를 찾는다.
//
// 탐색 우선순위:
//   1. LLM_WIKI_ROOT 환경변수 (명시적 오버라이드)
//   2. cwd에서 위로 올라가며 doc/wiki 디렉토리가 있는 첫 조상
//   3. cwd/doc (init 전이라 없어도 호출 가능하도록 폴백)
const fs = require('fs');
const path = require('path');

function findDocRoot(startDir) {
  // 1) 환경변수 오버라이드
  if (process.env.LLM_WIKI_ROOT) {
    return path.resolve(process.env.LLM_WIKI_ROOT);
  }

  // 2) cwd에서 위로 올라가며 doc/wiki 탐색
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(dir, 'doc', 'wiki');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return path.join(dir, 'doc');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // 파일시스템 루트 도달
    dir = parent;
  }

  // 3) 폴백: cwd/doc (init 전 상태에서도 호출 허용)
  return path.join(process.cwd(), 'doc');
}

// 리포 폴더명을 QMD 컬렉션 이름으로 안전하게 변환.
// 소문자화 + 영숫자 외 문자는 '-'로 치환 + 연속 '-' 축약 + 양끝 '-' 제거.
// 빈 문자열이 되면(폴더명이 특수문자뿐인 극단적 케이스) 'project'로 폴백.
function sanitizeCollectionName(name) {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'project';
}

// docRoot(`<repo>/doc`)에서 리포 폴더명을 뽑아 기본 컬렉션 이름을 만든다.
// ⚠️ 과거에는 'ttswiki'/'ttswiki-raw'로 하드코딩돼 있었다 — "path-agnostic, drop-in for
// any repo"라는 이 도구의 목표와 달리, 두 프로젝트가 기본값 그대로 init하면 전역 QMD 설정
// (~/.config/qmd/index.yml)에서 컬렉션 이름이 충돌해 서로의 로그가 뒤섞여 검색되는 사고가
// 났다(증상이 조용함 — 에러 없이 "0 new"만 찍히고 엉뚱한 프로젝트 결과가 나옴). 리포 폴더명
// 기반으로 기본값을 만들면 충돌 확률이 크게 줄어든다.
function defaultCollectionNames(docRoot) {
  const repoRoot = docRoot ? path.dirname(path.resolve(docRoot)) : process.cwd();
  const base = sanitizeCollectionName(path.basename(repoRoot));
  return { wiki: `${base}-wiki`, raw: `${base}-wiki-raw` };
}

// 설정 파일 로드 (선택). cwd 또는 docRoot의 llm-wiki.config.json.
// 반환: { projectName, collections: { wiki, raw } } 병합 결과 (기본값 포함).
function loadConfig(docRoot) {
  const defaults = {
    projectName: null, // null이면 index.md 헤더에 프로젝트명 생략
    collections: defaultCollectionNames(docRoot),
  };

  const candidates = [
    path.join(process.cwd(), 'llm-wiki.config.json'),
    docRoot ? path.join(docRoot, '..', 'llm-wiki.config.json') : null,
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const user = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
          projectName: user.projectName !== undefined ? user.projectName : defaults.projectName,
          collections: {
            wiki: (user.collections && user.collections.wiki) || defaults.collections.wiki,
            raw: (user.collections && user.collections.raw) || defaults.collections.raw,
          },
        };
      } catch (e) {
        // 깨진 config는 무시하고 기본값 사용 (사용자에게 에러 띄우지 않음)
      }
    }
  }
  return defaults;
}

module.exports = { findDocRoot, loadConfig, sanitizeCollectionName, defaultCollectionNames };
