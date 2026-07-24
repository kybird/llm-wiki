# llm-wiki

An **LLM-friendly knowledge graph** for AI coding agents. Capture errors, decisions, and discoveries as raw daily logs, then compile them into a searchable wiki of concepts, patterns, and anti-patterns that agents consult before writing code.

Inspired by [Karpathy's Agentic Memory](https://github.com/karpathy/llm.c) ideas — designed so the *next* agent session doesn't repeat the *last* agent's mistakes.

## Why

AI coding agents (Claude Code, Cursor, ZCode, Gemini CLI, …) forget everything between sessions. A project wiki that they actually read — grounded in git hashes, file:line references, and real failure cases — turns one-off debugging pain into durable, reusable knowledge.

The four skills (`wiki-search`, `wiki-log`, `wiki-compile`, `wiki-lint`) are **LLM prompts**: the intelligence lives in the agent's context, not in a server. The CLI is just the plumbing.

## Install

```bash
npm install -g llm-wiki
```

## Quickstart (in any repo)

```bash
cd my-project
llm-wiki init          # scaffolds doc/, copies skills + git hooks

# Enable git hooks (run once per clone):
git config core.hooksPath githooks

# (Optional) enable semantic search — without it, search falls back to grep:
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
| `llm-wiki init` | Scaffold `doc/`, copy the 4 skills + sync scripts + git hooks into the current repo |
| `llm-wiki search "<query>"` | Semantic search (QMD) over wiki + raw logs; falls back to grep if QMD absent |
| `llm-wiki compile list` | Show raw logs modified since the last `compile index` |
| `llm-wiki compile index` | Rebuild `doc/wiki/index.md` and sync the QMD search index |
| `llm-wiki lint` | Report broken `[[wikilinks]]`, missing metadata, stale pages, status counts |

## What `init` creates

```
your-repo/
├── doc/
│   ├── raw/              # daily logs (YYYY-MM-DD.md) — wiki-log writes here
│   └── wiki/             # compiled knowledge
│       ├── index.md      # auto-rebuilt by `compile index`
│       ├── concepts/
│       ├── patterns/
│       └── antipatterns/
├── .agents/skills/       # canonical skills (ZCode, Cursor, …)
├── .claude/skills/       # mirror for Claude Code
├── scripts/              # doc/skill sync scripts (kept in sync by the pre-commit hook)
└── githooks/pre-commit   # enforces: edit CLAUDE.md canonical, auto-mirror copies
```

The skills are **the same across all repos** and call the global `llm-wiki` CLI — so `npm update -g llm-wiki` updates every repo at once. You never edit skill scripts inside individual repos.

## Configuration (optional)

Create `llm-wiki.config.json` in your repo root:

```json
{
  "projectName": "my-project",
  "collections": {
    "wiki": "ttswiki",
    "raw": "ttswiki-raw"
  }
}
```

- `projectName` — appears in the `index.md` header (omitted if unset).
- `collections` — QMD collection names (defaults shown).

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

This lets you target multiple agent CLIs from one canonical source. If you don't want it, simply skip `git config core.hooksPath githooks`.

## QMD / semantic search

[`@tobilu/qmd`](https://github.com/tobi/qmd) provides local vector embeddings (no network) for semantic search. It's an **optional** dependency:

- Installed → `llm-wiki search` uses hybrid BM25 + vector retrieval.
- Absent → `llm-wiki search` falls back to cross-platform grep.

First use downloads a ~300 MB embedding model to `~/.cache/qmd/models/`. For CUDA/build issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## License

MIT
