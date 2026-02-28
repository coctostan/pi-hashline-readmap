# Roadmap — pi-hashline-readmap

## Milestone 0: Prerequisites
**Goal**: Install CLI tools that the agent uses via bash. Zero coding, 5 minutes, immediate value.

```bash
brew install ast-grep difftastic shellcheck yq comby scc sd
```

| Tool | What the agent gains |
|------|---------------------|
| `ast-grep` (`sg`) | Structural code search/replace — finds AST patterns, not strings |
| `difftastic` (`difft`) | Semantic diffs — understands moved code, format-only changes |
| `shellcheck` | Lint shell commands before running them |
| `yq` | Query/modify YAML, TOML, XML structurally |
| `comby` | Structural search/replace for any language |
| `scc` | Instant codebase overview: languages, line counts, complexity |
| `sd` | Sane `sed` replacement with PCRE regex |

Prerequisite for M3 (ast-grep wrapper). Generally useful for all work.

---

## Milestone 1: Foundation (MVP)
**Goal**: Working combined extension — hashline read/edit/grep + structural maps on large files.

### 1.1 Project Scaffold
- Initialize package.json with combined dependencies (hashline-edit + read-map + rtk techniques)
- Set up TypeScript config, linting, test infrastructure (vitest)
- Copy hashline-edit source files (index.ts, src/*.ts, prompts/)
- Copy read-map mapper library into src/readmap/
- Copy RTK bash techniques into src/rtk/ (ansi, build, test-output, git, linter, truncate — NOT source, NOT search)
- Copy scripts/ (python_outline.py, go_outline.go)
- Verify clean build

### 1.2 Import & Adapt read-map Code
- Adapt read-map module imports (fix .js → .ts extensions, adjust paths)
- Ensure all 17 language mappers compile and resolve correctly
- Add read-map's dependencies to package.json (tree-sitter, ts-morph, etc.)
- Verify mapper tests pass in new structure

### 1.3 Integrate Map into Read Tool
- Modify src/read.ts to call generateMap() + formatFileMapWithBudget() on truncation
- Add in-memory map cache (keyed by absPath + mtimeMs)
- Only trigger map when truncated AND no offset/limit provided
- Silent failure — catch map generation errors, return hashlines without map
- Update prompts/read.md to document map behavior

### 1.4 Unit & Integration Tests
- Test small file read (hashlines only, no map overhead)
- Test large file read (hashlines + map appended)
- Test targeted read with offset/limit (no map)
- Test binary/image delegation
- Test map generation failure (graceful fallback)
- Test cache hit/miss behavior
- Test edit after read (anchors work correctly)

### 1.5 Polish & Docs
- Write README.md with installation, usage, and examples
- Add LICENSE (MIT)
- Test `pi install .` from local path
- Test combined flow end-to-end

---

## Milestone 2: Symbol-Addressable Read
**Goal**: `read("file.ts", { symbol: "functionName" })` returns only that symbol's code.

### 2.1 Symbol Lookup Engine
- Add function to search FileMap symbols by name (exact + fuzzy)
- Handle nested symbols (methods inside classes)
- Return startLine/endLine range for matched symbol
- Handle ambiguous matches (multiple symbols with same name)

### 2.2 Read Tool Integration
- Add `symbol?: string` parameter to read tool schema
- When symbol provided: generate/cache map → find symbol → read with offset/limit
- Return hashlined content for just that symbol's range
- Fall back to full read if symbol not found (with warning message)
- Update prompts/read.md to document symbol parameter

### 2.3 Tests
- Test exact symbol match
- Test nested symbol (class.method)
- Test symbol not found (graceful fallback)
- Test ambiguous match behavior
- Test symbol read on files that don't need maps (small files)

---

## Milestone 3: AST-Grep Pi Tool Wrapper
**Goal**: Native `sg` tool that wraps ast-grep CLI and returns hashline-formatted results.

### 3.1 Tool Implementation
- Register new `sg` (or `ast-grep`) tool
- Accept pattern, lang, optional path/glob parameters
- Call `sg --json` under the hood
- Parse JSON results
- Re-format with `>>LINE:HASH|` anchors from hashline engine
- Return matches ready for the edit tool

### 3.2 Integration & Tests
- Test structural search → hashlined results
- Test search → edit workflow (no intermediate read needed)
- Test when ast-grep not installed (clear error message)
- Add prompts for sg tool

---

## Milestone 4: Bash Output Compression (from pi-rtk)
**Goal**: Absorb pi-rtk's proven bash output techniques. NOT built from scratch — adapted from existing, tested code.

### 4.1 Import RTK Techniques
- Copy techniques from pi-rtk v0.1.3: ansi.ts, build.ts, test-output.ts, git.ts, linter.ts, truncate.ts
- Place in src/rtk/techniques/
- Do NOT copy source.ts (breaks hashlines) or search.ts (breaks hashline grep)
- Adapt imports for new project structure
- Verify techniques compile

### 4.2 Bash Filter Entry Point
- Create src/rtk/bash-filter.ts — the routing logic
- Detect command type (test, build, git, lint, other)
- Apply appropriate technique chain: stripAnsi → detect type → filter/aggregate
- Return compressed output + savings metrics
- Graceful fallback: if no technique matches, return ANSI-stripped output unchanged

### 4.3 Wire into Extension
- Hook `pi.on("tool_result")` in index.ts
- Only process bash tool results (toolName === "bash" or "Bash")
- NEVER process read, grep, or edit results — hashline integrity is inviolable
- Pass command string + output to bashFilter()
- Replace tool result content with compressed version
- Optionally log token savings to console (configurable)

### 4.4 Tests
- Test command detection (isTestCommand, isBuildCommand, isGitCommand, isLinterCommand)
- Test each technique produces valid compressed output
- Test bash filter routing (correct technique applied for each command type)
- **Critical test**: bash filter does NOT fire for read/grep/edit tool results
- Test unrecognized commands get ANSI-stripped but otherwise unchanged
- Port relevant tests from pi-rtk

---

## Priority & Timeline
| Milestone | Effort | Impact | Priority |
|-----------|--------|--------|----------|
| M0: Prerequisites | 5 minutes | Free CLI tools for bash | **P0 — do first** |
| M1: Foundation | 1-2 days | Fixes real conflict, combines proven tools | **P0 — do second** |
| M2: Symbol Read | 0.5-1 day | Biggest token savings, builds on M1 | **P0 — do third** |
| M3: AST-Grep | 1 day | Closes search→edit loop | P1 |
| M4: Bash Compression | 0.5-1 day | High token savings, adapted from pi-rtk (not from scratch) | P1 |

## Upstream Sources
- **hashline-edit**: https://github.com/RimuruW/pi-hashline-edit (v0.3.0, MIT) — hash-anchored read/edit/grep
- **read-map**: https://github.com/Whamp/pi-read-map (v1.3.0, MIT) — structural file maps
- **rtk**: https://github.com/mcowger/pi-rtk (v0.1.3, MIT) — bash output techniques (test/build/git/linter/ANSI only)
