// wiki-search — grep 정확 매칭 + QMD 시맨틱 검색을 항상 병합해 출력한다.
// 원본: TTSTextViewer/.agents/skills/wiki-search/scripts/search.js
// 변경점:
//   - __dirname '../../../../' 4단 종속 제거 → findDocRoot(), findQmd() 사용.
//   - 2026-08-29 (개선계획 0-1): "QMD 성공 시 grep 건너뛰기" 분기 제거. QMD가 유사도로
//     뭐라도 물어오면 정확 문자열 매칭이 묻히는 구조라 색인이 싱싱할수록 재현율이
//     떨어졌다(plan.md 5.1(1)). 시맨틱은 대체재가 아니라 보완재 — 둘 다 항상 돌린다.
//     grep 결과를 먼저 출력한다. 실무 검색어는 에러 메시지 붙여넣기가 대부분이라
//     정확 매칭이 첫 화면에 와야 한다.
//   - 2026-08-29 (개선계획 0-2): grep에 순위를 부여했다. 키워드마다 Set에 합치던 것을
//     파일별 "매칭 키워드 수"로 집계해 내림차순 정렬하고, 파일명만 보여주던 것을
//     매칭된 줄 스니펫과 함께 출력한다 (plan.md 5.1(2)).
//   - 2026-08-29 (개선계획 1-6): 수집(collect)과 렌더(render)를 분리. --json이면
//     {schemaVersion: 1, kind: 'search-results', ...} 봉투로 출력 — 스킬 프롬프트가
//     사람용 출력 문자열에 깨지지 않게 하는 계약.
//   - 2026-09-09 (개선계획 5-1-1): qmd 호출을 execFileSync 인자 배열로 — 검색어의
//     메타문자가 셸로 새는 것을 원천 차단.
//   - 2026-09-09 (개선계획 5-1-6): findstr/grep 외부 호출을 제거하고 프로세스 안
//     라인 스캐너로. findstr은 ACP 의존이라 CP949 머신에서 한국어 검색어가 0건.
const path = require('path');
const fs = require('fs');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { findQmd } = require('./find-qmd');

const MAX_SNIPPETS_PER_FILE = 3;
const MAX_SNIPPET_LENGTH = 200;

function search(query, options = {}) {
  if (!query) {
    console.error('Usage: llm-wiki search "<search keywords>"');
    process.exit(1);
  }

  const docRoot = findDocRoot();
  const wikiPath = path.join(docRoot, 'wiki');
  const rawPath = path.join(docRoot, 'raw');
  const config = loadConfig(docRoot);

  const result = {
    schemaVersion: 1,
    kind: 'search-results',
    query,
    // grep이 정확 매칭의 본체. QMD 여부와 무관하게 항상 채워진다.
    grep: collectGrepResults(query, wikiPath, rawPath),
    semantic: collectQmdResults(query, config),
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }
  renderSearchText(result);
  return result;
}

function collectGrepResults(query, wikiPath, rawPath) {
  // 따옴표는 문서 본문에 잘 안 나오는 캐럭터라 키워드에서 제외(회수율).
  const keywords = query.split(/\s+/)
    .map(k => k.replace(/"/g, ''))
    .filter(k => k.length > 1);
  // 전부 1글자뿐인 극단 쿼리는 원문 하나를 통짜 키워드로.
  if (keywords.length === 0 && query.trim()) keywords.push(query.trim());

  const found = new Map(); // absPath → { keywords: Set, snippets: Map<lineText, true> }
  const searchDirs = [wikiPath, rawPath];

  // 외부 grep/findstr을 쓰지 않는다 — findstr은 코드페이지(ACP) 의존이라 한국어
  // Windows(CP949)에서 UTF-8 문서의 한국어 검색어가 비트 불일치로 조용히 0건이었다
  // (2026-09-09 리뷰 5-1-6). 프로세스 안 라인 스캐너는 인코딩·플랫폼 무관하고
  // 메타문자가 셸로 새는 경로도 원천히 없다. 코퍼스는 doc/ 규모라 속도 문제 없다.
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const filePath of listMarkdownFiles(dir)) {
      let lines;
      try {
        lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
      } catch { continue; }
      for (const line of lines) {
        if (!line.trim()) continue;
        const lower = line.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw.toLowerCase())) {
            if (!found.has(filePath)) found.set(filePath, { keywords: new Set(), snippets: new Map() });
            const entry = found.get(filePath);
            entry.keywords.add(kw);
            const snippet = line.trim();
            if (!entry.snippets.has(snippet)) entry.snippets.set(snippet, true);
          }
        }
      }
    }
  }

  // 정렬: 매칭 키워드 수 내림차순 → 스니펫 수 내림차순(밀도) → 경로명(안정화).
  const files = [...found.entries()]
    .map(([file, v]) => ({
      file: file,
      relativePath: path.relative(process.cwd(), file) || file,
      title: path.basename(file, '.md'),
      matchedKeywords: v.keywords.size,
      totalKeywords: keywords.length,
      snippets: [...v.snippets.keys()],
    }))
    .sort((a, b) =>
      b.matchedKeywords - a.matchedKeywords ||
      b.snippets.length - a.snippets.length ||
      a.file.localeCompare(b.file));

  return { keywords, files };
}

// .md 재귀 수집 — grep -r / findstr /S 대응.
function listMarkdownFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.isDirectory()) out.push(...listMarkdownFiles(abs));
    else if (name.toLowerCase().endsWith('.md')) out.push(abs);
  }
  return out;
}

function collectQmdResults(query, config) {
  const qmdPath = findQmd();
  if (!qmdPath) return { available: false, collections: [] };

  // 두 컬렉션 순회: 컴파일된 wiki + raw 로그.
  const collections = [config.collections.wiki, config.collections.raw];
  const results = [];
  for (const coll of collections) {
    try {
      // 검색어를 셸 문자열에 끼워 넣지 않는다 — 인자 배열은 메타문자를 데이터로만
      // 전달한다(따옴표·$()·백틱 포함 질의가 에러 메시지 붙여넣기의 일상이다).
      const output = execFileSync(process.execPath, [qmdPath, 'search', query, '-c', coll],
        { encoding: 'utf8', timeout: 30000 });
      if (!isQmdEmpty(output)) results.push({ collection: coll, output: output.trim() });
    } catch (error) {
      // collection missing or QMD error for this collection — try next
    }
  }
  return { available: true, collections: results };
}

function renderSearchText(result) {
  const { query, grep, semantic } = result;
  console.log(`Keyword search (grep) for: "${query}"`);

  if (grep.files.length === 0) {
    console.log('No direct matches found.');
  } else {
    console.log(`\nDirect matches (${grep.files.length} file(s), ranked by matched keywords):`);
    for (const f of grep.files) {
      console.log(`- [[${f.title}]] (${f.relativePath}) — matched ${f.matchedKeywords}/${f.totalKeywords} keywords`);
      const shown = f.snippets.slice(0, MAX_SNIPPETS_PER_FILE);
      for (const snippet of shown) {
        console.log(`    │ ${snippet.length > MAX_SNIPPET_LENGTH ? snippet.slice(0, MAX_SNIPPET_LENGTH) + '…' : snippet}`);
      }
      if (f.snippets.length > shown.length) {
        console.log(`    … (${f.snippets.length - shown.length} more matching line(s))`);
      }
    }
  }

  if (!semantic.available) {
    console.log('\n(QMD not found — semantic search skipped. Install @tobilu/qmd to enable.)');
    return;
  }

  console.log(`\nSemantic search via QMD: ${query}`);
  if (semantic.collections.length === 0) {
    console.log('No semantic results.');
    return;
  }
  for (const { collection, output } of semantic.collections) {
    console.log(`\n--- Collection: ${collection} ---`);
    console.log(output);
  }
}

// QMD가 빈 결과를 반환하는지 확인 (에러가 아닌 "No results found." 케이스 감지)
function isQmdEmpty(output) {
  if (!output || !output.trim()) return true;
  return /^no\s+results\s+found\.\s*$/i.test(output.trim());
}

module.exports = { search };
