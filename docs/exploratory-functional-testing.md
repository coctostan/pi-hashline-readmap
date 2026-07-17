# Exploratory Functional Testing Note

Current repo snapshot note for `pi-hashline-readmap`.

- Date: 2026-07-17
- Repo: `pi-hashline-readmap`
- Scope: current expected behavior of the package, based on the present codebase and passing automated suite

## Current baseline

Validation at the time of this note:

```bash
npm run typecheck
npm test
```

Expected result:

- `npm run typecheck` — passes
- `npm test` — passes

This document is not a bug diary. It is the current testing reference for what the package is expected to do.

## Expected functionality

### Hashline settings JSON

Expected behavior:

- reads global settings from `~/.pi/agent/hashline-readmap/settings.json`
- reads project settings from `<repo>/.pi/hashline-readmap/settings.json`
- does not read unsupported paths such as `~/.pi/agent/settings.json`, `<repo>/.pi/settings.json`, `~/.pi/hashline-readmap/settings.json`, or `<repo>/.pi/hashline-readmap.json`
- applies precedence as env vars > project JSON > global JSON > built-in defaults
- supports JSON fields for grep budgets, map-cache directory/enabled state, and Bash context guard settings
- preserves existing env-only behavior for all supported `PI_HASHLINE_*` variables
- ignores malformed JSON files safely and reports non-fatal warnings where available
- ignores invalid field values field-by-field where practical
- treats budget fields as strict positive base-10 integers and ignores zero, negative, signed, decimal, hex, exponent, separator, empty, and whitespace-only values

Practical expectation:

- a user should be able to move durable Hashline configuration out of shell startup files and into global or project JSON settings, while still using env vars for temporary overrides

JSON settings verification procedure:

- create a temporary global settings file at `~/.pi/agent/hashline-readmap/settings.json` with a below-default `grep.maxLines`, run `grep` against a result set larger than that limit, and confirm the visible output budget follows the JSON value
- create a project settings file at `<repo>/.pi/hashline-readmap/settings.json` with a different `grep.maxLines` and confirm it overrides the global JSON value when no `PI_HASHLINE_GREP_MAX_LINES` env var is set
- remove or rename both canonical JSON files, set the equivalent `PI_HASHLINE_*` env vars, and confirm the existing env-only grep, map-cache, and Bash context-guard behavior still applies
- set both JSON and env values for the same field, then confirm the env value wins; include `PI_HASHLINE_MAP_CACHE_DIR`, `PI_HASHLINE_NO_PERSIST_MAPS=1`, and `PI_HASHLINE_BASH_CONTEXT_GUARD=0` in this override check
- put settings in unsupported paths such as `~/.pi/agent/settings.json`, `<repo>/.pi/settings.json`, `~/.pi/hashline-readmap/settings.json`, or `<repo>/.pi/hashline-readmap.json`, with canonical files absent, and confirm those files have no effect
- introduce malformed JSON and invalid budget values, then confirm public tool resolvers continue without throwing and fall back to valid env, valid other JSON fields, or defaults

### `read`

Expected behavior:

- returns `LINE:HASH|content` hashlines for text files
- supports targeted reads via `offset` and `limit`
- appends a structural map automatically when a file is truncated
- supports `map: true` to request a structural map explicitly
- supports `symbol` lookup for mapped file types
- supports `bundle: "local"` for same-file support context around a symbol read
- warns and falls back sensibly for unmappable files or missing symbols
- handles binary-ish / control-character-heavy input defensively enough to avoid unsafe raw rendering in normal output

Practical expectation:

- a user should be able to inspect a large file, jump to a symbol, and obtain stable anchors for later edits without rereading the whole file unnecessarily

### `edit`

Expected behavior:

- applies anchor-verified edits using anchors from `read`, `grep`, or `ast_search`
- supports `set_line`, `replace_lines`, `insert_after`, and `replace`
- rejects stale anchors with useful mismatch diagnostics
- returns diff-oriented result metadata in structured output
- emits additive semantic edit summaries without changing the core success text contract
- preserves line-ending behavior correctly enough for normal text editing workflows, including prior regressions around CRLF handling

Practical expectation:

- a user should be able to read a line, edit exactly that line, and get safe failure if the file drifted

### `grep`

Expected behavior:

- returns anchored matches suitable for direct use with `edit`
- supports regex and literal search
- supports `ignoreCase`, `context`, `limit`, and `summary`
- supports `scope: "symbol"` to group results by enclosing mapped symbol when available
- truncates large result sets with explicit indicators instead of failing silently
- supports opt-in final visible output budgets through `PI_HASHLINE_GREP_MAX_LINES` and `PI_HASHLINE_GREP_MAX_BYTES`
- handles problematic file content defensively enough to avoid misleading raw output where possible

Practical expectation:

- a user should be able to search, understand the enclosing code region, and edit from the search result directly

### `ast_search`

Expected behavior:

- wraps `ast-grep` for structural search
- returns merged anchored match blocks grouped by file
- supports no-match cases cleanly rather than surfacing them as execution failures
- integrates cleanly into search → edit workflows

Prerequisite:

- `ast-grep` must be installed locally for real execution

### `bash` output normalization and recovery

Expected behavior:

- preserves command output without command-aware summarization or semantic rewriting
- strips ANSI escape sequences
- appends additive anti-pattern hints without replacing command output
- validates Pi-provided Bash `fullOutputPath` values before reading them and only restores from valid temporary full-output files
- writes recoverable full normalized output when the Bash context guard trims the visible result
- writes an original-output snapshot when the guard trims and Pi did not provide a valid original full-output path
- exposes stricter-only guard controls through `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES`, `PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES`, `PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES`, and `PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES`
- disables the guard/original-restoration layer only when `PI_HASHLINE_BASH_CONTEXT_GUARD=0`

Practical expectation:

- local development commands should remain semantically faithful while oversized results stay recoverable outside the model context

### Context hygiene metadata

Expected behavior:

- read/search/command/mutation tool results expose additive `details.contextHygiene` metadata
- `context_hygiene_report` registers only when `PI_CONTEXT_HYGIENE_DEBUG=1`
- debug reports are read-only and do not mutate tracker state

## Areas covered by the current automated suite

The present test suite covers, at minimum:

- entry-point registration
- hashline generation
- `read` output shape, truncation, maps, symbol lookup, local bundles, and rendering helpers
- `edit` output, diff generation, semantic classification, difftastic integration/fallbacks, and anchor safety
- `grep` output, summary mode, symbol-scoped grouping, truncation indicators, and rendering helpers
- `ast_search` formatting, schema handling, execution behavior, no-match behavior, and path handling
- binary / control-character handling regressions
- map cache behavior
- Bash ANSI normalization, semantic-output preservation, context-guard recoverability, and guard configuration
- public PTC policy/value contracts
- context-hygiene metadata and debug-tool registration
- configurable grep output budgets
- README / prompts / scripts file integrity checks

## Manual spot-check guidance

When doing manual validation beyond the automated suite, the highest-value checks are:

1. `read` on a large source file with `map: true`
2. `read(symbol=...)` on an ambiguous and an unambiguous symbol
3. `grep(..., scope: "symbol")` on a mapped TypeScript or Python file
4. `ast_search(...)` with both a match and a deliberate no-match query
5. `edit` using a fresh anchor, then repeating with a stale anchor to confirm mismatch handling
6. representative `bash` commands such as `npm test`, `tsc --noEmit`, `git diff --stat`, `eslint --version`, `docker build`, and `curl`, confirming their output is preserved

## Non-goals of this note

This file should stay short and current.

It should not become:

- a historical session log
- a list of already-fixed bugs
- a scratchpad for temporary repro steps
- a substitute for the automated test suite

If a new issue is found, capture it in issue tracking or a focused repro test rather than expanding this note indefinitely.
