# Hygiene & Token Caching

How `pi-hashline-readmap`'s context-hygiene mechanisms interact with LLM
prefix caching. Written from observations of the in-session tool surface
plus an external Node harness driving `registerReadTool` /
`registerEditTool` / `registerGrepTool` directly.

## Background: how prefix caching works

Anthropic and most other providers cache **exact prefix matches** of the
conversation. A new turn hits cache up to the first byte that differs from
a previous turn; everything after that is recomputed. So anything that
both:

1. lives in the historical transcript, and
2. changes between otherwise-similar turns

invalidates cache from that point forward.

That makes "what bytes does each tool result emit, and how stable are
they?" the right lens for evaluating hygiene's caching impact.

## What this hygiene system puts into the transcript

Every tool result the agent sees carries:

1. **Hashlines on every line** of every `read` / `grep` / `ast_search`
   result — e.g. `1:3c8|alpha`. The hash is deterministic from
   `(lineNumber, lineContent)` (3-hex; see `HASH_LEN` in
   `src/hashline.ts`).
2. **Verbose guard error blocks** when something goes wrong:
   - The stale-read guard's multi-sentence prose (~250 bytes).
   - The `>>>` auto-relocation table after a hash mismatch
     (~200–600 bytes, embeds live anchors for nearby lines).
   - No-op diagnostics that include current-line previews.
3. **No success-path hygiene metadata** in the rendered text — the
   `details.contextHygiene` block (keys: `schemaVersion`, `tool`,
   `classification`, `resources`, `rehydrate`) exists on success but is
   not surfaced to the agent. For caching purposes, this is a feature.

## Net effects on cache hit rate

### Where it helps caching

- **Stable hashes for unchanged lines.** Re-reading the same file across
  turns produces byte-identical output, so the second `read` reuses cache
  cleanly. Hashes are derived from `(line, content)` only — no
  timestamps, run IDs, or random salts.
- **Compact, deterministic anchored grep / ast_search output.** Same
  query → same bytes → cache hit.
- **Stripped success-path metadata.** `contextHygiene` lives in
  `result.details`, not in the visible text, so the success transcript
  stays small and cache-friendly.
- **Narrowing tools shrink the cached payload.** `offset`, `limit`,
  `symbol`, and `map: true limit: 1` keep cached reads small and let them
  survive downstream edits to unrelated parts of the file.
- **Replaces noisier tools.** The bash anti-pattern hint nudging
  `cat foo` → `read foo` keeps file inspection on the deterministic
  output path instead of bash's variable formatting.

### Where it hurts caching

- **Edits invalidate downstream hashlines for that file.** When line N
  changes, line N's hash changes; if the edit also shifts line numbers
  (insert/delete), every later line's `lineNumber:hash` anchor changes
  too. Any later turn that re-reads the file produces a different byte
  stream, cache-missing from the first changed line onward. Unavoidable
  given positional hashes.
- **Verbose error paths are cache poison if they recur.** The stale-read
  guard message and the `>>>` auto-relocation block are 200–600 bytes
  each. If the agent loops on them (try → fix → try again), each
  attempt's error text differs slightly (different anchors in the `>>>`
  table after each edit attempt), so prior turns' cached suffixes don't
  reuse. This is the "doom loop" the `tests/doom-loop-*.test.ts` family
  is named after.
- **Auto-relocation tables embed live file state.** The fresh anchors
  shown after a mismatch encode the *current* file contents. If the file
  changes again, the same query produces different help text, so
  retries don't fingerprint identically.
- **Bash output is normalized without semantic rewriting.** ANSI stripping and additive hints are deterministic per input, but they do not shield against upstream nondeterminism such as timestamps and temporary paths emitted by tools.

### Neutral / depends on usage

- **Structural maps** (`read map: true`) are stable while the file's
  symbol layout is stable. Small body edits don't change the map;
  signature / name / scope changes do. So `read map: true` is more
  cache-stable than re-reading bodies, *if* you're not editing
  structure.
- **`MAPPER_VERSION` bumps and the persistent map cache** affect *disk*
  cache between sessions. They don't directly change transcript bytes,
  so they're orthogonal to LLM token caching.

## Quantitative intuition

A typical edit cycle on one file:

1. `read foo.ts` → big payload, cached after the first turn. ✅
2. `edit foo.ts` (success) → small diff result, cheap, cache survives. ✅
3. `read foo.ts` again → **cache miss starting at the first changed
   line's hashline**, because every following line's anchor shifted.
   The pre-edit prefix (header, metadata, lines before the edit) still
   hits cache.
4. Repeat #3 after another edit → another partial invalidation at the
   new edit point.

So hygiene is **prefix-cache-friendly up to the first edit**, then
progressively erodes the cached suffix as edits accumulate. The system
implicitly rewards:

- reading once and editing many times before re-reading,
- using `symbol`, `offset`, `limit` to keep the cached read window
  small,
- editing top-down so cache-miss regions are contiguous.

## Possible improvements (if caching cost mattered enough to optimize)

1. **Stabilize auto-relocation output.** Instead of inlining a live
   anchor block on mismatch, print a fixed "re-read the file to refresh
   anchors" line. Trades agent ergonomics for cache stability.
2. **Surface hygiene success badges in a fixed template.**
   `[anchors fresh]` is cache-friendly; `[anchors fresh, last read
   3 turns ago]` is not.
3. **Optional content-only re-read mode.** Re-reads that don't intend to
   edit could omit hashes, so unchanged-line bytes match across edits to
   other lines.
4. **Suppress the `>>>` table when the same mismatch fires twice in a
   row.** Show it once, then a stable "still stale; re-read" line.

## Bottom line

The hygiene system is **net cache-positive on read-heavy workflows**
(deterministic hashlines, small narrowing windows, structural maps) and
**net cache-negative on edit-heavy workflows on the same file**
(positional hashes invalidate suffixes; verbose error paths invalidate
retries).

The design explicitly trades some cache stability for agent correctness
— making sure the agent edits the right line is worth more than saving
prefix-cache tokens on a retry. That's the right trade, but worth being
aware of when planning long edit sequences:

> Read once, batch edits, prefer `symbol` / `offset`-narrowed re-reads.

## Appendix: how this was verified

Two complementary probes:

- **In-session probes.** Triggered each hygiene mechanism via this
  agent's `read` / `edit` / `grep` / `ast_search` tools and recorded the
  verbatim diagnostics: stale-read guard, hash mismatch with `>>>`
  auto-relocation, no-op diagnostic, binary read/edit guard, invalid
  anchor format, invalid edit variant, etc.
- **External harness.** A Node script (`tmp/external-probe/harness.mjs`,
  not committed) wired the real tool registrations against a mock `pi`
  API with a custom `wasReadInSession` `Set<string>` tracker, and
  inspected `result.details.ptcValue.error.code` and
  `result.details.contextHygiene` directly. This exposed:
  - the structured error taxonomy (`file-not-read`, `hash-mismatch`,
    `invalid-edit-variant`, `binary-file`, …),
  - the `contextHygiene` metadata block attached to every successful
    call,
  - the read-tracker populating from `read` (and intended to populate
    from `grep` matched files).

Both align with the test suite (1231 tests across 259 files passing,
including ~20 `tests/context-hygiene-*.test.ts` and ~10
`tests/doom-loop-*.test.ts` files).
