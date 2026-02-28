# pi-hashline-readmap — Combined Extension Design

## Problem

`pi-hashline-edit` and `pi-read-map` both register a `read` tool. Only one can win — whichever loads second overwrites the first. Users lose either hash-anchored editing or structural file maps for large files.

## Why Combine?

Both are mature, well-tested extensions solving **orthogonal problems**:

- **hashline-edit** (v0.3.0): Hash-anchored lines for surgical edits — solves line-number drift
- **read-map** (v1.3.0): Structural maps for large files — solves navigating 50k-line codebases

Neither feature interferes with the other. They compose naturally:

1. Read small file → hashline `LINE:HASH|content`
2. Read large file → hashline `LINE:HASH|content` (truncated at 2,000 lines) **+ structural map appended**

---

## What Each Extension Owns

|  | **hashline-edit** | **read-map** |
|---|---|---|
| **Core value** | `LINE:HASH\|` anchors for surgical edits | Structural symbol maps for large files |
| **Read tool** | Full reimplementation — hashes every line | Thin wrapper — delegates to built-in `read`, appends map |
| **Edit tool** | ✅ Full hash-verified engine | ❌ None |
| **Grep tool** | ✅ Hash-anchored grep (opt-in) | ❌ None |
| **Map generation** | ❌ None | ✅ 17 language parsers (tree-sitter, ts-morph, regex, ctags) |
| **Triggers on** | Every read | Only files >2,000 lines or >50KB |
| **Dependencies** | `xxhashjs`, `diff` | `tree-sitter`, `tree-sitter-cpp`, `tree-sitter-rust`, `tree-sitter-clojure`, `ts-morph` |

---

## Architecture: Option A — Graft read-map's mapper into hashline-edit

Take hashline-edit as the base (it owns read + edit + grep). Add read-map's `generateMap()` + `formatFileMapWithBudget()` as the map engine. Modify hashline's `registerReadTool` to detect large-file truncation and append the map.

### Why this approach?

- **Clean single extension** — one `registerTool("read")` call, no race conditions
- **hashline already handles the read/edit/grep trio** — read-map only touches read
- **read-map's mapper code is cleanly separated** — pure functions with no pi API dependency
- `generateMap(filePath) → FileMap` and `formatFileMapWithBudget(map) → string` are self-contained

### Alternatives considered

| Option | Approach | Verdict |
|--------|----------|---------|
| **B: Wrapper extension** | Thin layer that disables both, registers combined read | Fragile — depends on internal APIs of both |
| **C: New standalone** | Import library code from both packages | Both call `registerTool("read")` internally — can't import without side effects |

---

## Integration Point

The merge is ~15 lines of code in hashline-edit's `src/read.ts`.

### Current hashline-edit read flow:

```
read(path, offset?, limit?)
  → resolve absolute path
  → detect binary/image → delegate to built-in
  → read file lines
  → apply offset/limit
  → hash each line → "LINE:HASH|content"
  → detect truncation → append "[Output truncated: ...]"
  → return result
```

### New combined flow:

```
read(path, offset?, limit?)
  → resolve absolute path
  → detect binary/image → delegate to built-in
  → read file lines
  → apply offset/limit
  → hash each line → "LINE:HASH|content"
  → detect truncation → append "[Output truncated: ...]"
  → IF truncated AND no offset/limit:
      → generateMap(absolutePath)
      → formatFileMapWithBudget(fileMap)
      → append map text to output
  → return result
```

### The code change:

```typescript
// In hashline-edit's src/read.ts, after truncation detection:

if (truncation.truncated && !offset && !limit) {
    try {
        const fileMap = await generateMap(absolutePath);
        if (fileMap) {
            const mapText = formatFileMapWithBudget(fileMap);
            text += mapText;
        }
    } catch {
        // Map generation failed — still return hashlined content without map
    }
}
```

### Example combined output:

```
1:ab|import { foo } from './bar';
2:cd|import { baz } from './qux';
...
2000:ef|  return result;

[Output truncated: showing 2000 of 54,247 lines]
───────────────────────────────────────
File Map: checker.ts
54,247 lines │ 2.1 MB │ TypeScript
───────────────────────────────────────

class TypeChecker: [156-54100]
  checkExpression(node: Node): [200-890]
  resolveUnion(types: Type[]): [892-1340]
  ...
───────────────────────────────────────
Use read(path, offset=LINE, limit=N) for targeted reads.
───────────────────────────────────────
```

All lines have hashes. Large files get structural maps. Edits use hash anchors. Best of both worlds.

---

## Files to Import from read-map

### Core (required):

```
src/mapper.ts           — dispatch to language-specific mappers
src/formatter.ts        — budget-aware map formatting
src/language-detect.ts  — file extension → language detection
src/types.ts            — FileMap, FileSymbol interfaces
src/enums.ts            — SymbolKind, DetailLevel
src/constants.ts        — truncation/budget thresholds
```

### Language mappers (all 17):

```
src/mappers/typescript.ts   — ts-morph for TS/JS
src/mappers/python.ts       — Python AST via subprocess
src/mappers/go.ts           — Go AST via subprocess
src/mappers/rust.ts         — tree-sitter
src/mappers/cpp.ts          — tree-sitter for C/C++
src/mappers/c.ts            — Regex patterns
src/mappers/clojure.ts      — tree-sitter for Clojure/ClojureScript/EDN
src/mappers/sql.ts          — Regex
src/mappers/json.ts         — jq subprocess
src/mappers/jsonl.ts        — Streaming parser
src/mappers/yaml.ts         — Regex
src/mappers/toml.ts         — Regex
src/mappers/csv.ts          — In-process parser
src/mappers/markdown.ts     — Regex
src/mappers/ctags.ts        — universal-ctags fallback
src/mappers/fallback.ts     — Grep-based final fallback
```

### Scripts (for subprocess-based mappers):

```
scripts/python_outline.py   — Python AST extraction
scripts/go_outline.go       — Go AST extraction (compiles on first use)
```

---

## Dependencies

### From hashline-edit (existing):

```json
{
    "xxhashjs": "^0.2.2",
    "diff": "^8.0.2"
}
```

### From read-map (to add):

```json
{
    "tree-sitter": "0.22.4",
    "tree-sitter-cpp": "0.23.4",
    "tree-sitter-rust": "0.23.3",
    "tree-sitter-clojure": "github:ghoseb/tree-sitter-clojure#78928e6",
    "ts-morph": "27.0.2"
}
```

### Peer dependencies (unchanged):

```json
{
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
}
```

---

## Key Design Decisions

1. **Map ONLY on truncation** — small files get hashlines only, zero overhead
2. **Map ONLY without offset/limit** — targeted reads skip map (same as read-map)
3. **Map appended after truncation notice** — consistent positioning
4. **Map failure is silent** — if tree-sitter/ts-morph/ctags fails, you still get hashlined content
5. **In-memory map cache** — keyed by `(absPath, mtimeMs)`, prevents re-parsing on repeated reads
6. **Binary/image delegation** — both extensions handle this the same way already
7. **Grep stays opt-in** — hashline grep is independent of the map feature, keep `--tools grep` behavior

---

## Project Structure

```
pi-hashline-readmap/
├── index.ts                    # Extension entry (from hashline-edit)
├── package.json                # Combined dependencies
├── prompts/                    # Hashline prompt templates (from hashline-edit)
├── scripts/
│   ├── python_outline.py       # From read-map
│   └── go_outline.go           # From read-map
├── src/
│   ├── read.ts                 # Modified — hashline read + map integration
│   ├── edit.ts                 # From hashline-edit (unchanged)
│   ├── edit-diff.ts            # From hashline-edit (unchanged)
│   ├── grep.ts                 # From hashline-edit (unchanged)
│   ├── hashline.ts             # From hashline-edit (unchanged)
│   ├── path-utils.ts           # From hashline-edit (unchanged)
│   ├── runtime.ts              # From hashline-edit (unchanged)
│   └── readmap/                # From read-map (all unchanged)
│       ├── mapper.ts
│       ├── formatter.ts
│       ├── language-detect.ts
│       ├── types.ts
│       ├── enums.ts
│       ├── constants.ts
│       └── mappers/
│           ├── typescript.ts
│           ├── python.ts
│           ├── go.ts
│           ├── rust.ts
│           ├── cpp.ts
│           ├── c.ts
│           ├── clojure.ts
│           ├── sql.ts
│           ├── json.ts
│           ├── jsonl.ts
│           ├── yaml.ts
│           ├── toml.ts
│           ├── csv.ts
│           ├── markdown.ts
│           ├── ctags.ts
│           └── fallback.ts
└── README.md
```

---

## Upstream Sources

- **hashline-edit**: https://github.com/RimuruW/pi-hashline-edit (v0.3.0)
- **read-map**: https://github.com/Whamp/pi-read-map (v1.3.0)

## License

Both upstream projects are MIT licensed. Combined extension would also be MIT.
