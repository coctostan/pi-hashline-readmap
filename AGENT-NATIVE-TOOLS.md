# Agent-Native Tools: Sharper Tools for Sharper Agents

## The Core Insight

Human CLI tools assume a human operator with:
- **Spatial memory** — you can scroll up and remember "that function was around line 200"
- **Screen persistence** — terminal output stays visible, you glance back at it
- **Visual pattern matching** — you spot the bug in a wall of grep output
- **Incremental interaction** — you run a command, read output, decide next step interactively
- **Context is free** — looking at something doesn't cost you anything

Agents have **none of that**. They have:
- **A context window** — finite, expensive, everything competes for space
- **Token-based I/O** — every byte of output costs money and capacity
- **No spatial memory** — can't "scroll up," previous output is just earlier tokens
- **No visual pattern matching** — grep output is just text to parse
- **Perfect text matching** but imperfect reasoning about positions
- **Parallel execution** — can run multiple tools simultaneously
- **No persistent state between turns** (unless explicitly managed)

**The implication**: Every byte of tool output should be maximally informative. Every tool interaction should be maximally precise. Wasted output = wasted intelligence.

---

## The Design Principles of Agent-Native Tools

### 1. Content-Addressable, Not Position-Based
**Human**: "Edit line 47" — fine, you're staring at the file.
**Agent**: Line 47 might have shifted since last read. Position is fragile.
**Agent-native**: "Edit `47:a3f`" — hash-verified content address. Drift-proof.

**This is what hashline-edit does.** It's the canonical example. The hash is a checksum of the line content — if the file changed, the hash won't match, and the edit fails safely instead of corrupting the wrong line.

### 2. Structural, Not Textual
**Human**: `grep -r "handleAuth" .` — you eyeball the results, instantly see which are definitions vs. usages.
**Agent**: Gets 50 text matches. Has to re-read each file to understand context. Burns tokens.
**Agent-native**: AST-aware search that returns "function definition at X, called from Y and Z."

### 3. Minimal and Relevant, Not Exhaustive
**Human**: `npm install` dumps 500 lines. You skip to the end, check for errors.
**Agent**: Reads all 500 lines. Costs tokens. Extracts: "it worked" or "it didn't."
**Agent-native**: Structured output — `{ success: true, packages: 47, warnings: 2, errors: 0 }`.

### 4. Self-Verifying, Not Trust-Based
**Human**: You run `sed`, eyeball the file, see if it worked.
**Agent**: Runs sed, hopes it worked. Often has to re-read to verify.
**Agent-native**: Edit tool that returns the diff of what changed, or validates against a schema/linter inline.

### 5. Atomic, Not Partial
**Human**: You make 5 edits manually, check after each one.
**Agent**: Makes 5 edits in a batch. If #3 fails, #4 and #5 might be based on wrong assumptions.
**Agent-native**: Transactional edits — all succeed or all roll back. Hashline's batch edit with hash verification does this.

### 6. Semantic Over Syntactic
**Human**: You read a diff and mentally reconstruct what happened.
**Agent**: Sees `-200 lines, +200 lines` and struggles to understand "a function moved."
**Agent-native**: Semantic diff that says "function `handleAuth` moved from auth.ts:47 to middleware.ts:12, body unchanged."

---

## Tool-by-Tool Analysis

### READ → What agents actually need

| Tool | Type | What it does | Agent value |
|------|------|-------------|-------------|
| `cat` | Stock | Dumps file | ❌ No line refs, no structure, wastes tokens on large files |
| `bat` | Human++ | Syntax highlighting, line numbers | ❌ ANSI codes waste tokens, highlighting is for humans |
| **hashline read** | Agent-native | `LINE:HASH\|content` | ✅ Content-addressable lines, enables surgical edits |
| **read-map** | Agent-native | Structural map on truncation | ✅ Navigate large files by symbol, not by scrolling |
| **AST-aware read** | Next-gen | `read --symbol "handleAuth"` returns just that function | 🔮 Only reads what's needed, zero wasted tokens |

**The gap**: Even hashline + read-map still dumps the first 2,000 lines. An agent usually wants *specific things* — a function, a class, an import block. An AST-aware read tool that accepts a symbol name and returns just that symbol's code (plus its imports/dependencies) would be dramatically more token-efficient.

**How to build it**: tree-sitter + a thin wrapper. `read auth.ts --symbol handleAuth` → returns lines 47-89, the function body. The map from read-map already gives you the line ranges.

### SEARCH → What agents actually need

| Tool | Type | What it does | Agent value |
|------|------|-------------|-------------|
| `grep` | Stock | Text pattern matching | ⚠️ Returns raw matches, no structural context |
| `rg` (ripgrep) | Human++ | Fast, .gitignore-aware, `--json` mode | ✅ Better defaults, JSON output parseable |
| `rg --json` | Agent-adapted | Structured JSON per match | ✅ Machine-parseable, includes line/col/file |
| **hashline grep** | Agent-native | `>>LINE:HASH\|content` | ✅ Matches are directly editable via hash |
| **`ast-grep` (`sg`)** | Structural | AST pattern matching | ✅✅ Finds code by structure, not text |
| **`comby`** | Structural | Syntax-aware search/replace | ✅ Understands delimiters, no regex needed |

**The gap**: Agents often need "find all usages of X" or "find where this type is constructed." Text grep returns noise — string matches in comments, variable names that happen to contain the substring, etc. AST-based search eliminates false positives entirely.

**`ast-grep` is the biggest single upgrade.** Example:
```bash
# Text grep: finds "log" in comments, variable names, URLs...
rg "console.log"

# AST grep: finds only actual console.log CALL EXPRESSIONS
sg -p 'console.log($$$ARGS)' -l js
```

For agents, false positives in search results are expensive — the agent reads each result, reasons about it, possibly opens the file, wastes tokens, and makes worse decisions.

**`comby` complements ast-grep** for things that don't need a full AST — config files, markdown, HTML. It understands balanced delimiters (braces, brackets, quotes) without needing tree-sitter grammars.

### EDIT → What agents actually need

| Tool | Type | What it does | Agent value |
|------|------|-------------|-------------|
| `sed` | Stock | Regex-based line editing | ❌ Fragile, escaping hell, no verification |
| `patch` | Stock | Apply unified diffs | ⚠️ Requires exact context, fails on drift |
| `sd` | Human++ | Modern sed with sane regex | ⚠️ Better syntax, still text-based |
| **hashline edit** | Agent-native | Hash-verified surgical edits | ✅ Drift-proof, atomic batches |
| **`ast-grep --rewrite`** | Structural | AST-pattern-based rewrite | ✅✅ Structural transforms, not text substitution |
| **`comby`** | Structural | Template-based rewrite | ✅ Safe structural replacement |

**The gap**: Even hashline edit requires the agent to know exactly what text to put where. For *refactoring patterns* (rename a function, change an API signature, add error handling to all DB calls), structural tools are dramatically better.

**Example — ast-grep rewrite**:
```bash
# Change all `await fetch(url)` to `await fetchWithRetry(url)`
sg -p 'await fetch($URL)' --rewrite 'await fetchWithRetry($URL)' -l ts
```

An agent doing this with text edit would need to: grep for all occurrences, read each file, make individual edits, handle edge cases in formatting. With ast-grep, it's one command. The AST handles all formatting variations.

### BASH/EXEC → What agents actually need

| Tool | Type | What it does | Agent value |
|------|------|-------------|-------------|
| `bash` | Stock | Run anything | ⚠️ Powerful but output is unparsed text |
| **`jq`** | Structured | JSON query/transform | ✅ Structured data in, structured data out |
| **`yq`** | Structured | YAML/JSON/TOML/XML query | ✅ Config files become queryable data |
| **`shellcheck`** | Verifying | Lint shell commands before running | ✅ Catches agent shell mistakes before they execute |
| **`scc`/`tokei`** | Summary | Code statistics | ✅ Instant project overview in minimal tokens |

**The gap**: Most of what agents run through bash produces human-formatted output that the agent has to parse. `npm install` produces 500 lines; the agent needs 1 line. `docker build` produces a wall of text; the agent needs "success" or the error.

**A structured bash wrapper** — one that runs the command, captures output, and returns a summary + full output only on failure — would save enormous amounts of context.

```json
{
  "command": "npm test",
  "exit_code": 1,
  "summary": "47 passed, 2 failed",
  "failures": [
    { "test": "auth.test.ts > should reject expired tokens", "error": "Expected 401, got 200" },
    { "test": "db.test.ts > should rollback on error", "error": "Timeout after 5000ms" }
  ],
  "duration_ms": 12340
}
```

vs. the current experience: 200 lines of test runner output that the agent has to scan through.

### DIFF → What agents actually need

| Tool | Type | What it does | Agent value |
|------|------|-------------|-------------|
| `diff` | Stock | Line-by-line comparison | ⚠️ Noisy, format changes look like real changes |
| `git diff` | Stock | Unified diff | ⚠️ Better, but still line-based |
| `delta` | Human++ | Syntax-highlighted, word-level diff | ❌ ANSI output is for humans |
| **`difftastic` (`difft`)** | Structural | AST-aware semantic diff | ✅✅ Understands moves, format changes, real changes |

**`difftastic` is transformative for agents reviewing changes.** When an agent runs `git diff` after making edits, it gets a wall of `+`/`-` lines. If a function moved between files, that's shown as "200 lines deleted here, 200 lines added there" — the agent has to figure out they're the same code.

Difftastic would show: "function `handleAuth` moved from `auth.ts` to `middleware.ts`, body unchanged." That's the kind of semantic understanding that prevents agents from misinterpreting their own changes.

### FIND/NAVIGATE → What agents actually need

| Tool | Type | What it does | Agent value |
|------|------|-------------|-------------|
| `find` | Stock | File path matching | ⚠️ Includes node_modules, .git, etc. |
| `fd` | Human++ | Fast, .gitignore-aware find | ✅ Sane defaults, less noise |
| `tree` | Stock | Directory structure | ⚠️ Dumps entire tree, wastes tokens |
| **`scc`** | Summary | Language-aware project overview | ✅ Instant project understanding |
| **KotaDB** | Agent-native | Dependency graphs, symbol usages, impact analysis | ✅✅ Answers "what depends on X?" directly |

---

## The Ideal Agent Toolkit (Ranked by Impact)

### Tier 1: Install Now — Biggest Impact
| Tool | Install | Why |
|------|---------|-----|
| **`ast-grep`** | `brew install ast-grep` | Structural search/replace. Eliminates false positives. Enables one-command refactors. |
| **`difftastic`** | `brew install difftastic` | Semantic diffs. Agent understands what actually changed vs. what just moved/reformatted. |
| **`jq`** | `brew install jq` | Structured JSON querying. Agents work with JSON constantly. |
| **`shellcheck`** | `brew install shellcheck` | Catches shell mistakes before execution. Agents write lots of fragile shell. |

### Tier 2: High Value
| Tool | Install | Why |
|------|---------|-----|
| **`yq`** | `brew install yq` | jq for YAML/TOML/XML. Config file manipulation without text-editing footguns. |
| **`comby`** | `brew install comby` | Structural search/replace without needing tree-sitter grammars. Works on anything. |
| **`fd`** | `brew install fd` | Better find. Respects .gitignore by default. Less noise in results. |
| **`scc`** | `brew install scc` | Instant codebase overview. 5 tokens of output vs. 500 from manual exploration. |
| **`sd`** | `brew install sd` | Sane sed replacement. When the agent needs a quick substitution without escaping hell. |

### Tier 3: Nice to Have
| Tool | Install | Why |
|------|---------|-----|
| **`hyperfine`** | `brew install hyperfine` | Benchmarking with statistics. Verifiable "is this faster?" claims. |
| **`watchexec`** | `brew install watchexec` | File watcher. Useful for setting up feedback loops. |

---

## What Doesn't Exist Yet (But Should)

### 1. Structured Bash Output Wrapper
A bash wrapper that runs commands and returns structured summaries. Instead of 500 lines of `npm test` output, return `{ passed: 47, failed: 2, failures: [...] }`. The full output is available on request, but the default is minimal.

### 2. AST-Aware Read
`read auth.ts --symbol handleAuth` → returns just that function + its type imports. The file map (read-map) gives you the symbol table. The next step is making symbols directly addressable — "read this function" instead of "read lines 47-89."

### 3. Semantic Edit Verification
An edit tool that runs the linter/typechecker after every edit and returns errors inline. Currently agents edit → run typecheck → read errors → fix → repeat. A self-verifying edit tool collapses that loop.

### 4. Contextual Grep
Grep that returns the *enclosing function/class* for each match, not just ±N context lines. When an agent greps for `fetchUser`, it doesn't need "line 47 and 3 lines around it" — it needs "the `loadProfile()` function in `user-service.ts` calls `fetchUser` at line 47."

### 5. Output Budget Manager
A meta-tool that wraps any command and enforces a token budget on its output. If `npm install` produces 10KB of output, the budget manager returns a 200-byte summary with the full output stored and retrievable on demand.

---

## The Takeaway

The hashline insight generalizes: **every tool interaction should be designed for what the agent needs, not what humans are used to seeing.**

| Human-native property | Agent-native replacement |
|----------------------|-------------------------|
| Visual — pretty output, colors, formatting | Structured — JSON, typed, parseable |
| Exhaustive — show everything, human filters | Minimal — show what matters, expand on demand |
| Positional — line 47, page 3, scroll down | Content-addressed — hash anchors, symbol names |
| Textual — regex matching, string search | Structural — AST matching, semantic search |
| Trust-based — run command, hope it worked | Self-verifying — edit + typecheck, command + validate |
| Sequential — one command at a time | Parallel-safe — atomic, no shared mutable state |
| Ephemeral — output scrolls away | Persistent — results cached, retrievable by reference |

The sharpest agent isn't the one with the biggest context window. It's the one with tools that waste the fewest tokens per insight gained.
