# What We Should Build — Honest Assessment

## The Landscape

Three categories:

1. **Just install** — CLI tools that already exist. Agent uses them via `bash`. Zero coding.
2. **Combine** — Merge existing pi extensions that conflict. Moderate effort, huge payoff.
3. **Build new** — Agent-native pi tools that don't exist. Highest effort, highest ceiling.

---

## 1. Just Install (5 minutes)

These are mature CLI tools. The agent calls them through `bash`. No extension needed.

```bash
brew install ast-grep difftastic shellcheck yq comby scc sd
```

You already have `jq` and `fd`.

| Tool | What the agent gains |
|------|---------------------|
| **`ast-grep` (`sg`)** | Structural code search/replace. `sg -p 'console.log($$$)' -l ts` finds all console.log *call expressions*, not string matches. One-command refactors. |
| **`difftastic` (`difft`)** | Semantic diffs. Understands moved code, format-only changes. `difft old.ts new.ts` shows what *actually* changed. |
| **`shellcheck`** | Lint shell commands before running them. Agent writes shell constantly — this catches `rm -rf $UNSET_VAR/` before it executes. |
| **`yq`** | Query/modify YAML, TOML, XML structurally. No more text-editing YAML indentation bugs. |
| **`comby`** | Structural search/replace without tree-sitter. Works on config files, markdown, anything with balanced delimiters. |
| **`scc`** | Instant codebase overview: languages, line counts, complexity. 5 lines of output vs. 500 from manual exploration. |
| **`sd`** | Sane `sed` replacement. PCRE regex, no escaping hell. When agent needs a quick global substitution. |

**These are free wins.** Install them and the agent can use them immediately through bash.

---

## 2. Combine: `pi-hashline-readmap` (1-2 days)

Merge `pi-hashline-edit` + `pi-read-map` into one extension. Already fully designed in `DESIGN.md`.

**What you get**:
- Hash-anchored `LINE:HASH|content` on every read (from hashline)
- Structural file maps on large files (from read-map)
- Hash-anchored grep (from hashline)
- Hash-verified surgical edits (from hashline)
- All four tools, no conflicts

**The work**:
- Copy read-map's mapper/formatter/language modules into hashline-edit's structure
- Add ~15 lines to hashline's `registerReadTool` to call `generateMap()` on truncation
- Wire up read-map's in-memory cache
- Add read-map's npm dependencies (tree-sitter, ts-morph)
- Test the combined flow

**Confidence**: Very high. Both codebases are clean, well-understood, and the integration point is surgical.

---

## 3. Build New: Agent-Native Tool Upgrades

### 3a. Symbol-Addressable Read (builds on #2)

**What**: Add a `symbol` parameter to the read tool.

```
read("auth.ts", { symbol: "handleAuth" })
→ Returns only the handleAuth function body (lines 47-89), with hashlines
```

**Why**: Currently the agent reads 2,000 lines to find a 40-line function. This is the biggest token waste in the entire workflow. With read-map's symbol table already computed, we have the line ranges — we just need to expose them as a parameter.

**The work**:
- Add `symbol?: string` parameter to the read tool schema
- When `symbol` is provided:
  1. Generate/retrieve the file map (same as read-map does)
  2. Find the symbol in the map by name
  3. Use its line range as `offset`/`limit`
  4. Return hashlined content for just that symbol
- Fall back to full read if symbol not found

**Effort**: Small — maybe 50 lines of code on top of #2.
**Impact**: Enormous for large files. Eliminates the "read 2,000 lines, only need 40" pattern.

### 3b. `ast-grep` Pi Tool Wrapper

**What**: A pi-native `sg` tool that wraps the `ast-grep` CLI and returns hashline-formatted results.

```
sg({ pattern: "console.log($$$)", lang: "ts" })
→ Returns matches with >>LINE:HASH| anchors, ready for editing
```

**Why**: The agent can already use `ast-grep` via bash, but the output isn't hashlined. You'd search structurally with `sg` but then have to `read` the file to get hash anchors before you can `edit`. A native tool bridges the gap — search structurally, get editable anchors back.

**The work**:
- New tool: `sg` (or `ast-grep`)
- Calls `sg --json` under the hood (ast-grep has JSON output mode)
- Parses JSON results
- Re-formats with `LINE:HASH|` anchors from hashline
- Returns matches ready for the edit tool

**Effort**: ~100-150 lines. Straightforward wrapper.
**Impact**: High for refactoring tasks. Search by AST pattern → edit by hash anchor, zero intermediate steps.
**Prerequisite**: `ast-grep` must be installed (`brew install ast-grep`).

### 3c. Structured Bash Output Wrapper

**What**: A bash wrapper that detects common command patterns and returns structured summaries.

```
bash("npm test")
→ { exit_code: 1, summary: "47 passed, 2 failed", 
    failures: [{ test: "auth.test.ts > should reject expired tokens", error: "Expected 401, got 200" }],
    full_output_lines: 247 }
```

**Why**: Most bash output is noise. `npm install` → 500 lines, agent needs "success." `npm test` → 200 lines, agent needs "2 failures and what they are." Currently the agent reads every byte.

**The work**:
- Use pi's `createBashTool` with a `spawnHook` + output post-processing
- Pattern matchers for common tools:
  - **Test runners**: Jest, Vitest, pytest, go test, cargo test — parse summary line
  - **Package managers**: npm, yarn, pnpm, pip — parse success/failure + warning count
  - **Build tools**: tsc, esbuild, webpack — parse error count + first N errors
  - **Linters**: eslint, prettier — parse error/warning counts
- If pattern not recognized, return raw output (no regression)
- Full output always available via a `--verbose` flag or on failure

**Effort**: Medium-large. Each pattern matcher is small (~20-30 lines), but covering all the common tools is scope creep. Start with test runners (biggest win) and expand.
**Impact**: High for TDD workflows. The agent runs tests constantly — structured output saves massive tokens.
**Risk**: Brittle pattern matching. Output formats change between tool versions. Need graceful fallback.

### 3d. Self-Verifying Edit

**What**: The edit tool optionally runs a linter/typechecker after each edit and returns diagnostics inline.

```
edit("auth.ts", { edits: [...], verify: true })
→ { applied: true, diff: "...", diagnostics: [
    { line: 52, severity: "error", message: "Property 'token' does not exist on type 'Request'" }
  ]}
```

**Why**: Currently: edit → run typecheck → read errors → fix → repeat. 4 tool calls. With verification: edit → see errors → fix. 2 tool calls. Halves the iteration loop.

**The work**:
- After applying edits, optionally run a configured checker (tsc, eslint, pyright, etc.)
- Parse checker output into structured diagnostics
- Return alongside the edit result
- Configurable per-project (which checker to run)

**Effort**: Medium. The checker integration is project-specific, which makes it hard to generalize.
**Impact**: Medium-high for TypeScript projects (tsc is slow but catches real errors). Lower for dynamic languages.
**Risk**: Checker might be slow (tsc on a large project = 5-10 seconds). Might not be worth blocking the edit on it.

---

## Recommended Build Order

```
Phase 0: brew install ast-grep difftastic shellcheck yq comby scc sd
         (5 minutes, immediate value)

Phase 1: pi-hashline-readmap
         (combine hashline-edit + read-map, 1-2 days)

Phase 2: Symbol-addressable read (--symbol parameter)
         (small addition to Phase 1, half a day)

Phase 3: ast-grep pi tool wrapper (returns hashlined results)
         (standalone tool, 1 day)

Phase 4: Structured bash output (test runner summaries first)
         (stretch goal, 2-3 days for useful coverage)
```

### Why this order?

1. **Phase 0** is free — install CLIs, agent uses them through bash immediately
2. **Phase 1** fixes a real conflict you have right now and combines two proven extensions
3. **Phase 2** is the single highest-impact feature — eliminates the biggest token waste pattern
4. **Phase 3** closes the loop: structural search (ast-grep) → hashlined results → surgical edit
5. **Phase 4** is the most ambitious but also the most fragile — save for last

### What we're NOT building (and why)

| Idea | Why not |
|------|---------|
| **Contextual grep** (enclosing function) | ast-grep + read-map's symbol table gets you 90% there already |
| **Output budget manager** | Diminishing returns — most commands already have reasonable output, and the bad ones (npm install) are better served by structured parsing |
| **Semantic diff tool** | `difftastic` exists, just install it. Wrapping it as a pi tool adds complexity with little gain over bash |
| **Full AST-aware edit** | ast-grep's `--rewrite` already does this via bash. No need to reimplement |

---

## Package Name & Identity

**Name**: `pi-hashline-readmap` (Phase 1-2)

Later, if Phase 3-4 happen, consider renaming to `pi-sharp-tools` or `pi-agent-tools` — a comprehensive "agent-native tool suite" that replaces the stock read/edit/grep with smarter versions.

**Target**: A single extension that gives you the best agent-native tools available, combining the best of the community (hashline, read-map) with new capabilities (symbol reads, ast-grep integration, structured output).
