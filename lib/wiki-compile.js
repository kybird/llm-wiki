// wiki-compile — raw 로그에서 지식 추출/합성/비활성화 + index.md 재구축 + qmd 동기화.
// 원본: TTSTextViewer/.agents/skills/wiki-compile/scripts/compile.js (2026-07-24 loose 파일 분류 + CRLF fix 포함,
//       2026-08-21 list 판정 mtime→헤더 날짜 fix 역동기화)
// 변경점:
//   - __dirname '../../../../' → findDocRoot()
//   - 하드코딩 qmdCli 경로 → findQmd()
//   - "TTSTextViewer 프로젝트의..." 문자열 → config.projectName (null이면 제네릭 문구)
//   - COLLECTION/ COLLECTION_RAW → config.collections
//   - 2026-08-29 (개선계획 1-6): compile list/index가 --json 봉투를 지원.
//     {schemaVersion: 1, kind: 'compile-list'|'compile-index', ...}
//   - 2026-08-29 (사각지대 수정): 같은 날 append가 미컴파일로 감지되지 않던 결함을
//     컴파일 상태 해시로 고친다. subagent 설계 리뷰(채택+수정 3건) 반영:
//     ① list는 읽기전용 — 상태의 유일한 쓰기점은 compile index(전체 재생성, seed 특례 없음)
//     ② lastCompiled 단조 가드(max) — 시계 오차 머신이 미래로 점프시키지 않게
//     ③ 키 정렬 + LF 직렬화 — 머신 간 자동 머지 극대화. 충돌 해상도는 자명:
//        아무 쪽이나 남기고 `compile index` 1회면 현재 raw로부터 결정적으로 재생성된다.
//     날짜 절(date > lastCompiled)의 역할은 1차 탐지가 아니라 상태 유실 시의 안전망이다.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { localToday } = require('./local-today');
const { execSync } = require('child_process');
const { findDocRoot, loadConfig } = require('./find-doc-root');
const { findQmd } = require('./find-qmd');

const STATE_VERSION = 1;

// 정규화+해시는 읽기(list)와 쓰기(index)가 반드시 이 헬퍼 하나만 쓴다 —
// 구현 간 불일치로 인한 영구 오탐/누락을 원천 차단한다.
function contentHash(content) {
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

function loadCompileState(wikiRoot) {
  const p = path.join(wikiRoot, 'compile-state.json');
  if (!fs.existsSync(p)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(p, 'utf8').replace(/\r/g, ''));
    if (!state || state.schemaVersion !== STATE_VERSION) return null;
    return state;
  } catch {
    return null; // 깨진 상태는 없음 취급 — 날짜 규칙(안전망)으로 폴백
  }
}

// "오늘" 판정은 공유 유틸(lib/local-today.js) — 칸반 게이트·보드 뷰와 같은 규칙을 쓴다.

// 상태 재생성 — compile index 말미에서만 호출된다 (컴파일 완료 선언의 기록).
function writeCompileState(wikiRoot, rawRoot, lastCompiled, previous) {
  const files = {};
  for (const f of fs.readdirSync(rawRoot).filter(f => f.endsWith('.md')).sort()) {
    files[f] = contentHash(fs.readFileSync(path.join(rawRoot, f), 'utf8'));
  }
  const state = { schemaVersion: STATE_VERSION, lastCompiled, files };
  fs.writeFileSync(path.join(wikiRoot, 'compile-state.json'), JSON.stringify(state, null, 2) + '\n');
  if (!previous) {
    console.log(`컴파일 상태를 생성했다 — 기존 ${Object.keys(files).length}개 파일을 컴파일된 것으로 간주 (lint가 의미 기반 백스톱).`);
  }
  return state;
}

// "새 로그" 데이터 수집 — 판정: 날짜(안전망) OR 해시 불일치(정밀).
// 날짜 판정은 파일 mtime이 아니라 로그 헤더 날짜(# YYYY-MM-DD)로 한다 —
// git checkout이 mtime을 머신마다 갈리는 문제(fd01a03) 재발 방지.
function collectNewLogs(docRoot) {
  const wikiRoot = path.join(docRoot, 'wiki');
  const rawRoot = path.join(docRoot, 'raw');
  const state = loadCompileState(wikiRoot);
  const stateMissing = state === null;

  let lastUpdated = '0000-00-00';
  if (state) {
    lastUpdated = state.lastCompiled;
  } else {
    const indexPath = path.join(wikiRoot, 'index.md');
    if (fs.existsSync(indexPath)) {
      const match = fs.readFileSync(indexPath, 'utf8').match(/Last updated: (\d{4}-\d{2}-\d{2})/);
      if (match) lastUpdated = match[1];
    }
  }

  const newLogs = [];
  if (fs.existsSync(rawRoot)) {
    for (const f of fs.readdirSync(rawRoot).filter(f => f.endsWith('.md')).sort()) {
      const filePath = path.join(rawRoot, f);
      const content = fs.readFileSync(filePath, 'utf8');
      const header = content.match(/^#\s+(\d{4}-\d{2}-\d{2})/m);
      const date = header ? header[1] : localToday(fs.statSync(filePath).mtime);

      let reason = null;
      if (date > lastUpdated) {
        reason = 'new-date';
      } else if (!stateMissing) {
        const stored = state.files[f];
        if (stored === undefined) reason = 'no-entry';
        else if (stored !== contentHash(content)) reason = 'modified';
      }
      if (reason) newLogs.push({ name: f, date, reason });
    }
  }

  newLogs.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { schemaVersion: 1, kind: 'compile-list', lastCompiled: lastUpdated, state: stateMissing ? 'missing' : 'ok', newLogs };
}

function renderList(data) {
  console.log(`Last compiled date: ${data.lastCompiled}`);
  if (data.state === 'missing') {
    console.log('상태 파일 없음 — 날짜 규칙으로 판정한다 (compile index가 생성).');
  }
  console.log('Scanning for new raw logs...');

  if (data.newLogs.length === 0) {
    console.log('No new logs found.');
    return;
  }

  console.log('\nNew/Modified logs to process:');
  data.newLogs.forEach(f => console.log(`- ${f.name} (${f.date})${f.reason !== 'new-date' ? ` [${f.reason}]` : ''}`));
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
  const answersDir = path.join(wikiRoot, 'answers');

  // 서브디렉토리 분류는 디렉토리 자체가 분류 판정 (이미 물리적으로 정리됨).
  let concepts = scanDirectory(conceptsDir);
  let patterns = scanDirectory(patternsDir);
  let antipatterns = scanDirectory(antipatternsDir);
  // answers/ — 검색해서 종합한 유용한 답변의 아카이브 (개선계획 1-4).
  let answers = scanDirectory(answersDir);

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
  answers.sort(sortById);

  // index.md 헤더 — projectName이 설정되면 포함, 없으면 제네릭 문구.
  const headerLine = config.projectName
    ? `${config.projectName} 프로젝트의 구조화된 지식 베이스입니다. \`doc/raw/\` 로그에서 추출한 핵심 개념과 패턴을 정리했습니다.`
    : `이 프로젝트의 구조화된 지식 베이스입니다. \`doc/raw/\` 로그에서 추출한 핵심 개념과 패턴을 정리했습니다.`;

  let indexContent = `---\ntags: [index]\n\n# Wiki Index\n\n${headerLine}\n`;

  indexContent = addSection(indexContent, 'Concepts', '개념', concepts);
  indexContent = addSection(indexContent, 'Patterns', '패턴', patterns);
  indexContent = addSection(indexContent, 'Anti-Patterns', '안티패턴', antipatterns);
  indexContent = addSection(indexContent, 'Answers', '답변', answers);

  indexContent += `\n---\n\n## Statistics\n\n`;
  indexContent += `- Total concepts: ${concepts.length}\n`;
  indexContent += `- Total patterns: ${patterns.length}\n`;
  indexContent += `- Total anti-patterns: ${antipatterns.length}\n`;
  indexContent += `- Total answers: ${answers.length}\n`;

  // 컴파일 상태 — 여기가 유일한 쓰기점. lastCompiled 단조 가드(max)로 시계 오차
  // 머신이 날짜를 미래로 점프시키지 않게 하고, index.md의 Last updated와 같은 값을 쓴다.
  const previous = loadCompileState(wikiRoot);
  const today = localToday();
  const lastCompiled = previous && previous.lastCompiled > today ? previous.lastCompiled : today;
  indexContent += `- Last updated: ${lastCompiled}\n`;

  fs.writeFileSync(indexPath, indexContent);
  console.log(`Index successfully rebuilt at ${indexPath}`);
  writeCompileState(wikiRoot, rawRoot, lastCompiled, previous);

  return { wikiRoot, rawRoot, config };
}

// 인덱스 섹션 표 하나. 별칭 열은 검색 어휘 그물 — frontmatter aliases가 여기 실려
// index.md 전체가 grep/QMD 검색 대상이 된다 (개선계획 1-2).
function addSection(indexContent, title, headerLabel, entries) {
  indexContent += `\n---\n\n## ${title}\n\n| ${headerLabel} | 설명 | 별칭 |\n|------|------|------|\n`;
  entries.forEach(e => {
    indexContent += `| [[${e.id}]] | ${e.description} | ${(e.aliases || []).join(', ')} |\n`;
  });
  return indexContent;
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

// 단일 파일에서 {id, description, tags, aliases} 추출.
// description은 YAML description → blockquote 요약 → 첫 문장 순서로.
// tags는 loose 파일 분류를 위해, aliases는 인덱스 별칭 열을 위해 frontmatter에서 파싱.
function scanEntry(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const id = path.basename(filePath, '.md');
  let description = 'No description available.';
  let tags = [];
  let aliases = [];

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

    // aliases 파싱 — 같은 개념의 다른 이름들. 인덱스 표에 실려 grep/QMD 검색 어휘가 된다
    // (쓸 때와 찾을 때 어휘가 달라 못 찾는 문제의 두 번째 그물, 개선계획 1-2).
    const aliasesMatch = yaml.match(/^aliases:\s*\[(.*)\]\r?$/m);
    if (aliasesMatch) {
      aliases = aliasesMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  return { id, description, tags, aliases };
}

function syncQmd(ctx) {
  const { wikiRoot, rawRoot, config } = ctx;
  const qmdCli = findQmd();

  if (!qmdCli) {
    console.log('QMD not found, skipping search index sync.');
    console.log('(Optional) Install qmd for semantic search: npm i @tobilu/qmd');
    return false;
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
    return true;
  } catch (error) {
    console.error('QMD sync failed:', error.message);
    console.error('Wiki index rebuilt successfully, but search index may be stale.');
    return false;
  }
}

function compile(command, options = {}) {
  if (command === 'list') {
    const data = collectNewLogs(findDocRoot());
    // json 모드에서는 텍스트 렌더를 하지 않는다 — 봉투만이 계약이다.
    if (options.json) console.log(JSON.stringify(data, null, 2));
    else renderList(data);
  } else if (command === 'index') {
    const ctx = rebuildIndex();
    const qmdSynced = syncQmd(ctx);
    if (options.json) {
      console.log(JSON.stringify({
        schemaVersion: 1,
        kind: 'compile-index',
        indexPath: path.join(ctx.wikiRoot, 'index.md'),
        qmdSynced,
      }, null, 2));
    }
  } else {
    console.error('Usage: llm-wiki compile <list|index>');
    console.error('  list  - show raw logs modified since last compile');
    console.error('  index - rebuild wiki index.md and sync QMD search index');
    // 잘못된 서브커맨드는 실패다 — exit 0이면 LLM 호출자가 성공으로 오판한다(5-2).
    process.exitCode = 1;
  }
}

module.exports = { compile };
