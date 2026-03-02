# AGENTS.md — Developer & Agent Guide

This file describes how to develop, test, and contribute to `pi-hashline-readmap`. It is the authoritative guide for both human developers and AI coding agents working in this repository.

## What This Project Is

A unified [pi](https://github.com/mariozechner/pi-coding-agent) extension that replaces five built-in tools with enhanced versions. The extension is **symlinked** from `~/.pi/agent/extensions/pi-hashline-readmap` → this workspace, so changes here take effect immediately — no build/install step needed.

## Version Control: jj + GitHub

This repo uses [jj (Jujutsu)](https://martinvonz.github.io/jj/) as the VCS frontend over a git backend. jj does **not** maintain git branch pointers (`HEAD` is always detached). All commits land on anonymous changesets; named bookmarks (like `main`) are explicit labels.

### PR Workflow (jj + gh)

Because `gh pr create` requires a named git branch, the correct workflow for submitting changes as a PR is:

#### 1. Start a feature bookmark before you commit

```bash
# Create and switch to a feature bookmark
jj bookmark create feature/my-feature -r @
```

#### 2. Make your changes and describe the commit

```bash
# jj snapshots the working copy automatically; just describe it
jj describe -m "feat: my feature description"
```

#### 3. Advance to a new empty commit (seals the previous one)

```bash
jj new
```

#### 4. Push the feature bookmark to origin

```bash
jj git push --bookmark feature/my-feature
```

#### 5. Create the PR via gh

```bash
gh pr create \
  --title "feat: my feature description" \
  --body "..." \
  --base main \
  --head feature/my-feature
```

#### 6. After merge: clean up and update main

```bash
jj git fetch
jj bookmark set main -r 'main@origin'
jj bookmark delete feature/my-feature
```

### Direct-to-main (quick fixes only)

For trivial changes (typos, .gitignore tweaks, docs), it's acceptable to commit directly to `main`:

```bash
jj describe -m "chore: fix typo in README"
jj new
jj bookmark set main -r @-
jj git push --bookmark main
```

### Megapowers-managed commits

When working under the megapowers workflow (`/mega on`), **do not run jj or git commands manually**. Phase transitions automatically commit and manage bookmarks. Use `megapowers_signal` actions instead.

## Development

### Prerequisites

```bash
node --version   # >= 20
npm install      # install dependencies
```

Optional CLI tools used by the extension:

```bash
brew install ast-grep          # sg tool (M3)
brew install difftastic        # enhanced diffs
brew install shellcheck yq scc # linting/analysis utilities
```

### Running tests

```bash
npm test             # vitest run (39 tests)
npm run typecheck    # tsc --noEmit
```

Tests live in `tests/`. All test files must pass before pushing.

### Project structure

```
index.ts              # Extension entry point — registers all tools + bash filter
src/
  read.ts             # read tool: hashlines + structural maps + symbol lookup
  edit.ts             # edit tool: hash-anchored surgical edits
  edit-diff.ts        # diff computation and patch application
  grep.ts             # grep tool: regex search with hashlined results
  sg.ts               # sg tool: ast-grep wrapper with hashlined output
  hashline.ts         # LINE:HASH generation (xxhash-wasm)
  map-cache.ts        # in-memory map cache (keyed by mtime)
  path-utils.ts       # path resolution helpers
  runtime.ts          # AbortSignal helpers
  readmap/            # structural map engine
    mapper.ts         # language dispatch + ctags + fallback chain
    symbol-lookup.ts  # symbol-addressable read (find by name)
    formatter.ts      # FileMap → human-readable text
    language-detect.ts
    types.ts
    enums.ts
    constants.ts
    mappers/          # per-language implementations (17 languages)
  rtk/                # bash output compression
    bash-filter.ts    # routing entry point (command detection)
    index.ts          # technique registry
    ansi.ts           # ANSI escape stripping
    test-output.ts    # test runner summarizer
    build.ts          # build tool error extractor
    git.ts            # git output compressor
    linter.ts         # linter result summarizer
    truncate.ts       # smart truncation
prompts/
  read.md             # read tool schema description
  edit.md             # edit tool schema description
  sg.md               # sg tool schema description
tests/                # 39 test files — one per feature area
```

### Adding a new language mapper

1. Create `src/readmap/mappers/<lang>.ts` — export a function matching `Mapper` type
2. Register it in `src/readmap/mapper.ts` in the `MAPPERS` record
3. Add the file extension in `src/readmap/language-detect.ts`
4. Write tests in `tests/readmap-mappers-files.test.ts`

### Adding a new bash compression technique

1. Create `src/rtk/<technique>.ts` — export a `matches(cmd: string): boolean` and `compress(output: string): string`
2. Register it in `src/rtk/index.ts`
3. Write tests in `tests/bash-filter.test.ts`

## What NOT to commit

The `.gitignore` excludes:

- `node_modules/`, `dist/`, `build/`, `coverage/`, `.vite/`
- `.megapowers/` — megapowers workflow state (local only)
- `.pi/` — pi agent state
- `.npmrc`, `.zellij*` — local tool config
- Planning/internal docs: `ARCHITECTURE.md`, `BUILD-PLAN.md`, `DESIGN.md`, `PRD.md`, `ROADMAP.md`, `AGENT-NATIVE-TOOLS.md`, `docs/features/`

These live locally but are never pushed.

## Publishing

```bash
# Dry run — see what would be published
npm pack --dry-run

# Publish to npm
npm publish
```

The `files` field in `package.json` limits the tarball to: `index.ts`, `src/`, `prompts/`, `LICENSE`, `README.md`.

Install from npm:

```bash
pi install npm:pi-hashline-readmap
```

Install from git (no npm publish needed):

```bash
pi install git:github.com/coctostan/pi-hashline-readmap
```
