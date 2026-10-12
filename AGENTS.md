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

### Independent current-host compatibility

`npm test` and `npm run typecheck` retain the locked 0.84.2 development-host lane. `.github/workflows/pi-compatibility.yml` additionally provisions exactly Pi 1.1.0 into runner temporary storage. Its npm 11/12 matrix retains both packing-output contracts. Neither host lane replaces the other.

Reproduce the independent lane without a global Pi, provider, or credentials. Pin the complete relevant Pi dependency graph, since its internal caret ranges otherwise permit newer releases:

```bash
host_prefix=$(mktemp -d)
trap 'rm -rf -- "$host_prefix"' EXIT
npm install --prefix "$host_prefix" --no-save --package-lock=false --no-audit --no-fund \
  @earendil-works/pi-coding-agent@1.1.0 \
  @earendil-works/pi-agent-core@1.1.0 \
  @earendil-works/pi-ai@1.1.0 \
  @earendil-works/pi-tui@1.1.0 \
  @earendil-works/pi-mcp@1.1.0 \
  @earendil-works/pi-codemode@1.1.0 \
  @earendil-works/pi-telemetry@1.1.0 \
  @earendil-works/chord@1.1.0
export PI_COMPAT_HOST="$host_prefix/node_modules/@earendil-works/pi-coding-agent"
PI_COMPAT_REQUIRE_NU=1 npm test -- tests/pi-host-null-pipeline.test.ts tests/pi-host-codemode.test.ts tests/pi-host-codemode-boundaries.test.ts tests/pi-host-image-persistence.test.ts tests/pi-host-permission.test.ts tests/pi-host-cancellation.test.ts tests/pi-host-declarations.test.ts tests/pi-compat-host-selection.test.ts tests/pi-host-codemode-host-selection.test.ts tests/pi-host-recipe-*.test.ts tests/pi-host-store-*.test.ts tests/pi-host-codemode-loadout.test.ts tests/pi-host-codemode-benchmark.test.ts
npm run typecheck:pi-host
```

The explicit-host guard in `scripts/pi-compat-host.mjs`, the null-pipeline version constant, and the CI pin must stay synchronized. Explicit wrong/missing hosts or missing required executors fail without local fallback. `PI_COMPAT_REQUIRE_NU=1` still requires Nu registration; this issue does not implement the separate Nu deprecation work.

`tests/pi-host-codemode-boundaries.test.ts` and the focused image/permission/cancellation tests load this checkout through the selected host's real loader, runner, wrappers, argument-validation pipeline, and QuickJS executor. They cover native image values, magic-byte dispatch, forwarded attachments and saved-file byte/MIME fidelity, nested permission blocking without mutation, cancellation propagation using a deterministic execution fixture, raw Bash/presentation separation, coded/default errors, required nulls, anchor chains, and private/visible hygiene. The older `tests/pi-host-codemode.test.ts` deliberately remains supplementary executor coverage with locked-host extension imports; it is not independent extension-load evidence. The implicit locked host lacks codemode and skips codemode-only cases.

Issue #265's recipe tests execute the labeled scripts from docs/codemode-recipes.md through the same selected-host subprocess harness. Its program branch uses the actual Pi loader, wrappers, runToolCall pipeline, codemode executor, prepareLoadout hook, and SessionManager store entries. The harness supplies an all-Hashline-tools fixture loadout to the real hook; it does not test CLI selection resolution or full AgentSession orchestration. It verifies compact projections, real read variants, private anchor chains, asynchronous hidden-tool discovery, and store commit/discard/branch/reopen behavior. The benchmark compares these deterministic normal and codemode-only fixture loadouts without provider credentials; it does not establish model quality, provider latency/cost, or every AgentSession lifecycle branch. Implicit locked-host skips are not independent-host evidence.

`npm run typecheck:pi-host` compiles `index.ts`, all `src/` files, and a typed host-boundary fixture with Pi/typebox imports resolved from the independent installation. It audits loaded Pi declaration paths and pinned Pi graph versions. The negative fixture is compiled only when explicitly passed by its regression test and must produce TS2322. The locked `npm run typecheck` stays unchanged. The independent check retains project compiler settings (including `skipLibCheck`), and does not claim exhaustive type safety for every existing loosely typed compatibility adapter or third-party declaration internals.

Exhaustive nested-union auditing, every runner lifecycle branch, and provider/AgentSession integration remain outside these deterministic checks. No registered tool is deliberately excluded from the shared guard. Required-null preparation errors retain the host-boundary metadata limitation documented in [structured-output null contracts](docs/structured-output.md#required-nulls-at-the-host-boundary). See [codemode integration](docs/structured-output.md#codemode-integration) for script-facing contracts and [fresh-session verification](docs/codemode-verification.md) for the live completion gate. Running sessions do not hot-reload edits: automated checks cannot replace a freshly loaded live Pi 1.1.0 session.

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
