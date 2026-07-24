// wiki-search — qmd semantic search 우선, 실패 시 크로스플랫폼 grep fallback.
// 원본: TTSTextViewer/.agents/skills/wiki-search/scripts/search.js
// 변경점: __dirname '../../../../' 4단 종속 제거 → findDocRoot(), findQmd() 사용.
//         findstr(Windows 전용) → process.platform 분기 (win32=findstr, else=grep).
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { findQmd } = require('./find-qmd');

function search(query) {
  if (!query) {
    console.error('Usage: llm-wiki search "<search keywords>"');
    process.exit(1);
  }

  const docRoot = findDocRoot();
  const wikiPath = path.join(docRoot, 'wiki');
  const rawPath = path.join(docRoot, 'raw');
  const config = loadConfig(docRoot);

  const qmdPath = findQmd();

  if (qmdPath) {
    let qmdSucceeded = false;
    // 두 컬렉션 순회: 컴파일된 wiki + raw 로그.
    const collections = [config.collections.wiki, config.collections.raw];

    for (const coll of collections) {
      try {
        const output = execSync(`node "${qmdPath}" search "${query}" -c ${coll}`, { encoding: 'utf8', timeout: 30000 });
        if (!isQmdEmpty(output)) {
          if (!qmdSucceeded) {
            console.log(`Running semantic search via QMD: ${query}...`);
            qmdSucceeded = true;
          }
          console.log(`\n--- Collection: ${coll} ---`);
          console.log(output);
        }
      } catch (error) {
        // collection missing or QMD error for this collection — try next
      }
    }

    if (!qmdSucceeded) {
      // QMD가 모든 컬렉션에서 빈 결과 → grep fallback
      console.log(`QMD returned no results for: "${query}", falling back to grep...`);
      performGrepSearch(query, wikiPath, rawPath);
    }
  } else {
    console.log('QMD not found, performing fallback grep search...');
    performGrepSearch(query, wikiPath, rawPath);
  }
}

// QMD가 빈 결과를 반환하는지 확인 (에러가 아닌 "No results found." 케이스 감지)
function isQmdEmpty(output) {
  if (!output || !output.trim()) return true;
  return /^no\s+results\s+found\.\s*$/i.test(output.trim());
}

function performGrepSearch(query, wikiPath, rawPath) {
  console.log(`Searching wiki + raw files for: "${query}"`);
  try {
    const keywords = query.split(/\s+/).filter(k => k.length > 1);
    const results = new Set();
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
            grepCmd = `findstr /S /I /M /C:"${kw}" "${path.join(dir, '*.md')}"`;
          } else {
            // POSIX: -r 재귀, -l 파일명만, -i 대소문자무시
            grepCmd = `grep -rli "${kw}" "${dir}"`;
          }
          const output = execSync(grepCmd, { encoding: 'utf8' });
          output.split(/\r?\n/).forEach(file => {
            if (file.trim()) {
              results.add(path.resolve(file.trim()));
            }
          });
        } catch (e) {
          // findstr/grep returns exit code 1 if no matches
        }
      }
    }

    if (results.size > 0) {
      console.log('\nPotential matches found:');
      results.forEach(file => {
        const relativePath = path.relative(process.cwd(), file);
        console.log(`- [[${path.basename(file, '.md')}]] (${relativePath})`);
      });
    } else {
      console.log('No direct matches found.');
    }
  } catch (error) {
    console.error('Fallback search failed:', error.message);
  }
}

module.exports = { search };
