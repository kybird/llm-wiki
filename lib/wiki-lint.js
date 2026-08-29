// wiki-lint — 위키 무결성 검사 (broken links, missing metadata, staleness, status 집계,
// 근거 역매칭, 미컴파일 개념).
// 원본: TTSTextViewer/.agents/skills/wiki-lint/scripts/lint.js
// 변경점:
//   - __dirname '../../../../' → findDocRoot(). 나머지는 이미 범용.
//   - 2026-08-29 (개선계획 1-1): 근거 역매칭 검증 — karpathy-llm-wiki check_evidence.py 방식.
//     위키 페이지의 `hash:xxx`(7~40 hex)와 `### Error` 인용 줄을 doc/raw/ 전체에서
//     문자 그대로 찾지 못하면 위반으로 보고한다. 구조화 필드라 file:line 추적 없이 가능.
//     grounding 발행 비용을 늘리지 않는다(그들의 file:line 포기 교훈 존중).
//   - 2026-08-29 (개선계획 1-3): raw 로그의 [[링크]] 빈도를 세어 N회 이상 언급됐는데
//     위키 페이지가 없는 개념을 "Uncompiled knowledge"로 보고한다.
const fs = require('fs');
const path = require('path');
const { findDocRoot } = require('./find-doc-root');

const VALID_STATUSES = new Set(['active', 'deprecated', 'draft', 'superseded', 'resolved']);
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
// 이 횟수 이상 raw에서 언급됐는데 위키 페이지가 없으면 컴파일 대기 지식으로 본다.
const UNCOMPILED_THRESHOLD = 2;
// ### Error 인용 줄 중 이 길이 미만은 노이즈(헤더, 짧은 토큰)라 비교에서 제외.
const MIN_QUOTE_LENGTH = 8;

function lint() {
  const docRoot = findDocRoot();
  const wikiRoot = path.join(docRoot, 'wiki');
  const rawRoot = path.join(docRoot, 'raw');

  if (!fs.existsSync(wikiRoot)) {
    console.error(`Wiki directory not found: ${wikiRoot}`);
    console.error('Run `llm-wiki init` first to scaffold doc/wiki/.');
    process.exit(1);
  }

  const report = {
    brokenLinks: [],
    missingMetadata: [],
    staleness: [],
    evidenceViolations: [],
    uncompiledKnowledge: [],
    stats: { active: 0, deprecated: 0, draft: 0, superseded: 0, resolved: 0, unknown: 0, concepts: 0, patterns: 0, antipatterns: 0 }
  };

  // raw 로그 전체를 하나의 문자열로 — 근거 역매칭의 비교 대상 코퍼스.
  const rawFiles = fs.existsSync(rawRoot) ? getAllFiles(rawRoot).filter(f => f.endsWith('.md')) : [];
  const rawCorpus = rawFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

  // 1. Scan Wiki
  const allFiles = getAllFiles(wikiRoot).filter(f => f.endsWith('.md') && !f.endsWith('index.md'));
  const fileMap = new Set(allFiles.map(f => normalizeLinkKey(path.basename(f, '.md'))));

  allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(wikiRoot, file);
    const isConcept = relPath.includes('concepts');
    // antipatterns가 'patterns' 부분문자열에 걸리지 않도록 먼저 판정한다.
    const isPattern = !relPath.includes('antipatterns') && relPath.includes('patterns');
    const isAntipattern = relPath.includes('antipatterns');

    if (isConcept) report.stats.concepts++;
    if (isPattern) report.stats.patterns++;
    if (isAntipattern) report.stats.antipatterns++;

    // Check Metadata
    const yamlMatch = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
    if (yamlMatch) {
      const header = yamlMatch[1];
      const statusMatch = header.match(/status:\s*(\w+)/);
      const createdMatch = header.match(/created:\s*(\d{4}-\d{2}-\d{2})/);

      if (statusMatch) {
        const status = statusMatch[1];
        if (VALID_STATUSES.has(status)) {
          report.stats[status]++;
        } else {
          report.stats.unknown++;
          report.missingMetadata.push(`${relPath} (unknown status: ${status})`);
        }
      } else {
        report.missingMetadata.push(`${relPath} (missing status)`);
      }

      // Staleness (Time-based)
      if (createdMatch) {
        const createdDate = new Date(createdMatch[1]);
        if (new Date() - createdDate > SIX_MONTHS_MS) {
          report.staleness.push(`${relPath} (Created: ${createdMatch[1]}, > 180 days old)`);
        }
      }

    } else {
      report.missingMetadata.push(`${relPath} (missing YAML header)`);
    }

    // Check Links — handle Obsidian syntax: [[target]], [[target|display]], [[path/target#anchor|display]]
    // 링크-파일명 대응은 정규화 키로 비교한다 — 에이전트가 [[Title Case]]와
    // kebab-case 파일명을 섞어 쓰면 오탐이 나기 때문 (2026-08-29 실측).
    const links = content.match(/\[\[(.+?)\]\]/g);
    if (links) {
      links.forEach(link => {
        const raw = link.slice(2, -2);
        // Strip display text after pipe: [[target|display]] → target
        let target = raw.split('|')[0];
        // Strip anchor after #: [[target#section]] → target
        target = target.split('#')[0];
        // Strip path prefix: [[doc/learn/xxx]] → basename
        target = path.basename(target);

        if (target && !fileMap.has(normalizeLinkKey(target)) && normalizeLinkKey(target) !== 'index') {
          report.brokenLinks.push(`${relPath} -> [[${raw}]]`);
        }
      });
    }

    // 근거 역매칭 (개선계획 1-1) — raw 코퍼스가 있을 때만 검사.
    if (rawCorpus) {
      checkEvidence(content, relPath, rawCorpus, report);
    }
  });

  // 미컴파일 개념 (개선계획 1-3) — raw [[링크]] 빈도 vs 위키 페이지 존재.
  report.uncompiledKnowledge = findUncompiledKnowledge(rawFiles, fileMap);

  // 2. Output Report
  console.log(`🩺 Wiki Health Report (${new Date().toISOString().split('T')[0]})`);
  console.log('===========================================');
  console.log(`📊 Stats: Concepts=${report.stats.concepts}, Patterns=${report.stats.patterns}` +
    (report.stats.antipatterns > 0 ? `, Anti-Patterns=${report.stats.antipatterns}` : ''));
  console.log(`📊 Status: Active=${report.stats.active}, Deprecated=${report.stats.deprecated}, Draft=${report.stats.draft}` +
    (report.stats.superseded > 0 ? `, Superseded=${report.stats.superseded}` : '') +
    (report.stats.resolved > 0 ? `, Resolved=${report.stats.resolved}` : '') +
    (report.stats.unknown > 0 ? `, Unknown=${report.stats.unknown}` : ''));
  console.log('===========================================');

  if (report.brokenLinks.length > 0) {
    console.log(`\n⚠️  Broken Links (${report.brokenLinks.length}):`);
    report.brokenLinks.forEach(l => console.log(`  - ${l}`));
  } else {
    console.log('\n✅ No broken links found.');
  }

  if (report.evidenceViolations.length > 0) {
    console.log(`\n⚠️  Evidence Violations (${report.evidenceViolations.length}) — not found verbatim in doc/raw/:`);
    report.evidenceViolations.forEach(v => console.log(`  - ${v}`));
  } else {
    console.log('\n✅ No evidence violations (all hash refs and Error quotes found in raw logs).');
  }

  if (report.uncompiledKnowledge.length > 0) {
    console.log(`\n📝 Uncompiled Knowledge (${report.uncompiledKnowledge.length}) — mentioned ≥${UNCOMPILED_THRESHOLD}x in raw, no wiki page:`);
    report.uncompiledKnowledge.forEach(u => console.log(`  - [[${u.name}]] (${u.count} mentions)`));
  }

  if (report.missingMetadata.length > 0) {
    console.log(`\n⚠️  Missing/Invalid Metadata (${report.missingMetadata.length}):`);
    report.missingMetadata.forEach(m => console.log(`  - ${m}`));
  }

  if (report.staleness.length > 0) {
    console.log(`\n⏰ Stale Pages (> 180 days old, ${report.staleness.length}):`);
    report.staleness.forEach(s => console.log(`  - ${s}`));
  }
}

// 위키 페이지 한 장의 근거(해시 참조 + ### Error 인용)가 raw 코퍼스에
// 문자 그대로 존재하는지 검사해 위반을 report에 쌓는다.
function checkEvidence(content, relPath, rawCorpus, report) {
  // (a) git hash 근거: `hash:fd01a03` 형태. 뒤집어서 raw에서 못 찾으면 유령 근거.
  const hashRe = /hash:\s*`?([0-9a-fA-F]{7,40})`?/g;
  let m;
  while ((m = hashRe.exec(content)) !== null) {
    const hex = m[1];
    if (!rawCorpus.includes(hex)) {
      report.evidenceViolations.push(`${relPath} — hash:${hex} not found in doc/raw/`);
    }
  }

  // (b) ### Error 섹션의 인용 줄. 마크다운 장식을 벗긴 뒤 원문 일치를 본다 —
  //     compile 때 요약으로 바뀌면 걸릴 문자열이 사라졌다는 신호가 된다.
  for (const quote of extractErrorQuotes(content)) {
    if (!rawCorpus.includes(quote)) {
      report.evidenceViolations.push(`${relPath} — Error quote not in doc/raw/: "${truncate(quote, 80)}"`);
    }
  }
}

// ### Error 섹션 본문 줄들을 추출한다. 다음 ### 헤더에서 섹션이 끝난다.
function extractErrorQuotes(content) {
  const quotes = [];
  let inError = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^###\s+/.test(line)) {
      inError = /^###\s+Error\s*$/.test(line.trim());
      continue;
    }
    if (!inError) continue;
    // 마크다운 장식(리스트 마커, 인용, 감싼 백틱)을 벗겨 원문만 남긴다.
    const cleaned = line.trim()
      .replace(/^[-*]\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^`/, '')
      .replace(/`$/, '')
      .trim();
    if (cleaned.length >= MIN_QUOTE_LENGTH) quotes.push(cleaned);
  }
  return quotes;
}

// [[링크]] 대상과 파일명의 동일성을 비교할 때 쓰는 정규화 키.
// 대소문자·공백/하이픈 차이는 에이전트 작성 드리프트라 같은 개념으로 본다.
function normalizeLinkKey(name) {
  return String(name).trim().toLowerCase().replace(/\s+/g, '-');
}

// raw 로그 전체에서 [[링크]] 빈도를 세고, 위키에 페이지가 없는 잦은 개념을 돌려준다.
function findUncompiledKnowledge(rawFiles, fileMap) {
  const linkCount = new Map();
  for (const file of rawFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const links = content.match(/\[\[(.+?)\]\]/g) || [];
    for (const link of links) {
      let target = link.slice(2, -2).split('|')[0].split('#')[0];
      target = path.basename(target);
      if (!target) continue;
      const key = normalizeLinkKey(target);
      linkCount.set(key, { name: target, count: (linkCount.get(key)?.count || 0) + 1 });
    }
  }
  return [...linkCount.entries()]
    .filter(([key, v]) => v.count >= UNCOMPILED_THRESHOLD && !fileMap.has(key) && key !== 'index')
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('.obsidian')) results = results.concat(getAllFiles(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

module.exports = { lint };
