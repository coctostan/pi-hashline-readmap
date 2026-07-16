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

## Stale-result policy

`contextHygiene.staleResults` makes the cache-versus-context trade-off explicit:

- `replace` (default) substitutes historical stale/retired tool output at the provider-context seam. It immediately reclaims context but invalidates exact-prefix cache reuse from the first replacement.
- `append-only` preserves every historical provider-input byte and appends deterministic notices to the invalidating or superseding result. This preserves prefix-cache reuse; the original stale tokens still count toward the model's context window until normal compaction.
- `disabled` preserves history without adding notices.

There is no mode that can delete bytes from the middle of provider input while retaining cache reuse after those bytes. Compaction is the natural explicit cache-reset point for reclaiming append-only history.

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
- **Default stale-result replacement rewrites an earlier prefix.** After a same-file mutation, `replace` substitutes the full historical result with a placeholder. Providers that cache exact prefixes cannot reuse the cached suffix after that result. When the common prefix before it is below the provider's cache threshold, usage can report `cacheRead: 0`. Use `contextHygiene.staleResults: "append-only"` when preserving that cache is more important than immediately reclaiming stale tokens.
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
- **Bash output passes through RTK compression.** RTK is deterministic
  per input, so it doesn't introduce nondeterminism — but it doesn't
  shield against upstream nondeterminism (timestamps, paths, ANSI codes
  from tools the user runs) either.

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

A typical edit cycle on one file differs by policy:

1. `read foo.ts` → big payload, cached after the first turn.
2. `edit foo.ts` succeeds.
   - `replace`: the earlier read is substituted, so cache reuse stops at the replacement point.
   - `append-only`: the earlier read stays byte-identical and the edit result gains a deterministic stale notice, so the existing prefix remains reusable.
3. `read foo.ts` again → this new read differs starting at the first changed hashline. That affects caching of the newly appended read, but `append-only` still preserves the older cached conversation prefix.
4. Normal pi compaction eventually summarizes old history and starts a deliberate new cache epoch.

Narrow `symbol` / `offset` / `limit` reads remain useful in either mode because they reduce both context-window use and the amount of new content that must be cached.

## Further possible improvements

1. **Stabilize auto-relocation output.** Instead of inlining a live anchor block on mismatch, print a fixed "re-read the file to refresh anchors" line. Trades agent ergonomics for cache stability.
2. **Surface hygiene success badges in a fixed template.** `[anchors fresh]` is cache-friendly; `[anchors fresh, last read 3 turns ago]` is not.
3. **Optional content-only re-read mode.** Re-reads that don't intend to edit could omit hashes, so unchanged-line bytes match across edits to other lines.
4. **Suppress the `>>>` table when the same mismatch fires twice in a row.** Show it once, then a stable "still stale; re-read" line.

## Bottom line

The hygiene system offers two legitimate priorities:

- `replace` maximizes immediate stale-context removal and context-window reclamation, at the cost of rewriting the cached provider prefix.
- `append-only` preserves exact-prefix cache reuse while still giving the model a stale-result safety signal, at the cost of retaining the historical payload until compaction.

Hash validation and read-before-edit expiration remain active in every mode; the setting changes provider-context presentation, not edit safety.

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
