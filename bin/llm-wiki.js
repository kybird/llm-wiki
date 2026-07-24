#!/usr/bin/env node
// llm-wiki — LLM-friendly knowledge graph CLI for AI coding agents.
// 서브커맨드: search, compile, lint, init.
// 스킬(SKILL.md)이 이 명령을 호출한다. 에이전트 CLI(Claude/ZCode/Cursor) 무관.
const { search } = require('../lib/wiki-search');
const { compile } = require('../lib/wiki-compile');
const { lint } = require('../lib/wiki-lint');
const { init } = require('../lib/init');

function printUsage() {
  console.log(`llm-wiki — LLM-friendly knowledge graph for AI coding agents

Usage:
  llm-wiki search "<query>"          Semantic/grep search over wiki + raw logs
  llm-wiki compile list              Show raw logs modified since last compile
  llm-wiki compile index             Rebuild wiki index.md + sync QMD search index
  llm-wiki lint                      Validate wiki integrity (broken links, metadata)
  llm-wiki init                      Scaffold doc/ + skills/ + hooks in current repo

Optional:
  npm i @tobilu/qmd                  Enable semantic search (falls back to grep if absent)
  LLM_WIKI_ROOT=/path                Override doc/ root location
  llm-wiki.config.json               { "projectName": "...", "collections": {...} }`);
}

const [, , subcommand, ...rest] = process.argv;

switch (subcommand) {
  case 'search':
    search(rest.join(' '));
    break;
  case 'compile':
    compile(rest[0]); // 'list' | 'index'
    break;
  case 'lint':
    lint();
    break;
  case 'init':
    init();
    break;
  case '--help':
  case '-h':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${subcommand}`);
    printUsage();
    process.exit(1);
}
