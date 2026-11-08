// qmd-collections — qmd 컬렉션 등록부 동기화 프리미티브.
// 2026-11-07 사고(카드 "QMD 컬렉션 경로 드리프트 자가치유")의 계통 수정 반출처:
// 지금까지 syncQmd는 collection list에서 *이름 존재만* 보고 등록 *경로*를 검증하지
// 않았다. doc→docs 마이그레이션(수동 git mv 포함) 뒤 전역 등록부(~/.config/qmd)가
// 죽은 구 경로를 가리켜도 "이미 등록됨"으로 건너뛰고 "✓ synced"를 출력했다 —
// 9일간 0건 색인이 성공으로 위장된 조용한 실패.
//
// 원칙: 다른 도구의 설정 파일(index.yml)은 직접 수정하지 않고 qmd CLI 경유만.
// 인터페이스 지도(2026-11-07 실측, qmd 2.8.3): collection list는 이름(qmd:// URI)·
// Pattern·Files·Updated만 노출하고 **경로가 없다** — 경로는 collection show <name>의
// Path: 행에만 있다. Files: 행은 컬렉션별 색인 파일 수다.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// qmd CLI 1회 실행 — wiki-compile의 기존 호출 관습(node <cli.js> …)을 그대로.
// inherit이면 qmd 자체 출력을 그대로 흘리고, 아니면 stdout을 캡처해 반환한다.
function runQmd(qmdCli, args, opts = {}) {
  return execFileSync('node', [qmdCli, ...args], {
    encoding: 'utf8',
    ...(opts.inherit ? { stdio: 'inherit' } : {}),
  });
}

// collection list 출력 → { 이름: { Pattern, Files, Updated } } 블록 파싱.
// 헤더는 "name (qmd://uri)" 한 줄, 속성은 두 칸 들여쓰기 "Key: value" — 둘 다
// 실측 형식. 이름은 공백을 포함할 수 있다(수동 --name 오버라이드, 실측 2026-11-08
// 리뷰) — \S+ 헤더 파싱은 이 이름을 놓쳐 매 compile마다 add를 재시도하는 회귀를
// 낳으므로 " (qmd://" 구분자 기준으로 자른다. 줄 단위 정확 매칭(5-2: 'x-wiki'가
// 'x-wiki-raw' 줄에 걸리는 오판)은 헤더 전체를 짝짓는 이 방식이 계승한다.
function parseCollectionsList(output) {
  const blocks = {};
  let current = null;
  for (const line of String(output).split(/\r?\n/)) {
    const header = line.match(/^(.+?) \(qmd:\/\/(.*)\)$/);
    if (header) {
      current = header[1];
      blocks[current] = {};
      continue;
    }
    const kv = line.match(/^ {2}(\w+):\s+(.*)$/);
    if (kv && current) blocks[current][kv[1]] = kv[2].trim();
  }
  return blocks;
}

// collection show에서 등록 경로 추출 — Path: 행. 실패/미발견이면 null(판정 보류).
function registeredPath(qmdCli, name) {
  let out;
  try {
    out = runQmd(qmdCli, ['collection', 'show', name]);
  } catch {
    return null;
  }
  const m = String(out).match(/^ {2}Path:\s+(\S.*)$/m);
  return m ? m[1].trim() : null;
}

// 두 경로가 같은 위치인가 — resolve로 정규화하고, win32에선 대소문자도 무시.
// 등록부는 역슬래시·정확한 대소문자를 보증하지 않는다(다른 qmd 버전/플랫폼 간).
function samePath(a, b) {
  if (!a || !b) return false;
  const norm = p => {
    let x = path.resolve(p);
    if (process.platform === 'win32') x = x.toLowerCase();
    return x;
  };
  return norm(a) === norm(b);
}

// 컬렉션 업서트 — 미등록이면 add, 등록됐는데 경로가 다르면 remove+add(재등록).
// 이전 이름-only 검사와 달리 드리프트를 스스로 치유한다: 수동 git mv로 docs/로
// 옮겨도 다음 compile index 1회로 등록부가 따라온다.
// 반환: [{ name, action: 'added'|'reregistered'|'unchanged', registeredPath }]
function ensureCollections(qmdCli, collections) {
  const listed = new Set(Object.keys(parseCollectionsList(runQmd(qmdCli, ['collection', 'list']))));
  const results = [];
  for (const { name, path: collPath } of collections) {
    if (!listed.has(name)) {
      console.log(`Creating QMD collection '${name}'...`);
      runQmd(qmdCli, ['collection', 'add', collPath, '--name', name], { inherit: true });
      results.push({ name, action: 'added' });
      continue;
    }
    const reg = registeredPath(qmdCli, name);
    if (reg && !samePath(reg, collPath)) {
      console.log(`QMD collection '${name}'이(가) 구 경로를 가리킨다 — 재등록: ${reg} → ${collPath}`);
      runQmd(qmdCli, ['collection', 'remove', name], { inherit: true });
      runQmd(qmdCli, ['collection', 'add', collPath, '--name', name], { inherit: true });
      results.push({ name, action: 'reregistered', registeredPath: reg });
      continue;
    }
    // 경로를 못 읽었으면(show 실패 등) 근거 없이 뒤집지 않는다 — update·색인 카운트
    // 검증(호출측)이 다른 길로 잡는다.
    results.push({ name, action: 'unchanged', registeredPath: reg });
  }
  return results;
}

// 디렉터리(재귀)에 .md가 하나라도 있는가 — "Files: 0인데 대상엔 파일이 있다"
// 경고의 판정 재료. raw/가 빈 정상 상태(초기 스캐폴드)를 경고로 오인하지 않게 한다.
function dirHasMarkdown(dir) {
  let found = false;
  const walk = d => {
    if (found) return;
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (found) return;
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.toLowerCase().endsWith('.md')) found = true;
    }
  };
  walk(dir);
  return found;
}

module.exports = { runQmd, parseCollectionsList, registeredPath, samePath, ensureCollections, dirHasMarkdown };
