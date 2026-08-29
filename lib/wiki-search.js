// wiki-search — grep 정확 매칭 + QMD 시맨틱 검색을 항상 병합해 출력한다.
// 원본: TTSTextViewer/.agents/skills/wiki-search/scripts/search.js
// 변경점:
//   - __dirname '../../../../' 4단 종속 제거 → findDocRoot(), findQmd() 사용.
//   - findstr(Windows 전용) → process.platform 분기 (win32=findstr, else=grep).
//   - 2026-08-29 (개선계획 0-1): "QMD 성공 시 grep 건너뜀" 분기 제거. QMD가 유사도로
//     뭐라도 물어오면 정확 문자열 매칭이 묻히는 구조라 색인이 싱싱할수록 재현율이
//     떨어졌다(plan.md 5.1(1)). 시맨틱은 대체재가 아니라 보완재 — 둘 다 항상 돌린다.
//     grep 결과를 먼저 출력한다. 실무 검색어는 에러 메시지 붙여넣기가 대부분이라
//     정확 매칭이 첫 화면에 와야 한다.
//   - 2026-08-29 (개선계획 0-2): grep에 순위를 부여했다. 키워드마다 Set에 합치던 것을
//     파일별 "매칭 키워드 수"로 집계해 내림차순 정렬하고, 파일명만 보여주던 것을
//     매칭된 줄 스니펫과 함께 출력한다 (plan.md 5.1(2)).
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { findQmd } = require('./find-qmd');

const MAX_SNIPPETS_PER_FILE = 3;
const MAX_SNIPPET_LENGTH = 200;

function search(query) {
  if (!query) {
    console.error('Usage: llm-wiki search "<search keywords>"');
    process.exit(1);
  }

  const docRoot = findDocRoot();
  const wikiPath = path.join(docRoot, 'wiki');
  const rawPath = path.join(docRoot, 'raw');
  const config = loadConfig(docRoot);

  // 1) grep 정확 매칭 — QMD 설치·성공 여부와 무관하게 항상 실행.
  performGrepSearch(query, wikiPath, rawPath);

  // 2) QMD 시맨틱 — 있으면 이 역시 항상 실행. 표현이 다른 문서를 잡아주는 보완재.
  const qmdPath = findQmd();
  if (!qmdPath) {
    console.log('\n(QMD not found — semantic search skipped. Install @tobilu/qmd to enable.)');
    return;
  }

  console.log(`\nSemantic search via QMD: ${query}`);
  let qmdHit = false;
  // 두 컬렉션 순회: 컴파일된 wiki + raw 로그.
  const collections = [config.collections.wiki, config.collections.raw];

  for (const coll of collections) {
    try {
      const output = execSync(`node "${qmdPath}" search "${query}" -c ${coll}`, { encoding: 'utf8', timeout: 30000 });
      if (!isQmdEmpty(output)) {
        qmdHit = true;
        console.log(`\n--- Collection: ${coll} ---`);
        console.log(output);
      }
    } catch (error) {
      // collection missing or QMD error for this collection — try next
    }
  }

  if (!qmdHit) {
    console.log('No semantic results.');
  }
}

// QMD가 빈 결과를 반환하는지 확인 (에러가 아닌 "No results found." 케이스 감지)
function isQmdEmpty(output) {
  if (!output || !output.trim()) return true;
  return /^no\s+results\s+found\.\s*$/i.test(output.trim());
}

function performGrepSearch(query, wikiPath, rawPath) {
  console.log(`Keyword search (grep) for: "${query}"`);
  try {
    // 따옴표는 findstr/grep 인용 규칙을 깨므로 키워드에서 제거.
    const keywords = query.split(/\s+/)
      .map(k => k.replace(/"/g, ''))
      .filter(k => k.length > 1);
    // 전부 1글자뿐인 극단 쿼리는 원문 하나를 통짜 키워드로.
    if (keywords.length === 0 && query.trim()) keywords.push(query.trim());

    // 파일별 집계: 매칭된 키워드 집합(순위 기준) + 매칭 줄 스니펫(중복 제거, 삽입 순서 유지).
    const files = new Map(); // absPath → { keywords: Set, snippets: Map<lineText, true> }
    const searchDirs = [
      { dir: wikiPath, label: 'wiki' },
      { dir: rawPath, label: 'raw' },
    ];

    const isWindows = process.platform === 'win32';

    for (const { dir } of searchDirs) {
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
            if (!files.has(abs)) files.set(abs, { keywords: new Set(), snippets: new Map() });
            const entry = files.get(abs);
            entry.keywords.add(kw);
            if (snippet && !entry.snippets.has(snippet)) entry.snippets.set(snippet, true);
          }
        } catch (e) {
          // findstr/grep returns exit code 1 if no matches
        }
      }
    }

    if (files.size === 0) {
      console.log('No direct matches found.');
      return;
    }

    // 정렬: 매칭 키워드 수 내림차순 → 스니펫 수 내림차순(밀도) → 경로명(안정화).
    const ranked = [...files.entries()]
      .map(([file, v]) => ({ file, kwCount: v.keywords.size, snippetCount: v.snippets.size, v }))
      .sort((a, b) =>
        b.kwCount - a.kwCount ||
        b.snippetCount - a.snippetCount ||
        a.file.localeCompare(b.file));

    console.log(`\nDirect matches (${ranked.length} file(s), ranked by matched keywords):`);
    for (const { file, kwCount, v } of ranked) {
      const relativePath = path.relative(process.cwd(), file) || file;
      console.log(`- [[${path.basename(file, '.md')}]] (${relativePath}) — matched ${kwCount}/${keywords.length} keywords`);
      let shown = 0;
      for (const snippet of v.snippets.keys()) {
        if (shown >= MAX_SNIPPETS_PER_FILE) {
          console.log(`    … (${v.snippets.size - shown} more matching line(s))`);
          break;
        }
        console.log(`    │ ${snippet.length > MAX_SNIPPET_LENGTH ? snippet.slice(0, MAX_SNIPPET_LENGTH) + '…' : snippet}`);
        shown++;
      }
    }
  } catch (error) {
    console.error('Keyword search failed:', error.message);
  }
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
