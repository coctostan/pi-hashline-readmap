Search file contents. Non-summary results return `LINE:HASH` anchors usable directly by `edit`; no follow-up `read` is needed.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Modes

- Default: matching lines only. Output lines are `path:>>LINE:HASH|content`; `>>` marks matches.
- `context: N`: include N lines before/after each match. Context lines use `path:  LINE:HASH|content`; nearby ranges are merged/deduped.
- `summary: true`: return per-file match counts only — no line content or anchors. Use first for broad searches, then narrow with `path`/`glob`.
- `scope: "symbol"`: group matches by enclosing symbol. By default returns the full symbol block. `scopeContext: N` windows to ±N lines around each match, clipped to the symbol; `0` returns only match lines. Ignored when `summary: true`.

## Parameters

- `pattern` — regex by default; use `literal: true` for exact strings or regex metacharacters.
- `path` — file or directory, default cwd.
- `glob` — file filter, e.g. `'*.ts'` or `'**/*.test.ts'`.
- `ignoreCase` — case-insensitive search.
- `context` — non-negative integer surrounding-line count for normal grep.
- `limit` — positive integer maximum match count, default 100.
- `summary` — counts only, no anchors.
- `scope` — only `"symbol"` is supported.
- `scopeContext` — non-negative integer context within symbol scope; requires `scope: "symbol"`.

Obvious base-10 numeric strings are accepted for `context`, `limit`, and `scopeContext`. Fractions and malformed strings are rejected. Negative `context`/`scopeContext` values and non-positive `limit` values return structured parameter errors consistent with read, ls, and find validation.

## Truncation and guidance

If matches hit `limit`, output appends one canonical `[Search stopped at N matches; completeness unknown — refine pattern or increase limit]` notice. The exact-limit case does not prove additional matches exist. Dependency and wrapper notices are deduplicated. Large results may cap returned match records per file and/or head-truncate displayed text by output budget; narrow with `summary`, `path`, `glob`, or a more specific pattern.

Scripts receive `completeness: { search, limitReached, nativeTruncated, omittedMatches, displayTruncated }`. `totalMatches` is the observed/admitted count, not a guaranteed repository total. `omittedMatches` counts known observed matches missing from structured records (or is null for uninterpreted/binary-warning responses); `displayTruncated` only describes text clipping. Raw script lines and compact persisted records are unchanged. See [grep completeness](../docs/structured-output.md#grep-completeness).

`errorMode: "value"` opts into coded extension-owned failure values; host preparation/permission/abort failures can still reject.

Long source lines may be display-truncated in non-summary output while retaining full hash/edit values. Summary mode never reports source-line display truncation because summary output contains no source lines; other relevant diagnostics remain available.

Use `grep` for text search. For structural code patterns such as calls, imports, or JSX, prefer `ast_search`.
