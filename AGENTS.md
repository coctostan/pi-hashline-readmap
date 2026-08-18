# AGENTS.md — Developer & Agent Guide

Repo-local guide for working on `pi-hashline-readmap`.

## What This Project Is

`pi-hashline-readmap` is a unified [pi](https://github.com/mariozechner/pi-coding-agent) extension that replaces several built-in tools with enhanced versions:

- `read` — hashlined reads, structural maps, symbol-addressable reads
- `edit` — hash-anchored edits with semantic diff summaries
- `grep` — hashlined search results
- `ast_search` — ast-grep wrapper with hashlined output
- `bash` filtering — command-aware output compression

The extension is loaded via an absolute path entry in `~/.pi/agent/settings.json`'s `extensions` array (pointing at this workspace's `index.ts`), so **new agent sessions** pick up local edits automatically. Running sessions do **not** hot-reload the module graph — restart any in-flight agent session to see changes take effect.

## Version Control

This repo is currently operated as a normal git repo with GitHub PRs. Do not assume `jj` is configured here.

Standard flow:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/my-feature
# edit / test
git add -A
git commit -m "feat: my feature description"
git push -u origin feat/my-feature
gh pr create --base main --head feat/my-feature
```

After merge:

```bash
git checkout main
git pull --ff-only origin main
git branch -d feat/my-feature
```

Use `git branch -D` only after verifying the work is on `origin/main`.

### Megapowers-managed work

When `/mega on` is active, do not run ad-hoc branch/commit/push commands outside the allowed workflow moments. Use megapowers tools for phase changes and TDD signals. Post-merge cleanup on local `main` is the main exception.

## Development

Prereqs:

```bash
node --version   # >= 22.19.0
npm install
```

Useful optional tools:

```bash
brew install ast-grep
brew install difftastic
brew install shellcheck yq scc
```

Validation:

```bash
npm test
npm run typecheck
```

## Source map

- `index.ts` — extension entry point
- `src/read.ts`, `src/edit.ts`, `src/grep.ts`, `src/sg.ts`, `src/nu.ts` — core tool implementations
- `src/*-output.ts`, `src/*-render-helpers.ts` — tool result shaping / rendering
- `src/readmap/` — structural mapping, symbol lookup, language detection, per-language mappers
- `src/rtk/` — bash output routing and compression techniques
- `prompts/` — tool prompt/schema docs
- `scripts/` — helper scripts used by readmap internals
- `tests/` — feature-focused tests and fixtures

## Common changes

### New language mapper

1. Add `src/readmap/mappers/<lang>.ts`
2. Register it in `src/readmap/mapper.ts`
3. Update `src/readmap/language-detect.ts`
4. Add tests in `tests/readmap-mappers-files.test.ts` and any focused integration tests needed
5. Set `export const MAPPER_VERSION = 1` in the new mapper file. Bump it any time the mapper's output shape changes so the persistent map cache (`src/persistent-map-cache.ts`) invalidates stale entries.

### New bash compression technique

1. Add implementation under `src/rtk/`
2. Register it in `src/rtk/index.ts`
3. Add/update focused `tests/rtk-*.test.ts`
4. Verify `tests/bash-filter.test.ts` still covers the routing correctly

### Tool output contract change

When changing `read`, `edit`, `grep`, or `ast_search` output:

1. Update the relevant `*-output.ts` / render helper modules
2. Update `prompts/` docs if the contract changed
3. Add/update tests that pin user-visible behavior
4. Check `README.md` examples if behavior changed materially
5. If the change affects a mapper's output shape, bump that mapper's `MAPPER_VERSION` in `src/readmap/mappers/<lang>.ts` so the persistent map cache invalidates stale entries.

## Local-only / ignored state

The repo intentionally ignores or treats as local-only state such as:

- `node_modules/`, `dist/`, `build/`, `coverage/`, `.vite/`, `tmp/`, `.cache/`
- `.megapowers/`, `.pi/`, `.kotadb/`, `.gh-status.json`
- editor/machine-local files like `.vscode/`, `.idea/`, `.zellij*`, `.npmrc`
- local planning docs like `ARCHITECTURE.md`, `BUILD-PLAN.md`, `DESIGN.md`, `PRD.md`, `ROADMAP.md`, `AGENT-NATIVE-TOOLS.md`, `docs/features/`
- transient artifacts like `*.log`, `*.tgz`, `*.tsbuildinfo`, `.env*`

Delete temporary debugging files before finishing.

## Publishing

```bash
npm pack --dry-run
npm publish
```

Install from npm:

```bash
pi install npm:pi-hashline-readmap
```

Install from git:

```bash
pi install git:github.com/coctostan/pi-hashline-readmap
```
