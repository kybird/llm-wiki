// wiki-search — grep 정확 매칭 + QMD 시맨틱 검색을 항상 병합해 출력한다.
// 원본: TTSTextViewer/.agents/skills/wiki-search/scripts/search.js
// 변경점:
//   - __dirname '../../../../' 4단 종속 제거 → findDocRoot(), findQmd() 사용.
//   - findstr(Windows 전용) → process.platform 분기 (win32=findstr, else=grep).
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
const { execSync } = require('child_process');
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
  // 따옴표는 findstr/grep 인용 규칙을 깨므로 키워드에서 제거.
  const keywords = query.split(/\s+/)
    .map(k => k.replace(/"/g, ''))
    .filter(k => k.length > 1);
  // 전부 1글자뿐인 극단 쿼리는 원문 하나를 통짜 키워드로.
  if (keywords.length === 0 && query.trim()) keywords.push(query.trim());

  const found = new Map(); // absPath → { keywords: Set, snippets: Map<lineText, true> }
  const searchDirs = [wikiPath, rawPath];
  const isWindows = process.platform === 'win32';

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const kw of keywords) {
      try {
        let grepCmd;
        if (isWindows) {
          // /C: 통짜 문자열 매칭(정규식 아님) — 에러 메시지의 . : ( 등이 그대로 걸린다.
          // /M(files-only)을 쓰지 않는다 — 매칭 줄 자체가 스니펫이 된다.
          grepCmd = `findstr /S /I /C:"${kw}" "${path.join(dir, '*.md')}"`;
        } else {
          // -F 고정 문자열(정규식 메타문자 무력화), -n 줄번호, -i 대소문자무시
          grepCmd = `grep -rniF --include="*.md" -e "${kw}" "${dir}"`;
        }
        const output = execSync(grepCmd, { encoding: 'utf8' });
        for (const line of output.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const { file, snippet } = splitGrepLine(line);
          if (!file) continue;
          const abs = path.resolve(file);
          if (!found.has(abs)) found.set(abs, { keywords: new Set(), snippets: new Map() });
          const entry = found.get(abs);
          entry.keywords.add(kw);
          if (snippet && !entry.snippets.has(snippet)) entry.snippets.set(snippet, true);
        }
      } catch (e) {
        // findstr/grep returns exit code 1 if no matches
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

function collectQmdResults(query, config) {
  const qmdPath = findQmd();
  if (!qmdPath) return { available: false, collections: [] };

  // 두 컬렉션 순회: 컴파일된 wiki + raw 로그.
  const collections = [config.collections.wiki, config.collections.raw];
  const results = [];
  for (const coll of collections) {
    try {
      const output = execSync(`node "${qmdPath}" search "${query}" -c ${coll}`, { encoding: 'utf8', timeout: 30000 });
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

// findstr/grep 출력 행에서 경로와 매칭 줄을 분리한다.
//   findstr:  <경로>.md:<내용>
//   grep -n:  <경로>.md:<줄번호>:<내용>
// 경계는 첫 `.md:`로 판정 — 윈도우 절대경로의 드라이브 콜론(`D:`)과 충돌을 피한다.
function splitGrepLine(line) {
  const idx = line.indexOf('.md:');
  if (idx === -1) return { file: null, snippet: null };
  const file = line.slice(0, idx + 3);
  const snippet = line.slice(idx + 4).replace(/^\d+:/, ''); // POSIX grep 줄번호 제거
  return { file, snippet: snippet.trim() };
}

module.exports = { search };
