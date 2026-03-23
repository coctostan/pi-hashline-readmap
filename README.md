# pi-hashline-readmap

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/pi-hashline-readmap)](https://www.npmjs.com/package/pi-hashline-readmap)

A drop-in [pi](https://github.com/mariozechner/pi-coding-agent) extension that replaces the stock `read`, `edit`, `grep`, and `sg` tools with a unified toolset built for reliable agent coding. It also compresses noisy `bash` output so more context budget goes to code.

## Why use this instead of the stock tools?

### Safer edits

Stock read/search output is easy for a model to paraphrase or drift from. This package returns **`LINE:HASH|content` anchors** so follow-up edits target the exact line that was read:

```text
45:e4|router.addRoute("/api", handler);
```

Fewer accidental wrong-line edits, better resistance to file drift, more reliable surgical changes.

### Better navigation on large files

Reads can append a **structural map** showing classes, functions, methods, and line ranges — so the agent sees the shape of a file instead of scrolling blind.

### Direct symbol lookup

Instead of hunting with offsets:

```ts
read({ path: "src/server.ts", symbol: "handleRequest" })
read({ path: "src/router.ts", symbol: "Router.addRoute" })
```

Cuts tokens and reduces exploratory round-trips.

### Search results that are immediately editable

`grep` and `sg` output is hashline-anchored, so the agent can go straight from search to edit without a cleanup read in between.

### Less wasted context on noisy command output

`bash` outputs from test runners, builds, git, linters, Docker, package managers, and more are compressed to the parts that matter.

### One package, no overlapping-tool fights

A common pi problem is stacking multiple extensions that all want to own `read`, `grep`, or `edit` — leading to conflict and unpredictable behavior. This package unifies the overlapping improvements into one extension.

## What you get

### `read`

- `LINE:HASH|content` output
- Structural maps via `map: true` — supports **17 languages** (TypeScript, JavaScript, Python, Rust, Go, C, C++, Clojure, SQL, JSON, JSONL, Markdown, YAML, TOML, CSV)
- Automatic maps on truncated reads
- Symbol lookup via `symbol` param (dot notation for methods: `ClassName.methodName`)
- `map` and `symbol` are mutually exclusive; `symbol` cannot combine with `offset`/`limit`
- Image delegation, binary file detection, display-safe control character escaping
- Custom TUI rendering with symbol/map/warning badges

### `edit`

- Hash-verified anchored edits using `LINE:HASH` anchors from `read`/`grep`/`sg`
- Operations: `set_line`, `replace_lines`, `insert_after`, `replace`
- Compact diff and full diff support
- Mismatch diagnostics with context
- Custom TUI rendering with diff preview

### `grep`

- Hash-anchored match output, ready to feed directly into `edit`
- Context lines with deduped/merged windows
- `summary: true` mode for file-level match counts
- Truncation indicators when results hit the limit
- Custom TUI rendering with match distribution and truncation badges

### `sg`

- Wraps [ast-grep](https://ast-grep.github.io/) for structural code search
- Returns merged, hash-anchored match blocks grouped by file
- Ideal for structural search → edit workflows
- Custom TUI rendering
- Requires `ast-grep` installed (`brew install ast-grep`)

### `bash` output compression

Eleven specialized compressors for common command output:

| Compressor | What it handles |
|---|---|
| test-output | Test runner results (vitest, jest, pytest, etc.) |
| build | Build tool output (tsc, esbuild, webpack, etc.) |
| build-tools | Compiler/bundler noise |
| git | Git command output |
| linter | Linter results (eslint, shellcheck, etc.) |
| docker | Docker build/run output |
| package-manager | npm/yarn/pnpm install output |
| http-client | curl/wget output |
| transfer | rsync/scp output |
| file-listing | ls/find/tree output |
| truncate | Smart truncation for oversized output |

ANSI escape stripping runs on all bash output regardless.

## Example workflows

### Read → edit

```text
read({ path: "src/server.ts" })
```

```text
45:e4|router.addRoute("/api", handler);
```

```text
edit({
  path: "src/server.ts",
  edits: [
    {
      set_line: {
        anchor: "45:e4",
        new_text: 'router.addRoute("/api/v2", handler);'
      }
    }
  ]
})
```

### Symbol read

```text
read({ path: "src/server.ts", symbol: "handleRequest" })
```

Returns only that symbol's body, already hashlined and ready for editing.

### Read with a map

```text
read({ path: "src/large-file.ts", map: true })
```

Returns scoped hashlines plus a structural outline of the file.

### Search → edit with grep

```text
grep({ pattern: "addRoute", path: "src", literal: true })
```

```text
[3 matches in 2 files]
--- src/server.ts (2 matches) ---
src/server.ts:>>45:e4|router.addRoute("/api", handler);
```

Use the anchor directly in `edit`.

### Structural search with sg

```text
sg({ pattern: "console.log($$$ARGS)", lang: "typescript", path: "src" })
```

Returns hash-anchored AST matches grouped by file.

## Installation

### From npm

```bash
pi install npm:pi-hashline-readmap
```

### From GitHub

```bash
pi install git:github.com/coctostan/pi-hashline-readmap
```

### From a local clone

```bash
git clone https://github.com/coctostan/pi-hashline-readmap.git
cd pi-hashline-readmap
npm install
pi install .
```

## Requirements

- Node.js **>= 20**
- [pi](https://github.com/mariozechner/pi-coding-agent) with extension support

Optional CLI tools for full functionality:

```bash
brew install ast-grep          # required for sg tool
brew install difftastic        # enhanced diffs
brew install shellcheck yq scc # used by some compressors
```

## PTC structured output

All four tools expose machine-facing structured payloads at `details.ptcValue` alongside their human-facing `content[].text` output:

- **`read`** — path, line range, warnings, truncation info, symbol metadata, map status, per-line anchors
- **`grep`** — summary flag, total matches, per-match records with anchors
- **`sg`** — per-file match ranges and anchored lines
- **`edit`** — ok/fail, summary, diff, changed line, warnings, noop edits

Hashes and anchors are tied to raw file content. `display` fields are escaped for safe rendering; `raw` fields preserve the underlying file text.

### PTC tool policy contract

The package exports a machine-readable policy contract via `HASHLINE_TOOL_PTC_POLICY` and `getHashlineToolPtcPolicy()`:

```ts
import { HASHLINE_TOOL_PTC_POLICY } from "pi-hashline-readmap";
```

- `read` and `grep` are safe-by-default, read-only helpers.
- `sg` is opt-in, read-only.
- `edit` is not safe-by-default and is mutating/write-capable.

`pi-prompt-assembler` may optionally consume this contract, but `pi-hashline-readmap` does not require it to function.

### EventBus integration

On load, the extension emits tool executor references for downstream PTC consumers:

```ts
pi.events.emit("hashline:tool-executors", { read, edit, grep, sg });
```

Also available at `globalThis.__hashlineToolExecutors`.

## Development

```bash
npm install
npm test             # 483 tests across 92 files
npm run typecheck    # tsc --noEmit
```

### Project structure

```
index.ts                  # Extension entry point — registers tools + bash filter
src/
  read.ts                 # read tool implementation
  edit.ts                 # edit tool implementation
  edit-diff.ts            # diff computation and patch application
  grep.ts                 # grep tool implementation
  sg.ts                   # ast-grep wrapper
  hashline.ts             # LINE:HASH anchor generation (xxhash-wasm)
  map-cache.ts            # mtime-keyed structural map cache
  path-utils.ts           # path resolution helpers
  runtime.ts              # AbortSignal helpers
  binary-detect.ts        # binary file detection
  ptc-value.ts            # structured PTC value builders
  ptc-tool-policy.ts      # PTC tool policy contract
  read-output.ts          # read output formatting
  grep-output.ts          # grep output formatting
  sg-output.ts            # sg output formatting
  edit-output.ts          # edit output formatting
  read-render-helpers.ts  # read TUI renderCall/renderResult
  grep-render-helpers.ts  # grep TUI renderCall/renderResult
  edit-render-helpers.ts  # edit TUI renderCall/renderResult
  readmap/                # Structural map engine
    mapper.ts             #   language dispatch + mapper registry
    symbol-lookup.ts      #   symbol-addressable read
    formatter.ts          #   FileMap → human-readable text
    language-detect.ts    #   file extension → language mapping
    types.ts              #   shared types
    enums.ts              #   symbol kind enums
    constants.ts          #   shared constants
    mappers/              #   16 per-language mapper implementations
  rtk/                    # Bash output compression
    bash-filter.ts        #   command detection + routing
    index.ts              #   technique registry
    ansi.ts               #   ANSI escape stripping
    test-output.ts        #   test runner summarizer
    build.ts              #   build output extractor
    build-tools.ts        #   compiler/bundler compressor
    git.ts                #   git output compressor
    linter.ts             #   linter result summarizer
    docker.ts             #   Docker output compressor
    package-manager.ts    #   npm/yarn/pnpm compressor
    http-client.ts        #   curl/wget compressor
    transfer.ts           #   rsync/scp compressor
    file-listing.ts       #   ls/find/tree compressor
    truncate.ts           #   smart truncation
prompts/                  # Tool schema prompt files
tests/                    # 92 vitest test files
```

## Publishing

```bash
npm pack --dry-run    # preview
npm publish           # publish to npm
```

The published package includes: `index.ts`, `src/`, `prompts/`, `LICENSE`, `README.md`.

## Credits

Combines and adapts ideas from:

- [pi-hashline-edit](https://github.com/nicholasgasior/pi-hashline-edit) — hash-anchored editing
- [pi-read-map](https://github.com/nicholasgasior/pi-read-map) — structural file maps
- [pi-rtk](https://github.com/mcowger/pi-rtk) — bash output compression

## License

MIT — see [LICENSE](LICENSE).
