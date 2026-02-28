# Product Requirements Document — pi-hashline-readmap

## Overview

**pi-hashline-readmap** is a unified pi-coding-agent extension that combines the best of three community extensions — `pi-hashline-edit` (v0.3.0), `pi-read-map` (v1.3.0), and `pi-rtk` (v0.1.3) — into a single, conflict-free package that provides agent-native file reading, editing, searching, navigation, and bash output compression tools.

## Problem Statement

### The Tool Conflicts
Both `pi-hashline-edit` and `pi-read-map` register a `read` tool. Only one can win — whichever loads second overwrites the first. Users must choose between:
- **Hash-anchored editing** (hashline) — content-addressable lines for drift-proof surgical edits
- **Structural file maps** (read-map) — AST-based symbol tables for navigating large codebases
Meanwhile, `pi-rtk` hooks `tool_result` events to post-process output. Its source code filtering and search result grouping are **fundamentally incompatible** with hashlines — filtering changes content that's been hashed, breaking the read↔edit contract. But its bash output techniques (test aggregation, build filtering, git compaction, ANSI stripping) are perfectly complementary.

### The Token Waste
Even with all three tools, agents waste enormous amounts of tokens:
- Reading 2,000 lines when they need a 40-line function
- Text-grepping and getting false positives mixed with real matches
- Running bash commands that produce 500 lines of output when 1 line would suffice

## Goals

### Phase 1: Unification (MVP)
Merge hashline-edit and read-map into a single extension that provides:
1. **Hash-anchored read** — every line output as `LINE:HASH|content`
2. **Structural maps on truncation** — large files get symbol tables appended
3. **Hash-verified edits** — surgical, atomic, drift-proof edits via hash anchors
4. **Hash-anchored grep** — search results with directly editable anchors

### Phase 2: Symbol-Addressable Read
Add a `symbol` parameter to the read tool:
```
read("checker.ts", { symbol: "checkExpression" })
→ Returns only lines 200-890, hashlined
```
Eliminates the #1 token waste pattern: reading 2,000 lines to find a 40-line function.

### Phase 3: AST-Grep Integration
Wrap `ast-grep` as a pi-native tool returning hashlined results:
```
sg({ pattern: "console.log($$$)", lang: "ts" })
→ Matches with >>LINE:HASH| anchors, ready for editing
```
Closes the loop: structural search → hashlined results → surgical edit.

### Phase 4: Bash Output Compression (from pi-rtk)
Absorb pi-rtk's proven bash output techniques into the unified extension:
- **Test output aggregation** — `npm test` → summary + failure details only
- **Build output filtering** — `tsc` / `cargo build` → error summary
- **Git compaction** — compact diffs, status summaries, log truncation
- **Linter aggregation** — group lint errors by rule and file
- **ANSI stripping** — remove color codes from all bash output

These operate on `tool_result` events for bash output only — never touching hashlined read/grep results.

## Non-Goals
- **Source code filtering for token savings** — fundamentally incompatible with hashlines (filtering changes content that's hashed, breaking the read↔edit contract). Token savings for source come from read-map's structural maps and symbol-addressable reads instead.
- **Search result grouping/reformatting** — would mangle hashline grep's `>>FILE:LINE:HASH|content` format
- **Contextual grep** (enclosing function) — ast-grep + read-map's symbol table covers 90%
- **Output budget manager** — diminishing returns vs structured parsing
- **Semantic diff tool** — `difftastic` exists, install via brew
- **Full AST-aware edit** — `ast-grep --rewrite` already does this via bash

## Users
- Developers using pi-coding-agent who want the best agent-native tools
- Anyone currently using either pi-hashline-edit or pi-read-map separately

## Success Criteria
1. **Zero conflicts** — single `registerTool("read")` call, no competing extensions needed
2. **Small files** — hash-anchored output, zero overhead from map generation
3. **Large files** — hash-anchored output + structural map, enabling targeted reads
4. **Edit reliability** — hash-verified edits with smart relocation, merge detection, echo stripping
5. **Backwards compatible** — all existing hashline-edit and read-map behaviors preserved
6. **Symbol reads** (Phase 2) — 95%+ reduction in tokens for targeted function reads
7. **Bash compression** (Phase 4) — 60-90% token reduction on test/build/git output
8. **Test coverage** — unit tests for integration point, e2e tests for combined flow

## Technical Constraints
- Must work as a standard pi extension (`pi install`)
- Peer dependencies: `@mariozechner/pi-coding-agent`, `@sinclair/typebox`
- Runtime dependencies: `xxhashjs`, `diff`, `tree-sitter`, `tree-sitter-cpp`, `tree-sitter-rust`, `tree-sitter-clojure`, `ts-morph`
- Map generation must be silent on failure — always return hashlined content even if AST parsing fails
- Map generation only triggers on truncation + no offset/limit (same as read-map's current behavior)

## Upstream Sources
- **hashline-edit**: https://github.com/RimuruW/pi-hashline-edit (v0.3.0, MIT) — hash-anchored read/edit/grep
- **read-map**: https://github.com/Whamp/pi-read-map (v1.3.0, MIT) — structural file maps for large files
- **rtk**: https://github.com/mcowger/pi-rtk (v0.1.3, MIT) — bash output techniques only (test/build/git/linter/ANSI)

## Why Not Just Install All Three?

1. **hashline-edit and read-map conflict** — both register `read`, last one wins
2. **rtk's source filtering breaks hashlines** — filtering changes hashed content, edits fail or silently destroy comments
3. **rtk's search grouping breaks hashline grep** — reformats `>>FILE:LINE:HASH|` anchors into unusable summaries
4. **Three separate packages = configuration burden** — users must know which RTK techniques to disable

pi-hashline-readmap solves all four by unifying at the source level — one install, zero conflicts, zero configuration.
