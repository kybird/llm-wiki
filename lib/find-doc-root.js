// doc/ 루트 자동 탐색.
// llm-wiki는 어느 리포에서 실행되든 동작해야 하므로, 스크립트 자신의 위치(__dirname)
// 에 의존하지 않는다. 보드(카드·클레임·활동 로그)는 프로젝트 자원이지 브랜치 자원이
// 아니므로 git 링크 워크트리에서 실행돼도 주 워크트리의 doc/을 향한다(2026-09-12
// sugarScan 실측 — 워크트리마다 보드가 갈라져 폐기 카드가 부 워크트리에서 되살아났다).
//
// 탐색 우선순위:
//   1. LLM_WIKI_ROOT 환경변수 (명시적 오버라이드 — git을 부르지 않는다)
//   2. git 저장소면 주 워크트리의 doc/ (doc/wiki가 있을 때; LLM_WIKI_WORKTREE_LOCAL=1로 끈다)
//   3. cwd에서 위로 올라가며 doc/wiki 디렉토리가 있는 첫 조상 (git 아닌 곳 폴백)
//   4. cwd/doc (init 전이라 없어도 호출 가능하도록 폴백)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 2단계 탐색 결과 캐시 — findDocRoot는 명령마다 여러 번 불리므로 git 자식 프로세스는
// 시작 디렉터리당 프로세스에서 한 번만 돌린다 (value가 null이어도 캐시한다).
let primaryWorktreeDocCache = { startDir: null, doc: null };

function gitOutput(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
    if (r.error || r.status !== 0) return null; // git 없음·저장소 아님·타임아웃
    return (r.stdout || '').trim() || null;
  } catch {
    return null;
  }
}

// 주 워크트리의 doc/ 경로. 못 찾으면(비저장소, init 전, git 실패) null → 상위 탐색으로.
function primaryWorktreeDoc(startDir) {
  const key = path.resolve(startDir);
  if (primaryWorktreeDocCache.startDir === key) return primaryWorktreeDocCache.doc;
  let doc = null;
  // --path-format=absolute는 git 2.31+ 옵션이다 — 실패하면 옛 git으로 한 번 더.
  let commonDir = gitOutput(['rev-parse', '--path-format=absolute', '--git-common-dir'], key);
  if (!commonDir) {
    commonDir = gitOutput(['rev-parse', '--git-common-dir'], key);
  }
  if (commonDir) {
    // 상대 경로로 나오면 cwd 기준으로 절대화. dirname(<주 워크트리>/.git) = 저장소 루트.
    const primaryRoot = path.dirname(path.resolve(key, commonDir));
    const wiki = path.join(primaryRoot, 'doc', 'wiki');
    try {
      if (fs.statSync(wiki).isDirectory()) doc = path.join(primaryRoot, 'doc');
    } catch {
      // 주 워크트리에 doc/wiki 없음 = init 전 — 조용히 상위 탐색으로
    }
  }
  primaryWorktreeDocCache = { startDir: key, doc };
  return doc;
}

function findDocRoot(startDir) {
  // 1) 환경변수 오버라이드
  if (process.env.LLM_WIKI_ROOT) {
    return path.resolve(process.env.LLM_WIKI_ROOT);
  }

  const start = startDir || process.cwd();

  // 2) 주 워크트리의 doc/ — 링크 워크트리의 브랜치 사본이 아니라 프로젝트 정본.
  //    LLM_WIKI_WORKTREE_LOCAL=1이면 종전 동작(cwd 기준)으로 되돌린다.
  if (process.env.LLM_WIKI_WORKTREE_LOCAL !== '1') {
    const primaryDoc = primaryWorktreeDoc(start);
    if (primaryDoc) return primaryDoc;
  }

  // 3) cwd에서 위로 올라가며 doc/wiki 탐색
  let dir = path.resolve(start);
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(dir, 'doc', 'wiki');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return path.join(dir, 'doc');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // 파일시스템 루트 도달
    dir = parent;
  }

  // 4) 폴백: cwd/doc (init 전 상태에서도 호출 허용)
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
// 반환: { projectName, collections: { wiki, raw }, hooksPath } 병합 결과 (기본값 포함).
// hooksPath: 설정하면 init이 githooks/ 사본을 만들지 않고 그 경로를 그대로 쓴다
// (레포가 templates/ 등 정본을 직접 참조하는 경우 — drift 원천 제거).
function loadConfig(docRoot) {
  const defaults = {
    projectName: null, // null이면 index.md 헤더에 프로젝트명 생략
    collections: defaultCollectionNames(docRoot),
    hooksPath: null,
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
          hooksPath: user.hooksPath !== undefined ? user.hooksPath : defaults.hooksPath,
        };
      } catch (e) {
        // 깨진 config는 무시하고 기본값 사용 (사용자에게 에러 띄우지 않음)
      }
    }
  }
  return defaults;
}

module.exports = { findDocRoot, loadConfig, sanitizeCollectionName, defaultCollectionNames };
