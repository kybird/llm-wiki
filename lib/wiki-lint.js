// wiki-lint — 위키 무결성 검사 (broken links, missing metadata, staleness, status 집계).
// 원본: TTSTextViewer/.agents/skills/wiki-lint/scripts/lint.js
// 변경점: __dirname '../../../../' → findDocRoot(). 나머지는 이미 범용.
const fs = require('fs');
const path = require('path');
const { findDocRoot } = require('./find-doc-root');

const VALID_STATUSES = new Set(['active', 'deprecated', 'draft', 'superseded', 'resolved']);
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

function lint() {
  const wikiRoot = path.join(findDocRoot(), 'wiki');

  if (!fs.existsSync(wikiRoot)) {
    console.error(`Wiki directory not found: ${wikiRoot}`);
    console.error('Run `llm-wiki init` first to scaffold doc/wiki/.');
    process.exit(1);
  }

  const report = {
    brokenLinks: [],
    missingMetadata: [],
    staleness: [],
    stats: { active: 0, deprecated: 0, draft: 0, superseded: 0, resolved: 0, unknown: 0, concepts: 0, patterns: 0 }
  };

  // 1. Scan Wiki
  const allFiles = getAllFiles(wikiRoot).filter(f => f.endsWith('.md') && !f.endsWith('index.md'));
  const fileMap = new Set(allFiles.map(f => path.basename(f, '.md')));

  allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(wikiRoot, file);
    const isConcept = relPath.includes('concepts');
    const isPattern = relPath.includes('patterns');

    if (isConcept) report.stats.concepts++;
    if (isPattern) report.stats.patterns++;

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

        if (target && !fileMap.has(target) && target !== 'index') {
          report.brokenLinks.push(`${relPath} -> [[${raw}]]`);
        }
      });
    }
  });

  // 2. Output Report
  console.log(`🩺 Wiki Health Report (${new Date().toISOString().split('T')[0]})`);
  console.log('===========================================');
  console.log(`📊 Stats: Concepts=${report.stats.concepts}, Patterns=${report.stats.patterns}`);
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

  if (report.missingMetadata.length > 0) {
    console.log(`\n⚠️  Missing/Invalid Metadata (${report.missingMetadata.length}):`);
    report.missingMetadata.forEach(m => console.log(`  - ${m}`));
  }

  if (report.staleness.length > 0) {
    console.log(`\n⏰ Stale Pages (> 180 days old, ${report.staleness.length}):`);
    report.staleness.forEach(s => console.log(`  - ${s}`));
  }
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
