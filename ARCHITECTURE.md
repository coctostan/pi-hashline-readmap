# Architecture — pi-hashline-readmap

## Design Principle
**Three upstream libraries, one unified extension.** Hashline-edit owns the read/edit/grep tool trio. Read-map's mapper code is a pure-function library with no pi API dependency. RTK's bash output techniques are standalone filter functions. The integration is surgical:
- ~15 lines in hashline's `registerReadTool` to detect truncation and append a structural map
- ~30 lines in `index.ts` to hook `tool_result` events and apply RTK's bash filters
- Zero changes to read-map mappers, hashline edit/grep, or RTK filter functions

## System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   pi-hashline-readmap                          │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                  index.ts                             │      │
│  │  registerReadTool(pi)                                 │      │
│  │  registerEditTool(pi)                                 │      │
│  │  registerGrepTool(pi)                                 │      │
│  │  pi.on("tool_result") → bashFilter()                  │      │
│  └──────────────┬────────────────────────────────────────┘      │
│                 │                                               │
│  ┌──────────────▼────────────────────────────────────────┐      │
│  │              src/read.ts                               │      │
│  │                                                        │      │
│  │  read(path, offset?, limit?, symbol?)                  │      │
│  │    ├── resolve path, detect binary/image               │      │
│  │    ├── read file, apply offset/limit                   │      │
│  │    ├── hash each line → LINE:HASH|content              │      │
│  │    ├── detect truncation                               │      │
│  │    ├── IF symbol param: lookup in map, re-read         │      │
│  │    └── IF truncated + no offset/limit:                 │      │
│  │        └── generateMap() → formatWithBudget()          │      │
│  └──────────────┬────────────────────────────────────────┘      │
│                 │                                               │
│  ┌──────────────▼────────────────────────────────────────┐      │
│  │          src/readmap/ (from pi-read-map)               │      │
│  │                                                        │      │
│  │  mapper.ts ─── language dispatch + fallback            │      │
│  │  formatter.ts ─ budget-aware map formatting            │      │
│  │  language-detect.ts ─ extension → language             │      │
│  │  types.ts ─── FileMap, FileSymbol interfaces           │      │
│  │  enums.ts ─── SymbolKind, DetailLevel                  │      │
│  │  constants.ts ─ thresholds (2000 lines, 50KB)          │      │
│  │                                                        │      │
│  │  mappers/                                              │      │
│  │    typescript.ts (ts-morph)                             │      │
│  │    python.ts    (subprocess → python_outline.py)        │      │
│  │    go.ts        (subprocess → go_outline.go)            │      │
│  │    rust.ts      (tree-sitter)                           │      │
│  │    cpp.ts       (tree-sitter)                           │      │
│  │    clojure.ts   (tree-sitter)                           │      │
│  │    c.ts         (regex)                                 │      │
│  │    sql.ts       (regex)                                 │      │
│  │    json.ts      (jq subprocess)                         │      │
│  │    jsonl.ts     (streaming parser)                      │      │
│  │    yaml.ts      (regex)                                 │      │
│  │    toml.ts      (regex)                                 │      │
│  │    csv.ts       (in-process parser)                     │      │
│  │    markdown.ts  (regex)                                 │      │
│  │    ctags.ts     (universal-ctags fallback)              │      │
│  │    fallback.ts  (grep-based final fallback)             │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  src/edit.ts ─── hash-verified surgical edits          │      │
│  │  src/edit-diff.ts ── diff utilities                    │      │
│  │  src/grep.ts ─── hash-anchored grep                    │      │
│  │  src/hashline.ts ── xxHash32 line hashing              │      │
│  │  src/path-utils.ts ── CWD-relative path resolve        │      │
│  │  src/runtime.ts ─── abort signal helpers               │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  src/rtk/ (from pi-rtk — bash output only)             │      │
│  │                                                        │      │
│  │  bash-filter.ts ── entry: detect command type, route   │      │
│  │  techniques/                                           │      │
│  │    ansi.ts ──────── strip ANSI color codes             │      │
│  │    build.ts ─────── filter build output (tsc, cargo)   │      │
│  │    test-output.ts ─ aggregate test results             │      │
│  │    git.ts ────────── compact diffs, status, logs       │      │
│  │    linter.ts ─────── aggregate lint errors by rule     │      │
│  │    truncate.ts ───── smart truncation                  │      │
│  │                                                        │      │
│  │  NOT included (incompatible with hashlines):           │      │
│  │    ✗ source.ts (source code filtering)                 │      │
│  │    ✗ search.ts (search result grouping)                │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  scripts/                                              │      │
│  │    python_outline.py ── Python AST extraction           │      │
│  │    go_outline.go ────── Go AST extraction               │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  prompts/                                              │      │
│  │    read.md ─── Read tool description template           │      │
│  │    edit.md ─── Edit tool description template           │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

### Small File Read (≤2000 lines, ≤50KB)
```
read("utils.ts")
  → resolve path
  → detect not binary/image
  → read file lines
  → hash each line → "LINE:HASH|content"
  → no truncation → return directly
```

### Large File Read (>2000 lines or >50KB)
```
read("checker.ts")
  → resolve path
  → detect not binary/image
  → read file lines
  → apply default limit (2000 lines)
  → hash each line → "LINE:HASH|content"
  → truncation detected, no offset/limit
  → generateMap("checker.ts")
    → detectLanguage → "typescript"
    → typescriptMapper (ts-morph)
    → FileMap { symbols, imports, totalLines, ... }
  → formatFileMapWithBudget(fileMap)
    → try Full (≤10KB) → too big
    → try Compact (≤20KB) → fits!
    → formatted map string
  → cache map (keyed by absPath + mtimeMs)
  → append map text after truncation notice
  → return combined output
```

### Symbol-Addressable Read (Phase 2)
```
read("checker.ts", { symbol: "checkExpression" })
  → generateMap("checker.ts") (or cache hit)
  → find "checkExpression" in map → startLine: 200, endLine: 890
  → read file with offset=200, limit=691
  → hash each line → "LINE:HASH|content"
  → return targeted content (no map appended)
```

### Bash Output Compression (Phase 4 — from pi-rtk)
```
bash("npm test")
  → pi executes command
  → tool_result event fires
  → bashFilter(toolName, command, output)
    → isTestCommand("npm test") → true
    → stripAnsi(output)
    → aggregateTestOutput(output)
      → parse framework (jest/vitest/pytest/go test/cargo test)
      → extract: total, passed, failed, skipped
      → extract: failure details (test name, assertion, location)
    → return compressed summary
  → LLM sees: "📋 47 passed, 2 failed\n\nFailures:\n  ✗ auth.test.ts > login > rejects invalid password"

bash("tsc --noEmit")
  → bashFilter → isBuildCommand → filterBuildOutput
  → LLM sees: "❌ 3 errors\n  src/api.ts(47,5): TS2322 ..."

bash("git diff")
  → bashFilter → isGitCommand → compactGitOutput
  → LLM sees: compact diff with context, stats summary
```

**Critical rule**: bashFilter ONLY processes bash tool results. It NEVER touches read, grep, or edit results — those have hash-anchored content that must remain unmodified.

### Edit Flow (unchanged from hashline-edit)
```
edit("utils.ts", { edits: [
  { set_line: { anchor: "47:a3f", new_text: "..." } }
]})
  → read file
  → for each edit: locate anchor by LINE hint + HASH match (±20 line window)
  → validate all edits (atomic — all must resolve)
  → apply edits bottom-up
  → write file
  → return diff of changes
```

## Key Design Decisions
2. **Map ONLY without offset/limit** — targeted reads skip map generation
3. **Map appended after truncation notice** — consistent positioning
4. **Map failure is silent** — if tree-sitter/ts-morph/ctags fails, return hashlined content without map
5. **In-memory map cache** — keyed by `(absPath, mtimeMs)`, prevents re-parsing on repeated reads
6. **Binary/image delegation** — delegate to pi's built-in read tool unchanged
7. **Grep stays opt-in** — hashline grep is independent of map feature, keep `--tools grep` behavior
8. **Symbol read (Phase 2) uses existing map** — no new parsing infrastructure needed, just expose line ranges
9. **Bash filter NEVER touches read/grep output** — hashline integrity is inviolable; only bash tool results are compressed
10. **No source code filtering** — fundamentally incompatible with hashlines (filtering changes hashed content, breaking the read↔edit contract). Token savings come from structural maps + symbol reads instead.

## Module Boundaries
| Module | Responsibility | Modified? |
|--------|---------------|----------|
| `index.ts` | Extension entry, tool registration | **Yes** — add tool_result hook for bash filter |
| `src/read.ts` | Read tool with hashline formatting | **Yes** — add map integration + symbol param |
| `src/edit.ts` | Hash-verified edit tool | No |
| `src/edit-diff.ts` | Diff utilities for edit | No |
| `src/grep.ts` | Hash-anchored grep tool | No |
| `src/hashline.ts` | xxHash32 line hashing | No |
| `src/path-utils.ts` | CWD-relative path resolution | No |
| `src/runtime.ts` | Abort signal helpers | No |
| `prompts/read.md` | Read tool description | Yes — mention maps + symbol param |
| `prompts/edit.md` | Edit tool description | No |
| Module | Responsibility | Modified? |
|--------|---------------|----------|
| `src/readmap/mapper.ts` | Language dispatch + fallback chain | No |
| `src/readmap/formatter.ts` | Budget-aware map formatting | No |
| `src/readmap/language-detect.ts` | File extension → language | No |
| `src/readmap/types.ts` | FileMap, FileSymbol interfaces | No |
| `src/readmap/enums.ts` | SymbolKind, DetailLevel enums | No |
| `src/readmap/constants.ts` | Thresholds (2000 lines, 50KB) | No |
| `src/readmap/mappers/*` | 17 language-specific parsers | No |
| `scripts/python_outline.py` | Python AST extraction | No |
| `scripts/go_outline.go` | Go AST extraction | No |
### From pi-rtk (bash output techniques only)
| Module | Responsibility | Modified? |
|--------|---------------|----------|
| `src/rtk/bash-filter.ts` | Entry point: detect command type, route to technique | **New** — wraps RTK techniques |
| `src/rtk/techniques/ansi.ts` | Strip ANSI color codes | No (copied verbatim) |
| `src/rtk/techniques/build.ts` | Filter build output | No (copied verbatim) |
| `src/rtk/techniques/test-output.ts` | Aggregate test results | No (copied verbatim) |
| `src/rtk/techniques/git.ts` | Compact diffs, status, logs | No (copied verbatim) |
| `src/rtk/techniques/linter.ts` | Aggregate lint errors | No (copied verbatim) |
| `src/rtk/techniques/truncate.ts` | Smart truncation | No (copied verbatim) |
| ~~`src/rtk/techniques/source.ts`~~ | ~~Source code filtering~~ | **Excluded** — breaks hashlines |
| ~~`src/rtk/techniques/search.ts`~~ | ~~Search result grouping~~ | **Excluded** — breaks hashline grep |

## Dependency Graph
```
pi-hashline-readmap
├── xxhashjs (hashline hashing)
├── diff (edit-diff utilities)
├── tree-sitter (Rust/C++/Clojure parsing)
│   ├── tree-sitter-cpp
│   ├── tree-sitter-rust
│   └── tree-sitter-clojure
├── ts-morph (TypeScript/JS parsing)
├── @mariozechner/pi-coding-agent (peer)
└── @sinclair/typebox (peer)
(pi-rtk techniques have zero dependencies — pure string processing)
```

## Test Strategy
- **Integration point**: truncation detection → map generation → output assembly
- **Symbol lookup**: symbol name → line range resolution
- **Cache behavior**: cache hit/miss based on mtime
- **Hashline formatting**: LINE:HASH|content output format
- **Bash filter routing**: command detection → correct technique applied
- **RTK techniques**: test/build/git/linter output parsing (existing RTK tests)
- All existing read-map unit tests (mappers, formatter, language-detect)
- **Small file read**: hashlines only, no map
- **Large file read**: hashlines + map appended
- **Targeted read (offset/limit)**: no map, just hashlined slice
- **Symbol read**: correct line range, hashlined content
- **Binary/image**: delegation to built-in
- **Map failure**: graceful fallback to hashlines only
- **Edit after read**: read → get anchors → edit using anchors → verify
- **Bash filter**: test output → compressed summary, build output → error summary
- **Bash filter isolation**: bash filter does NOT modify read/grep/edit results
### E2E Tests
- Full pi session: read large file → see map → read with symbol → edit → verify
- Full pi session: run failing test → see compressed output → fix → run again → see pass summary
