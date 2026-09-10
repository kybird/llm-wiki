# llm-wiki

An **LLM-friendly knowledge graph + kanban board** for AI coding agents. Capture errors, decisions, and discoveries as raw daily logs, then compile them into a searchable wiki of concepts, patterns, and anti-patterns that agents consult before writing code. A file-based kanban (`doc/kanban/`) turns the same repo into an unattended work queue.

Inspired by [Karpathy's Agentic Memory](https://github.com/karpathy/llm.c) ideas — designed so the *next* agent session doesn't repeat the *last* agent's mistakes.

## Why

AI coding agents (Claude Code, Cursor, ZCode, Gemini CLI, …) forget everything between sessions. A project wiki that they actually read — grounded in git hashes, real error strings, and real failure cases — turns one-off debugging pain into durable, reusable knowledge. The kanban adds a convergence loop: cards are picked, resolved, parked for human judgment, or abandoned *with a reason* that feeds back into the wiki as anti-pattern material.

The skills (`wiki-search`, `wiki-log`, `wiki-compile`, `wiki-lint`, `kanban-plan`, `work-loop`) are **LLM prompts**: the intelligence lives in the agent's context, not in a server. The CLI is just the plumbing. Planning sessions turn plans into cards (`kanban-plan`); unattended loop sessions resolve them (`work-loop`).

## Install

```bash
npm install -g @kybird/llm-wiki   # installs the `llm-wiki` command
# or run without installing:
npx @kybird/llm-wiki init
```

## Quickstart (in any repo)

```bash
cd my-project
llm-wiki init          # scaffolds doc/ (wiki + kanban), copies skills + hooks + scripts

# Enable git hooks (run once per clone):
git config core.hooksPath githooks

# (Optional) QMD adds semantic search on top of grep — grep alone works without it:
npm install @tobilu/qmd
```

Then tell your AI agent (via its instructions file — `CLAUDE.md` / `AGENTS.md` / etc.):
- **Before any task**: run `llm-wiki search "<task keywords>"` and read matching `status: active` pages.
- **After fixing a bug / making a design decision**: use the `wiki-log` skill to record a Case in `doc/raw/YYYY-MM-DD.md`.
- **Periodically**: use `wiki-compile` to promote raw cases into `doc/wiki/` pages.

That's it. The agent does the rest.

## Commands

| Command | What it does |
|---|---|
| `llm-wiki init [--check]` | Scaffold `doc/` (wiki + kanban), copy skills + hooks + scripts. Marker-aware — re-running updates copies and preserves your edits. `--check` reports without writing |
| `llm-wiki search "<query>"` | Grep exact matching + QMD semantic search, **always merged**; ranked by matched-keyword count with line snippets |
| `llm-wiki compile list` | Show raw logs not yet compiled — header date **or** content hash (`compile-state.json`), so same-day appends are caught too |
| `llm-wiki compile index` | Rebuild `doc/wiki/index.md` (with aliases and answers), regenerate `compile-state.json`, and sync the QMD index. **This is a "compile complete" declaration** — run it after the wiki-compile skill's phases, not instead of them |
| `llm-wiki lint` | Broken links, **evidence back-matching** (hash refs & `### Error` quotes must exist verbatim in `doc/raw/`), uncompiled concepts, metadata, staleness |
| `llm-wiki board` / `board report` | Derived kanban view / dashboard (done:abandoned ratio, trend, QA reverts, waiting queue) |
| `llm-wiki board video` | Replay `activity.jsonl` into a board timelapse MP4 (requires the `video/` Remotion project; CPU render, no GPU) |
| `llm-wiki card new/show/edit` | Create and edit cards — the CLI is the only writer (sentinel-safe sections) |
| `llm-wiki pick --claim <name>` | Atomically claim the next eligible card (lock, WIP limit, dependencies, claim expiry) |
| `llm-wiki handoff <title> --question "…"` | Park a card for human judgment and release the claim |
| `llm-wiki done <title> --result "…"` | Complete a card — Result is required |
| `llm-wiki supersede <title> --by a,b` | Replace a card by children; the parent dissolves into `superseded/` |
| `llm-wiki abandon <title> --reason "…"` | Discard — reason required, and auto-logged to `doc/raw/` as anti-pattern material |
| `llm-wiki reopen <title> --why "…"` | QA: revert a fake-done card back to doing |

`search`, `lint`, `compile list|index`, `board`, `pick` accept `--json` (a `{schemaVersion: 1, kind: …}` envelope for scripts and skills).

## What `init` creates

```
your-repo/
├── doc/
│   ├── raw/               # daily logs (YYYY-MM-DD.md) — wiki-log writes here
│   ├── wiki/              # compiled knowledge
│   │   ├── index.md       # auto-rebuilt by `compile index`
│   │   └── concepts/ patterns/ antipatterns/ answers/
│   └── kanban/            # card-per-file kanban
│       ├── board.yml      # statuses, WIP limit, claim timeout
│       ├── cards/         # active: todo / doing / review (frontmatter status)
│       ├── done/ superseded/ abandoned/   # termination = the folder
│       └── activity.jsonl # append-only audit log (10k line cap)
├── AGENTS.md             # seeded once if absent — "which skill when" for every session
├── .agents/skills/        # canonical skills (ZCode, Cursor, …)
├── .claude/skills/        # mirror for Claude Code
├── scripts/               # doc/skill sync scripts (marker-protected copies)
└── githooks/pre-commit    # CLAUDE.md drift guard + skill mirror + uncompiled-log nudge
```

## Updating

The skills, hooks, and scripts copied into your repo are **marker-protected copies**. Updating is two commands:

```bash
npm update -g llm-wiki    # refresh the global CLI
llm-wiki init --check     # what would change? (ok / stale / user-modified / missing)
llm-wiki init             # apply — stale copies update, your edits survive
```

The contract: a copy keeps its version marker (`skill-version:` in skills, `llm-wiki-template-version:` in hooks and scripts) only while it is unmodified. **To customize a copy, delete its marker line** — `init` then treats it as yours and never overwrites it. Repos that keep their own canonical hook can skip the copy entirely: set `"hooksPath": "templates/githooks"` in `llm-wiki.config.json`.

## Configuration (optional)

Create `llm-wiki.config.json` in your repo root:

```json
{
  "projectName": "my-project",
  "collections": {
    "wiki": "my-project-wiki",
    "raw": "my-project-wiki-raw"
  },
  "hooksPath": "templates/githooks"
}
```

- `projectName` — appears in the `index.md` header (omitted if unset).
- `collections` — QMD collection names (defaults derive from your repo's folder name; unique names matter — colliding names silently cross-contaminate search across projects).
- `hooksPath` — set it and `init` won't create a `githooks/` copy; your repo uses that path directly (for repos that vendor their own hook source).

You can also set `LLM_WIKI_ROOT=/path/to/doc-parent` to point at a `doc/` outside the repo.

## How the knowledge flows

```
agent fixes a bug
      │
      ▼  wiki-log skill
doc/raw/2026-07-24.md   (Case: grounding + error + fix + analysis)
      │
      ▼  wiki-compile skill (LLM extracts & synthesizes)
doc/wiki/patterns/foo.md   doc/wiki/antipatterns/bar.md
      │
      ▼  llm-wiki compile index
doc/wiki/index.md   + QMD embeddings
      │
      ▼  next agent session
llm-wiki search "foo"   →  reads the pattern, avoids repeating the mistake
```

Raw logs are the source of truth; compiled wiki pages are derived. The `status:` field (`active` / `deprecated` / `superseded`) lets knowledge evolve without losing history.

## Agent-docs & skill sync (bonus)

`init` also installs a `pre-commit` hook that keeps your agent-instruction files in sync:

- Edit `CLAUDE.md` (canonical) → `agents.md`, `GEMINI.md` auto-mirror on commit.
- Edit `.agents/skills/` (canonical) → `.claude/skills/` auto-mirrors.
- Editing a copy directly is rejected with a clear message.

This lets you target multiple agent CLIs from one canonical source. If you don't want it, simply skip `git config core.hooksPath githooks`. Package-level updates of the copied skills/hooks/scripts follow the marker contract — see [Updating](#updating).

## QMD / semantic search

[`@tobilu/qmd`](https://github.com/tobi/qmd) provides local vector embeddings (no network) for semantic search. It's an **optional** dependency:

- Installed → `llm-wiki search` merges QMD semantic results on top of the grep results.
- Absent → grep-only; exact matching still fully works (ranked by matched keywords, with line snippets).

Grep always runs — semantic search is a supplement, never a replacement. First use downloads a ~300 MB embedding model to `~/.cache/qmd/models/`. For CUDA/build issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Development (this repo)

This repo dogfoods itself:

```bash
npm link          # global `llm-wiki` runs this working tree
llm-wiki init     # syncs skills + scripts into this repo (marker-aware)
git config core.hooksPath templates/githooks
```

`llm-wiki.config.json` here declares `"hooksPath": "templates/githooks"`, so `init` never creates a `githooks/` copy — the active hook *is* the canonical template. See [doc/improvement-plan.md](doc/improvement-plan.md) for the roadmap state and [doc/plan.md](doc/plan.md) for the design record.

Regression tests (round-trip serialization, duplicate titles, non-card pick, concurrent writes) run on throwaway boards — never touch this repo's `doc/`: `npm test`.

## License

MIT
