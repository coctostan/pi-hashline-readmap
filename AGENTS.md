# AGENTS.md — Developer & Agent Guide

Repo-local guide for working on `pi-hashline-readmap`.

A Pi extension that replaces Pi's `read`, `edit`, `grep`, `write`, `ls` and `find` with hash-anchored, structure-aware versions, adds `ast_search`, and compresses `bash` output. It must keep anchored read→edit chains exact and stay loadable on both the locked and the current Pi host.

## Space
type: dev
kits: core, dev
root: space/
neighbors:
  codegraph: coctostan/pi-codegraph
git: { merge: agent, push: free, main-direct: process-only }

## Hard rules
- Name an arc or slice by its title each time you mention it, in a reply, a file, a PR or a commit message: a slice as `slice <n> (<Title>)`, an arc as `<slug> (<Title>)`. One cited in passing, as a source or a precedent, is a mention too. In an arc file, `blocked-by` and `From slice` numbers stay bare.
- Shrink a tool result only when the full result stays recoverable: accuracy outranks token savings.

## Prove
- Checks: `npm test -- tests/<file>.test.ts`; `npm test && npm run typecheck`
- Real artifact: no server; in a scratch directory run `pi --no-extensions --no-session -e <repo>/index.ts --model openai-codex/gpt-6-luna --mode json -p "<a prompt that makes the model call the tool>"`, a fresh process per drive since sessions don't hot-reload · drive through the prompt · observe the `tool_execution_end` events in the JSON stream (`read` on a 3-line file returns `1:1df|export function alpha() {`) and any files the tools changed · instances run side by side but share the map cache at `~/.cache/pi-hashline-readmap/maps`. Host-compatibility changes also run the host tests against an override install, by "Host compatibility".

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

### History

`.megapowers/` holds megapowers's history up to 2026-10-14: read it, never edit it. (Local only: `.gitignore` excludes it.)

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

### Host compatibility

The extension is tested against one host: the Pi 1.4.0 that `package-lock.json` locks ([ruling 0005](space/decisions/0005-one-tested-host.md)). `npm test` and `npm run typecheck` run against it, and so does `.github/workflows/pi-compatibility.yml`, whose npm 11/12 matrix retains both packing-output contracts. CI provisions no second Pi.

To try a newer Pi before the lock moves, point `PI_COMPAT_HOST` at its `pi-coding-agent` directory: the host tests then run against that install and expect its own version. Unset, it selects the locked host. Pin the complete Pi dependency graph, since its internal caret ranges otherwise permit mixed releases; no global Pi, provider, or credentials are needed:

```bash
version=<the Pi version to try>
host_prefix=$(mktemp -d)
trap 'rm -rf -- "$host_prefix"' EXIT
npm install --prefix "$host_prefix" --no-save --package-lock=false --no-audit --no-fund \
  @earendil-works/pi-coding-agent@$version \
  @earendil-works/pi-agent-core@$version \
  @earendil-works/pi-ai@$version \
  @earendil-works/pi-tui@$version \
  @earendil-works/pi-mcp@$version \
  @earendil-works/pi-codemode@$version \
  @earendil-works/pi-telemetry@$version
export PI_COMPAT_HOST="$host_prefix/node_modules/@earendil-works/pi-coding-agent"
PI_COMPAT_REQUIRE_NU=1 npm test -- tests/pi-host-*.test.ts tests/pi-compat-host-selection.test.ts tests/package-tarball-dist.test.ts
npm run typecheck:pi-host
```

`selectCompatHost` in `scripts/pi-compat-host.mjs` is the one place a host is selected. A missing override install fails without falling back to the locked host, and an explicit host without a codemode executor fails the codemode tests instead of skipping them. `PI_COMPAT_REQUIRE_NU=1`, set in CI, still requires Nu registration during the deprecation period. Bundled Nu is deprecated, not removed; its [removal gate and checklist](docs/nu-deprecation.md) require at least one published deprecation release before a separately announced breaking removal release. Do not silently skip the mandatory assertions.

`tests/pi-host-codemode-boundaries.test.ts` and the focused image/permission/cancellation tests load this checkout through the selected host's real loader, runner, wrappers, argument-validation pipeline, and QuickJS executor. They cover native image values, magic-byte dispatch, forwarded attachments and saved-file byte/MIME fidelity, nested permission blocking without mutation, cancellation propagation using a deterministic execution fixture, raw Bash/presentation separation, coded/default errors, required nulls, anchor chains, and private/visible hygiene. The older `tests/pi-host-codemode.test.ts` deliberately remains supplementary executor coverage with locked-host extension imports; it is not extension-load evidence. Plain `npm test` runs all of them.

Issue #265's recipe tests execute the labeled scripts from docs/codemode-recipes.md through the same selected-host subprocess harness. Its program branch uses the actual Pi loader, wrappers, runToolCall pipeline, codemode executor, prepareLoadout hook, and SessionManager store entries. The harness supplies an all-Hashline-tools fixture loadout to the real hook; it does not test CLI selection resolution or full AgentSession orchestration. It verifies compact projections, real read variants, private anchor chains, asynchronous hidden-tool discovery, and store commit/discard/branch/reopen behavior. The benchmark compares these deterministic normal and codemode-only fixture loadouts without provider credentials; it does not establish model quality, provider latency/cost, or every AgentSession lifecycle branch.

Issue #266 adds source inspection, file-discovery composition, and external-CLI JSON migration recipes to the same labeled docs and selected-host harness. Nu remains available with its existing execution contract. The new tests retain failures, bounded-input incompleteness, and native Bash truncation; they use credential-free fixtures, not live GitHub/provider calls. Tool discovery/selection limitations of the fixture loadout remain unchanged.

`npm run typecheck:pi-host` compiles `index.ts`, all `src/` files, and a typed host-boundary fixture with Pi/typebox imports resolved from the selected installation. It audits loaded Pi declaration paths and that the selected Pi graph shares one version; `tests/pi-host-declarations.test.ts` runs it under `npm test`. The negative fixture is compiled only when explicitly passed by its regression test and must produce TS2322. `npm run typecheck` stays the project's own check. The selected-host check retains project compiler settings (including `skipLibCheck`), and does not claim exhaustive type safety for every existing loosely typed compatibility adapter or third-party declaration internals.

Exhaustive nested-union auditing, every runner lifecycle branch, and provider/AgentSession integration remain outside these deterministic checks. No registered tool is deliberately excluded from the shared guard. Required-null preparation errors retain the host-boundary metadata limitation documented in [structured-output null contracts](docs/structured-output.md#required-nulls-at-the-host-boundary). See [codemode integration](docs/structured-output.md#codemode-integration) for script-facing contracts and [fresh-session verification](docs/codemode-verification.md) for the live completion gate. Running sessions do not hot-reload edits: automated checks cannot replace a freshly loaded live Pi 1.4.0 session.

## Build contract

Pi loads this extension through jiti, which transforms the ~107-module TypeScript graph file by file at startup. `npm run build` (`scripts/build.mjs`) bundles `index.ts` into a single `dist/index.js` instead; `docs/startup-performance.md` records the measurements behind that decision.

- `dist/index.js` is an esbuild bundle in ESM syntax with every npm package external (`packages: "external"`). The build fails if the output loses ESM syntax, inlines `@earendil-works/*` or `typebox`, or contains relative import specifiers.
- The bundle only runs through the host loader: installed extension trees contain neither Pi's peers nor `typebox`, so `@earendil-works/*` and `typebox` must resolve through the host's jiti transform path and its resolver alias map. A native Node import of the bundle from such a tree fails. This relies on undocumented jiti/Pi loader behaviour; `tests/pi-host-dist-entry.test.ts` (built entry, unbuilt fallback, and a negative control that proves native import fails without the host) runs under `npm test` on the selected host, so a loader change fails CI.
- `dist/package.json` is exactly `{"type":"commonjs"}`. This is defensive: it makes any native-import attempt fail fast (`Cannot use import statement outside a module`) so a native-first loader falls back to jiti's transform path and the alias map rather than resolving peers elsewhere. PR #226 reported the typing as required; measured on the locked Pi 1.4.0 host (macOS, 2026-11-01), Pi's loader transforms and alias-resolves the bundle regardless of the typing (also with `JITI_TRY_NATIVE=true`), so it is not load-bearing there. The negative control records this per host (`observed <variant> host-load=`) without asserting it; keep the typing unless a host-loader test shows it breaks loading.
- `package.json` `pi.extensions` is `["./dist/index.js"]`. Pi skips manifest entries that do not exist and then falls back to the package's `index.ts`, so an unbuilt checkout still works. Direct `-e ./index.ts` and absolute-path settings entries bypass the manifest and keep loading source.
- `prepare` runs `node scripts/build.mjs --optional`: git installs build `dist/`, and a missing esbuild or a failed build warns and leaves no `dist/` instead of failing the install. `prepublishOnly` runs the strict build, so `npm publish` fails rather than shipping a tarball without `dist/`. Registry installs receive the prebuilt `dist/` from the tarball (`files` includes `dist/`; `tests/package-tarball-dist.test.ts` packs, extracts and loads it). `npm test` never builds; build-contract tests build into temp directories and call `npm pack --ignore-scripts`.
- A `dist/` is a snapshot: anything that loads this checkout through its manifest (a local-path package install, `-e <repo dir>`) runs the bundle from the last `npm install`/`npm run build`, not your current `src/` edits. Rebuild or delete `dist/` after editing; the absolute `index.ts` settings entry described above is unaffected.
- Prompts and outline scripts resolve from the package root via `src/package-root.ts` in both the `src/` and `dist/` layouts.
- A repo-level `dist/` is normal (`npm ci`/`npm install` run `prepare`), so it must never change what tests exercise: host-compatibility harnesses (`tests/pi-host-null-pipeline.test.ts`, `tests/helpers/selected-host-codemode.mjs`) load `index.ts` explicitly instead of the package directory, and tests that run `npm pack` pass `--ignore-scripts`. `tests/repo-dist-isolation.test.ts` guards both.
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
