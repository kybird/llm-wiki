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
  llm-wiki lint                      Validate wiki integrity (broken links, metadata, evidence)
  llm-wiki init [--check]            Scaffold doc/ + skills/ + hooks (--check: report only)
  llm-wiki board ...                 Kanban core (see: llm-wiki board --help)

Optional:
  npm i @tobilu/qmd                  Enable semantic search (falls back to grep if absent)
  --json                             Machine-readable output: {schemaVersion: 1, kind: ...}
                                     (search, lint, compile list|index)
  LLM_WIKI_ROOT=/path                Override doc/ root location
  llm-wiki.config.json               { "projectName": "...", "collections": {...} }`);
}

const [, , subcommand, ...rest] = process.argv;
// --json은 어느 위치에 와도 플래그로 뽑아낸다 (검색어 문자열에서 제외).
const jsonRequested = rest.includes('--json');
const args = rest.filter(a => a !== '--json');

switch (subcommand) {
  case 'search':
    search(args.join(' '), { json: jsonRequested });
    break;
  case 'compile':
    compile(args[0], { json: jsonRequested }); // 'list' | 'index'
    break;
  case 'lint':
    lint({ json: jsonRequested });
    break;
  case 'init':
    init({ check: args.includes('--check') });
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
