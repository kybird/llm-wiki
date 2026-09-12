#!/usr/bin/env node
// llm-wiki — LLM-friendly knowledge graph CLI for AI coding agents.
// 서브커맨드: search, compile, lint, init.
// 스킬(SKILL.md)이 이 명령을 호출한다. 에이전트 CLI(Claude/ZCode/Cursor) 무관.
const { search } = require('../lib/wiki-search');
const { compile } = require('../lib/wiki-compile');
const { lint } = require('../lib/wiki-lint');
const { init } = require('../lib/init');
const kanbanCmd = require('../lib/kanban-cmd');
const kanbanWait = require('../lib/kanban-wait');
const skills = require('../lib/skills');
const { findDocRoot } = require('../lib/find-doc-root');
const { maybeAutoUpdate } = require('../lib/auto-update');
const { version } = require('../package.json');

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
  llm-wiki card new "<title>"        Create card (--goal, --ac, --depends, --not-before)
  llm-wiki card show <title>         Print card file
  llm-wiki card edit <title>         Sentinel-safe edits; unknown/blank flags fail, output
                                     says what changed (--goal/--plan/--ac/--add-ac/
                                     --check-ac/--note/--renew-claim/--depends/
                                     --add-depends/--remove-depends)
  llm-wiki pick --claim <name>       Atomically claim the next eligible card (locks, WIP, deps)
  llm-wiki handoff <title> --question "…"   Park for human judgment, release claim
  llm-wiki done <title> --result "…"        Complete (Result required)
  llm-wiki supersede <title> --by a,b       Replace by children (parent dissolves)
  llm-wiki abandon <title> --reason "…"     Discard (reason required, never deleted)
  llm-wiki reopen <title> --why "…"         QA: revert a fake-done card to doing
  llm-wiki resume <title> [--note "…"]      Return a review (parked) card to todo
  llm-wiki wait [--for <필터>] [--since <ISO ts>] [--timeout <초>] [--stall-min <분>] [--json]
                                     Block until a board event, then exit. 종료 코드가 계약:
                                     0 = 이벤트(stdout 한 줄), 2 = 타임아웃(출력 없음 — 조용히
                                     재무장), 1 = 오류. 필터: handoff(기본) | done | any |
                                     stall(--stall-min 분 무활동 후 0, 기본 20). --since 생략
                                     시 지금 — 이후의 기존 이벤트는 대기 전에 먼저 검사한다

Optional:
  npm i @tobilu/qmd                  Enable semantic search (falls back to grep if absent)
  npm update -g @kybird/llm-wiki     Copied skills/hooks/scripts auto-update on the next
                                     command ("autoUpdate": false in llm-wiki.config.json,
                                     or LLM_WIKI_NO_AUTO_UPDATE=1, to opt out)
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

// npm 업데이트 자동 반영(README "Updating") — 리포를 실제로 쓰는 명령 앞에서만.
// init은 자체 동기화 흐름이 있고, 도움말·버전·오타 명령은 리포를 건드릴 이유가 없다.
// wait도 빠진다 — 백그라운드 관측 명령이라 동기화를 몰고 올 이유가 없고, 무엇보다
// stdout이 "이벤트 한 줄 or 침묵" 계약이라 auto-update 배너가 그 계약을 깬다.
// 실패는 maybeAutoUpdate 안에서 삼켜진다 — 갱신 실패가 명령을 막지 않는다.
if (['search', 'compile', 'lint', 'skills', 'board', 'card', 'pick', 'handoff',
  'done', 'supersede', 'abandon', 'reopen', 'resume'].includes(subcommand)) {
  maybeAutoUpdate();
}

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
  case 'wait':
    kanbanWait.wait({ rest: args, json: jsonRequested });
    break;
  case '--help':
  case '-h':
  case undefined:
    printUsage();
    break;
  case '--version':
  case '-v':
    console.log(version);
    break;
  default:
    console.error(`Unknown command: ${subcommand}`);
    printUsage();
    process.exit(1);
}
