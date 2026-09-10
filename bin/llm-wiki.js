#!/usr/bin/env node
// llm-wiki — LLM-friendly knowledge graph CLI for AI coding agents.
// 서브커맨드: search, compile, lint, init.
// 스킬(SKILL.md)이 이 명령을 호출한다. 에이전트 CLI(Claude/ZCode/Cursor) 무관.
const { search } = require('../lib/wiki-search');
const { compile } = require('../lib/wiki-compile');
const { lint } = require('../lib/wiki-lint');
const { init } = require('../lib/init');
const kanbanCmd = require('../lib/kanban-cmd');
const skills = require('../lib/skills');
const { findDocRoot } = require('../lib/find-doc-root');

function printUsage() {
  console.log(`llm-wiki — LLM-friendly knowledge graph + kanban for AI coding agents

Usage:
  llm-wiki search "<query>"          Semantic+grep merged search over wiki + raw logs
  llm-wiki compile list              Show raw logs modified since last compile
  llm-wiki compile index             Rebuild wiki index.md + sync QMD search index
  llm-wiki lint                      Validate wiki integrity (links, metadata, evidence)
  llm-wiki init [--check]            Scaffold doc/ + skills/ + hooks (--check: report only)

Skills (git channel — prompt edits without npm publish, plan.md 6.2):
  llm-wiki skills add <url>          Register a skill repo (owner/repo → GitHub)
  llm-wiki skills remove <url>       Unregister
  llm-wiki skills list               Show registered sources
  llm-wiki skills sync [--yes]       Clone, show diff, install after approval (6.5)
                                     [--skill <name>]   sync one skill only

Kanban (cards are files; CLI is the only writer):
  llm-wiki board [--html] [--json]   Derived board view (columns, WIP, queue) / static HTML
  llm-wiki board report              Dashboard (done:abandoned ratio, trend, reverts)
  llm-wiki board video               Timelapse of board activity → MP4 (needs video/ project)
  llm-wiki card new "<title>"        Create card (--goal, --ac, --depends)
  llm-wiki card show <title>         Print card file
  llm-wiki card edit <title>         Sentinel-safe edits (--goal/--ac/--add-ac/--check-ac/--note/--plan)
  llm-wiki pick --claim <name>       Atomically claim the next eligible card (locks, WIP, deps)
  llm-wiki handoff <title> --question "…"   Park for human judgment, release claim
  llm-wiki done <title> --result "…"        Complete (Result required)
  llm-wiki supersede <title> --by a,b       Replace by children (parent dissolves)
  llm-wiki abandon <title> --reason "…"     Discard (reason required, never deleted)
  llm-wiki reopen <title> --why "…"         QA: revert a fake-done card to doing
  llm-wiki resume <title> [--note "…"]      Return a review (parked) card to todo

Optional:
  npm i @tobilu/qmd                  Enable semantic search (falls back to grep if absent)
  --json                             Machine-readable output: {schemaVersion: 1, kind: ...}
                                     (search, lint, compile list|index)
  LLM_WIKI_ROOT=/path                Override doc/ root location
  llm-wiki.config.json               { "projectName": "...", "collections": {...},
                                       "hooksPath": "templates/githooks",
                                       "skills": { "sources": ["<git-url>"], "enabled": ["<name>"] } }`);
}

const [, , subcommand, ...rest] = process.argv;
// --json/--html은 어느 위치에 와도 플래그로 뽑아낸다 (검색어 문자열에서 제외).
const jsonRequested = rest.includes('--json');
const htmlRequested = rest.includes('--html');
const args = rest.filter(a => a !== '--json' && a !== '--html');

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
  case 'skills':
    // sync는 diff 제시 후 승인 프롬프트를 위해 async다.
    skills.dispatch(args, findDocRoot()).catch(e => {
      console.error(e.message);
      process.exitCode = 1;
    });
    break;
  case 'board':
    if (args[0] === 'report') kanbanCmd.boardReport({ json: jsonRequested });
    else if (args[0] === 'video') kanbanCmd.boardVideo({ rest: args });
    else kanbanCmd.boardView({ rest: args, json: jsonRequested, html: htmlRequested });
    break;
  case 'card':
    kanbanCmd.dispatchCard(args);
    break;
  case 'pick':
    kanbanCmd.pick({ rest: args, json: jsonRequested });
    break;
  case 'handoff':
    kanbanCmd.handoff({ rest: args });
    break;
  case 'done':
    kanbanCmd.doneCard({ rest: args });
    break;
  case 'supersede':
    kanbanCmd.supersede({ rest: args });
    break;
  case 'abandon':
    kanbanCmd.abandon({ rest: args });
    break;
  case 'reopen':
    kanbanCmd.reopen({ rest: args });
    break;
  case 'resume':
    kanbanCmd.resume({ rest: args });
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
