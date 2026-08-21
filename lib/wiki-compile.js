// wiki-compile — raw 로그에서 지식 추출/합성/비활성화 + index.md 재구축 + qmd 동기화.
// 원본: TTSTextViewer/.agents/skills/wiki-compile/scripts/compile.js (2026-07-24 loose 파일 분류 + CRLF fix 포함,
//       2026-08-21 list 판정 mtime→헤더 날짜 fix 역동기화)
// 변경점:
//   - __dirname '../../../../' → findDocRoot()
//   - 하드코딩 qmdCli 경로 → findQmd()
//   - "TTSTextViewer 프로젝트의..." 문자열 → config.projectName (null이면 제네릭 문구)
//   - COLLECTION/ COLLECTION_RAW → config.collections
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { findQmd } = require('./find-qmd');

function listNewLogs() {
  const docRoot = findDocRoot();
  const wikiRoot = path.join(docRoot, 'wiki');
  const rawRoot = path.join(docRoot, 'raw');
  const indexPath = path.join(wikiRoot, 'index.md');

  let lastUpdated = '0000-00-00';
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    const match = content.match(/Last updated: (\d{4}-\d{2}-\d{2})/);
    if (match) lastUpdated = match[1];
  }

  console.log(`Last compiled date: ${lastUpdated}`);
  console.log('Scanning for new raw logs...');

  if (!fs.existsSync(rawRoot)) {
    console.log('No doc/raw/ directory found.');
    return;
  }

  // 판정 기준은 파일 mtime이 아니라 로그 헤더 날짜(# YYYY-MM-DD) — git checkout으로
  // mtime이 머신마다 갈리는 중복/누락과, 같은 날 컴파일해도 남는 same-day 오탐을 함께 없앤다.
  // 헤더 날짜가 없는 파일은 mtime 날짜로 폴백. ISO 날짜 문자열 비교는 달력 순서와 일치.
  const files = fs.readdirSync(rawRoot)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(rawRoot, f);
      const header = fs.readFileSync(filePath, 'utf8').match(/^#\s+(\d{4}-\d{2}-\d{2})/m);
      const date = header ? header[1] : fs.statSync(filePath).mtime.toISOString().split('T')[0];
      return { name: f, date };
    })
    .filter(f => f.date > lastUpdated)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (files.length > 0) {
    console.log('\nNew/Modified logs to process:');
    files.forEach(f => console.log(`- ${f.name} (${f.date})`));
  } else {
    console.log('No new logs found.');
  }
}

function rebuildIndex() {
  const docRoot = findDocRoot();
  const wikiRoot = path.join(docRoot, 'wiki');
  const rawRoot = path.join(docRoot, 'raw');
  const indexPath = path.join(wikiRoot, 'index.md');
  const config = loadConfig(docRoot);

  if (!fs.existsSync(wikiRoot)) {
    console.error(`Wiki directory not found: ${wikiRoot}`);
    process.exit(1);
  }

  console.log('Rebuilding Wiki Index...');

  const conceptsDir = path.join(wikiRoot, 'concepts');
  const patternsDir = path.join(wikiRoot, 'patterns');
  const antipatternsDir = path.join(wikiRoot, 'antipatterns');

  // 서브디렉토리 분류는 디렉토리 자체가 분류 판정 (이미 물리적으로 정리됨).
  let concepts = scanDirectory(conceptsDir);
  let patterns = scanDirectory(patternsDir);
  let antipatterns = scanDirectory(antipatternsDir);

  // loose 파일(루트 *.md)은 tags 기반으로 분류 — 파일 이동 없이 인덱스/검색에 반영.
  // pattern 태그 → Patterns, anti-pattern 태그 → Anti-Patterns, 그 외 → Concepts.
  // index.md, log.md는 메타 파일이므로 제외.
  const looseFiles = fs.existsSync(wikiRoot)
    ? fs.readdirSync(wikiRoot)
        .filter(f => f.endsWith('.md') && f !== 'index.md' && f !== 'log.md')
    : [];
  const looseEntries = looseFiles.map(f => scanEntry(path.join(wikiRoot, f)));
  looseEntries.forEach(e => {
    const tagList = e.tags || [];
    if (tagList.includes('anti-pattern') || tagList.includes('antipattern')) {
      antipatterns.push(e);
    } else if (tagList.includes('pattern')) {
      patterns.push(e);
    } else {
      concepts.push(e);
    }
  });

  // 알파벳 정렬로 인덱스 안정성 확보 (재실행마다 동일 순서).
  const sortById = (a, b) => a.id.localeCompare(b.id);
  concepts.sort(sortById);
  patterns.sort(sortById);
  antipatterns.sort(sortById);

  // index.md 헤더 — projectName이 설정되면 포함, 없으면 제네릭 문구.
  const headerLine = config.projectName
    ? `${config.projectName} 프로젝트의 구조화된 지식 베이스입니다. \`doc/raw/\` 로그에서 추출한 핵심 개념과 패턴을 정리했습니다.`
    : `이 프로젝트의 구조화된 지식 베이스입니다. \`doc/raw/\` 로그에서 추출한 핵심 개념과 패턴을 정리했습니다.`;

  let indexContent = `---\ntags: [index]\n\n# Wiki Index\n\n${headerLine}\n\n---\n\n## Concepts\n\n| 개념 | 설명 |\n|------|------|\n`;

  concepts.forEach(c => {
    indexContent += `| [[${c.id}]] | ${c.description} |\n`;
  });

  indexContent += `\n---\n\n## Patterns\n\n| 패턴 | 설명 |\n|------|------|\n`;

  patterns.forEach(p => {
    indexContent += `| [[${p.id}]] | ${p.description} |\n`;
  });

  indexContent += `\n---\n\n## Anti-Patterns\n\n| 안티패턴 | 설명 |\n|------|------|\n`;

  antipatterns.forEach(a => {
    indexContent += `| [[${a.id}]] | ${a.description} |\n`;
  });

  indexContent += `\n---\n\n## Statistics\n\n`;
  indexContent += `- Total concepts: ${concepts.length}\n`;
  indexContent += `- Total patterns: ${patterns.length}\n`;
  indexContent += `- Total anti-patterns: ${antipatterns.length}\n`;
  indexContent += `- Last updated: ${new Date().toISOString().split('T')[0]}\n`;

  fs.writeFileSync(indexPath, indexContent);
  console.log(`Index successfully rebuilt at ${indexPath}`);

  return { wikiRoot, rawRoot, config };
}

// 첫 문장 추출 — inline code(백틱) 안의 마침표는 무시.
// 끝 마침표 = 마침표 뒤에 공백+문자(다음 문장 시작)가 오거나, 마침표가 줄 끝.
function firstSentence(line) {
  let result = '';
  let inBacktick = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '`') { inBacktick = !inBacktick; result += ch; continue; }
    result += ch;
    if (ch === '.' && !inBacktick) {
      const rest = line.slice(i + 1);
      if (/^\s+[A-Z가-힣]/.test(rest) || i === line.length - 1) {
        return result.trim();
      }
    }
  }
  return result.trim();
}

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => scanEntry(path.join(dir, f)));
}

// 단일 파일에서 {id, description, tags} 추출.
// description은 YAML description → blockquote 요약 → 첫 문장 순서로.
// tags는 loose 파일 분류를 위해 frontmatter에서 파싱.
function scanEntry(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const id = path.basename(filePath, '.md');
  let description = 'No description available.';
  let tags = [];

  // YAML frontmatter 추출 (description + tags 모두 이 블록에서).
  // CRLF 대응: \r?\n 으로 줄바꿈 매칭 (윈도우 체크아웃 시 파일이 CRLF).
  const yamlMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/m);
  if (yamlMatch) {
    const yaml = yamlMatch[1];

    // description (명시적이면 가장 정확)
    const descMatch = yaml.match(/^description:\s*(.+?)\r?$/m);
    if (descMatch) {
      description = descMatch[1].trim().replace(/^["']|["']$/g, '');
    } else {
      // description이 없으면 title 다음 첫 paragraph/blockquote에서 첫 문장.
      const lines = content.split('\n');
      const titleIndex = lines.findIndex(l => l.startsWith('# '));
      if (titleIndex !== -1) {
        for (let i = titleIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('> ')) {
            description = firstSentence(line.slice(2).trim());
            break;
          }
          if (line && !line.startsWith('#') && !line.startsWith('---')) {
            description = firstSentence(line);
            break;
          }
        }
      }
    }

    // tags 파싱 — `[a, b, c]` 형태를 배열로.
    const tagsMatch = yaml.match(/^tags:\s*\[(.*)\]\r?$/m);
    if (tagsMatch) {
      tags = tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  return { id, description, tags };
}

function syncQmd(ctx) {
  const { wikiRoot, rawRoot, config } = ctx;
  const qmdCli = findQmd();

  if (!qmdCli) {
    console.log('QMD not found, skipping search index sync.');
    console.log('(Optional) Install qmd for semantic search: npm i @tobilu/qmd');
    return;
  }

  try {
    const listOutput = execSync(`node "${qmdCli}" collection list`, { encoding: 'utf8' });

    // wiki 콜렉션: 컴파일된 위키. raw 콜렉션: 일일 raw 로그.
    // search.js는 두 콜렉션을 모두 조회하므로, 둘 다 프로비저닝되어 있어야
    // semantic search가 wiki + raw 양쪽을 커버함.
    const collections = [
      { name: config.collections.wiki, path: wikiRoot },
      { name: config.collections.raw, path: rawRoot },
    ];

    for (const { name, path: collPath } of collections) {
      if (!listOutput.includes(name)) {
        console.log(`Creating QMD collection '${name}'...`);
        execSync(`node "${qmdCli}" collection add "${collPath}" --name ${name}`, { encoding: 'utf8', stdio: 'inherit' });
      }
    }

    console.log('Updating QMD index...');
    execSync(`node "${qmdCli}" update`, { encoding: 'utf8', stdio: 'inherit' });

    console.log('Refreshing QMD embeddings...');
    execSync(`node "${qmdCli}" embed`, { encoding: 'utf8', stdio: 'inherit' });

    console.log('✓ QMD search index synced.');
  } catch (error) {
    console.error('QMD sync failed:', error.message);
    console.error('Wiki index rebuilt successfully, but search index may be stale.');
  }
}

function compile(command) {
  if (command === 'list') {
    listNewLogs();
  } else if (command === 'index') {
    const ctx = rebuildIndex();
    syncQmd(ctx);
  } else {
    console.log('Usage: llm-wiki compile <list|index>');
    console.log('  list  - show raw logs modified since last compile');
    console.log('  index - rebuild wiki index.md and sync QMD search index');
  }
}

module.exports = { compile };
