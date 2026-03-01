# pi-hashline-readmap

A unified [pi](https://github.com/mariozechner/pi-coding-agent) extension that replaces five built-in tools (`read`, `edit`, `grep`, `sg`, `bash` output) with enhanced versions — hash-anchored editing, structural code maps, AST-grep integration, and intelligent bash output compression. One extension, zero conflicts.

## Why

Several popular pi extensions each register overlapping tools. Only one `read` tool can win — whichever loads last overwrites the rest. You had to choose between:

- **Hash-anchored editing** — content-addressable lines (`LINE:HASH|`) for drift-proof surgical edits
- **Structural file maps** — AST-based symbol tables for navigating large codebases
- **AST-grep search** — structural code search with hashlined output
- **Bash output compression** — smart filtering of test/build/git/linter output

This extension combines all four into a single package. Everything works together, nothing conflicts.

## Features

### 🔗 `read` — Hash-anchored file reading + structural maps + symbol lookup

Every line is prefixed with a `LINE:HASH|` anchor:

```
1:a3f|import { readFile } from "node:fs";
2:b71|import { resolve } from "node:path";
3:05|
4:c2e|export function loadConfig(path: string) {
```

**Structural maps on large files** — when a file is truncated (>2000 lines or >50KB), a structural map is automatically appended:

```
[Showing lines 1-2000 of 5432. Use offset=2001 to continue.]

## File Map
- class EventEmitter (lines 1-245)
  - method on (lines 12-45)
  - method emit (lines 47-89)
- class DatabaseConnection (lines 250-890)
  - method connect (lines 255-310)
  - method query (lines 312-450)
```

Maps support **17 languages** including TypeScript, Python, Rust, Go, C/C++, Java, Clojure, SQL, YAML, TOML, Markdown, and more. Maps are cached in memory by file modification time.

**Symbol-addressable reads** — jump directly to a function or class by name:

```
read("src/server.ts", { symbol: "handleRequest" })
→ returns just that function, hashlined, with [Symbol: handleRequest (function), lines 45-89 of 500]

read("src/server.ts", { symbol: "Router.addRoute" })
→ dot notation for methods inside classes
```

### ✏️ `edit` — Hash-verified surgical edits

Use `LINE:HASH` anchors from `read` or `grep` output to make precise, atomic edits:

- `set_line` — replace or delete a single line
- `replace_lines` — replace a range
- `insert_after` — insert after an anchor
- `replace` — global string replace (fallback)

Hash verification ensures edits target the exact line you intended — no drift, no surprises.

### 🔍 `grep` — Hash-anchored search

Search results come with `LINE:HASH|` anchors, ready to feed directly into `edit`:

```
src/server.ts:>>45:e4|  router.addRoute("/api", handler);
src/client.ts:>>12:7d|  const router = new Router();
```

Supports regex patterns, literal search, glob filtering, case-insensitive mode, and context lines.

### 🌳 `sg` — AST-grep with hashlined results

Structural code search using [ast-grep](https://ast-grep.github.io/) — find code by AST pattern, not raw text:

```
sg({ pattern: "console.log($$$ARGS)", path: "src/" })

--- src/debug.ts ---
>>12:a3|  console.log("request", req.url);
>>45:f1|  console.log(error.message, error.stack);
```

All results come with hash anchors for direct use with `edit`.

### 📦 Bash output compression

Automatically intercepts `bash` tool results and applies intelligent compression:

| Output type | What it does |
|------------|-------------|
| **Test runners** (vitest, jest, pytest, go test) | Extracts pass/fail summary, shows only failures |
| **Build tools** (tsc, esbuild, cargo, go build) | Extracts error count and diagnostics |
| **Git** (diff, log, status) | Preserves structure, strips noise |
| **Linters** (eslint, clippy, pylint) | Summarizes findings |
| **ANSI codes** | Stripped from all output |

This saves significant context window space on verbose command output while preserving all actionable information.

## Installation

### From npm

```bash
pi install npm:pi-hashline-readmap
```

### From git

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

## Configuration

No configuration required. The extension registers its tools on load and hooks bash output filtering automatically.

To see bash compression savings, set the environment variable:

```bash
PI_RTK_SAVINGS=1 pi
```

## Development

```bash
npm install          # install dependencies
npm test             # run tests (27 test files)
npm run typecheck    # TypeScript type check
```

### Project structure

```
index.ts                    # Extension entry point
src/
  read.ts                   # Read tool with hashlines + maps + symbol lookup
  edit.ts                   # Edit tool with hash-verified anchors
  edit-diff.ts              # Diff computation for edit operations
  grep.ts                   # Grep tool with hashlined results
  sg.ts                     # AST-grep tool wrapper
  hashline.ts               # LINE:HASH computation (xxhash)
  map-cache.ts              # In-memory map cache (mtime-based)
  path-utils.ts             # Path resolution utilities
  runtime.ts                # Abort signal helpers
  readmap/                  # Structural map generation (17 languages)
    mapper.ts               # Language dispatch + fallback chain
    symbol-lookup.ts        # Symbol-addressable read engine
    formatter.ts            # Map → text formatting
    language-detect.ts      # File extension → language detection
    mappers/                # Per-language mappers
      typescript.ts         # TypeScript/JavaScript (ts-morph)
      python.ts             # Python (regex-based)
      rust.ts               # Rust (tree-sitter)
      go.ts                 # Go (regex-based)
      cpp.ts                # C++ (tree-sitter)
      c.ts                  # C (regex-based)
      clojure.ts            # Clojure (tree-sitter)
      markdown.ts           # Markdown (regex-based)
      sql.ts, json.ts, ...  # Additional format mappers
  rtk/                      # Bash output compression
    bash-filter.ts          # Command routing entry point
    index.ts                # Technique registry
    ansi.ts                 # ANSI escape code stripping
    test-output.ts          # Test runner compression
    build.ts                # Build tool compression
    git.ts                  # Git output compression
    linter.ts               # Linter output compression
    truncate.ts             # Smart truncation
prompts/
  read.md                   # Read tool description/prompt
  edit.md                   # Edit tool description/prompt
  sg.md                     # AST-grep tool description/prompt
tests/                      # 27 test files covering all features
```

## Credits

This extension combines and adapts code from three upstream projects:

- **[pi-hashline-edit](https://github.com/nicholasgasior/pi-hashline-edit)** (v0.3.0, MIT) by RimuruW — hash-anchored read/edit/grep
- **[pi-read-map](https://github.com/nicholasgasior/pi-read-map)** (v1.3.0, MIT) by Whamp — structural file maps with 17 language mappers
- **[pi-rtk](https://github.com/mcowger/pi-rtk)** (v0.1.3, MIT) by mcowger — bash output techniques (ANSI stripping, test/build/git/linter compression)

## License

[MIT](./LICENSE)
