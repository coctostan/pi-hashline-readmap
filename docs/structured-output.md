# Structured output and codemode

`pi-hashline-readmap` keeps user-facing output readable, but tool results also carry structured metadata for integrations that should not parse display text.

[Back to README](../README.md)

## `details.ptcValue`

Tool implementations attach a `details.ptcValue` object where the host supports tool result details. The value is additive: rendered text remains the compatibility surface, while `ptcValue` gives downstream code typed access to paths, ranges, anchors, warnings, summaries, and errors. The field name is historical (it predates Pi codemode); it is kept because sessions persist it and renderers read it. Codemode scripts receive the same data as `structuredContent` (see [codemode integration](#codemode-integration)).

Common structured pieces include:

| Shape | Used for |
|---|---|
| `PtcLine` | Hashlined source lines: `line`, `hash`, `anchor`, `raw`, and display-escaped text. |
| `PtcWarning` | Non-fatal warnings with a stable `code`, message, and optional symbol metadata. |
| `PtcError` | Structured errors with `code`, `message`, optional `hint`, and optional details. |
| `PtcRange` | Start/end line ranges, optionally including total file lines. |
| `PtcFileGroup` | File-grouped ranges and lines for search-style results. |
| `PtcEditResult` | Edit status, summary, diff text, first changed line, warnings, no-op edits, and optional semantic summary. |

The exact `ptcValue.tool` value identifies the producer, such as `read`, `grep`, `ast_search`, `edit`, `write`, `ls`, `find`, or `nu`.

Bundled `nu` is deprecated but retained, including its existing `details.ptcValue` success/error metadata. This deprecation adds no Nu `outputSchema`, no new structured Nu API, and no notices to execution or script results. The seven schema-owned Hashline tools and native Bash keep their existing codemode contracts. See [Nu deprecation and migration](nu-deprecation.md) for the gate and [tested migration recipes](codemode-recipes.md) for bounded composition.

## Anchors in structured output

For anchored line output, prefer `ptcValue.lines[*].anchor` instead of reparsing rendered `LINE:HASH|content` text. The rendered text is for agents and humans; `ptcValue` is for programmatic consumers.

Example line shape:

```json
{
  "line": 45,
  "hash": "4bf",
  "anchor": "45:4bf",
  "raw": "export function createDemoDirectory(): UserDirectory {",
  "display": "export function createDemoDirectory(): UserDirectory {"
}
```

## Error envelopes

Tools attach structured error envelopes to extension-owned failures in `details.ptcValue`. Direct integrations can consume stable `error.code` values there. Codemode rejects by default and does not copy those codes to VM `Error` objects; use the explicitly scoped `errorMode: "value"` option described below.

`PtcError` shape:

```ts
interface PtcError {
  code: string;
  message: string;
  hint?: string;
  details?: unknown;
}
```

## Required nulls at the host boundary

A required parameter supplied as JSON `null` is rejected before Pi's schema conversion can turn it into a valid-looking scalar such as the string `"null"`. Registered Hashline tools use a shared `prepareArguments` guard. Direct `execute()` callers that bypass Pi's pipeline retain the execute-time guard. Optional nulls behave like omission, and documented numeric strings remain accepted. The literal string `"null"` is not a null value and remains a valid path or content string.

The actionable error text is unchanged, for example `Invalid path: expected string, received null.`. Error metadata depends on the boundary:

| Boundary | Failure representation |
|---|---|
| Direct `execute()` call | `isError: true` with `details.ptcValue.error.code: "invalid-null"` |
| Raw argument guard | Throws an `Error` with `code: "invalid-null"` and the same message |
| Pi preparation pipeline | Host reports `isError: true` with the same message, but its generic preparation-error result drops custom error metadata |

Do not assume Pi's preparation-error result contains `details.ptcValue`. Preserving structured preparation errors across this boundary requires upstream host support. Hashline does not change parameter schemas to allow required nulls, reinterpret string `"null"` as null, or patch TypeBox's conversion behavior.

The guard applies to every tool registered by the extension entry point, including optional Nu and the debug tool when enabled. `ls` has no required parameters; its optional-null behavior is tested separately. Compatibility checks audit every registered top-level required parameter and a representative nested edit replacement. They also run valid read/write controls through the real `tool_call` and `tool_result` handlers using `ExtensionRunner`; the `context` handler's registration is audited but the regression does not additionally exercise `emitContext`/context-hygiene staleness, which is a separate observable behavior from null rejection and is out of scope here. This is not exhaustive coverage of every union branch, event lifecycle, cancellation path, or provider integration.

## Codemode integration

For executable composition and compact-result examples, see [codemode recipes](codemode-recipes.md). Keep result variants and failure boundaries below in mind before projecting fields.

Pi exposes declared tool output schemas to scripts. Hashline `read`/`grep`/`ast_search`/`edit`/`write`/`ls`/`find` successes retain structured fields plus rendered `text`. Grep raw source lives only in script records, not compact persisted records. Native Bash keeps its own raw-output schema. Tool annotations retain their read-only/destructive meanings; no alternate execution channel bypasses host guards or permissions.

Large `write` results stay bounded for scripts: above 2000 lines or 50 KB of anchor text the value carries `lines: []`, `truncated: true`, `totalLines`, `bytes`, and an `anchors-omitted` entry in `warnings`, and omits `diff`/`diffData`; call `read` with `offset`/`limit` for anchors. Binary-looking `write` content resolves as a success with a `binary-content` warning (no anchors) instead of rejecting. `ast_search` adds the `invalid-pattern` and `pattern-parse-error` failure codes; `write` adds `invalid-type` for non-string `path`/`content`.

The host tests use the actual selected-host loader and execution pipeline. It verifies image forwarding and saved-image bytes/MIME, nested permission blocking, and nested cancellation with deterministic fixtures. The separate selected-host declaration check compiles extension sources and typed boundary fixtures; legacy loose compatibility adapters and exhaustive provider/session lifecycle checks are not covered by a blanket type-safety claim. See [AGENTS.md](../AGENTS.md#host-compatibility) to run them against another Pi.

### Failure values are opt-in

The seven Hashline schema-owned tools accept `errorMode: "throw" | "value"`. Omission means `"throw"`: failed script calls reject with the error text. An `Error` inside the VM is not promised a custom `code` property.

With `errorMode: "value"`, an extension-owned execute result containing a coded error resolves to `{ text, tool, ok: false, error: { code, message, hint?, details? } }`. Successful values are unchanged. The underlying tool result still has `isError: true`, so direct interactive rendering remains an error.

Required-null/schema preparation, permission blocking, aborts, and arbitrary thrown host exceptions can still reject even in value mode. Do not remove `try/catch` or `Promise.allSettled` when those failures matter. Hashline does not invent codes by parsing prose or patch the sandbox rejection transport.

### Read success variants

- Text: `path`, `range`, `lines`, `continuation` and `warnings`, plus `text`.
- Text window (`charOffset` / `charLimit`): the usual text fields plus `window` = `{ line, charOffset, charLimit, length, totalChars, remainingChars, nextCharOffset }` (`nextCharOffset` is `null` at the end of the line). `lines` has one entry whose `anchor`/`hash` come from the full line while `raw`/`display` hold only the returned window text; `truncation` and `continuation` are `null`.
- Image attachment: `type: "image"`, `data`, `mimeType`, `note` and `text`. Pass the value to `image(result)`; do not `text()` the base64. Bytes come from the actual attachment, including host resize output. Adjustment/resize notes survive. Attachment-only Pi 1.0.0 and newer native structured-image hosts share this contract.
- Ambiguous interactive symbol: `path`, `ambiguity` and `text`; it is a successful choice response, not a file range.
- Other delegated text-only/omitted-image success: `kind: "notice"`, `text` and `warnings`. It is not image-forwardable and has no fabricated anchors.

### Grep completeness

`totalMatches` counts observed match lines admitted into Hashline's normalized search IR, not a repository-wide total when search completeness is unknown. Bare-CR remapping retains its existing normalized-line count semantics.

`completeness` separates independent limits:

| Field | Meaning |
|---|---|
| `search` | `"complete"` means the native result was interpreted without a known native bound or parse gap; `"unknown"` means completeness is not established. This describes the requested search, not ignored or binary repository contents. |
| `limitReached` | Native search reached its match cap. Exact-limit and over-limit inputs are indistinguishable; this is not proof of another match. |
| `nativeTruncated` | The native byte/output budget cut the result; missing repository matches cannot be counted from that response. |
| `omittedMatches` | Known observed match lines missing from structured records after record capping/scoping; `null` for uninterpreted/binary-warning results. Counts unique path/line match records, not context lines or undiscovered matches. |
| `displayTruncated` | Final Hashline display budget or native non-summary line clipping shortened text. Raw script records can still be complete. This does not imply record omission. |

The per-file cap can leave `totalMatches: 60` with 10 returned match records and `omittedMatches: 50` even when `search` is `"complete"`. Summary/scoped results retain these semantics. No extra unbounded count pass is performed. Narrow path/pattern/glob or raise a deliberate match limit when needed.

### Visibility

Calls with `parentToolCallId` record effects and anchor provenance but are not presumed model-visible. Private read/search/Bash results do not acquire stale/retired model-context lifecycle records merely because they executed. Private mutations and successful command reruns still invalidate earlier visible context. Notices for genuinely visible context are emitted once on an outer result.

There is no field-level taint tracking: printing or transforming a nested value does not automatically promote its source call to a tracked visible read. The outer codemode output is the model-visible object. Served anchors and read-before-edit checks remain separate from notice eligibility.

### Example

See [the tested read-union recipe](codemode-recipes.md#handle-the-read-union-before-projecting) for a compact projection that handles text, image, ambiguity, notice, and coded-failure results before accessing source lines. It forwards images with `image()` and never prints base64. Every executable example lives in that tested reference rather than a separate untested copy here.

Compact output unions remain discoverable through `describeTool`. The pinned selected-host test verifies core Hashline declarations fit codemode's default 3000-token inline budget. The former `HASHLINE_TOOL_PTC_POLICY` export and side-channel executor maps remain removed.
## Editing safety

Copy fresh anchors from `read`, `grep`, `ast_search`, or `write`. Replacement text is plain content: never include `LINE:HASH|`, hash-only, or diff prefixes. `edit` strips them defensively only when they are this file's real anchors (a `LINE:HASH|` matching a current line, or bare `HASH|` prefixes of this file on every line) and warns when it does; look-alike text such as `12:30|meeting` or `+ item` is written verbatim, and `literal: true` on `set_line`, `replace_lines`, or `insert_after` disables the cleanup. Set `new_text` to `""` to delete anchored lines and use `"\n"` for an intentionally blank line.

After an edit that shifts line numbers, the result names the first moved old line. Later anchors from before that edit are remapped to where their line moved when unambiguous, and otherwise refused with `hash-mismatch` and fresh rows; they never silently land on a different line with the same content.

Pending `write` and `edit` diffs use textual `+`/`-`/space gutter markers, so their meaning does not depend on color.

`replace` is exact-only by default. `fuzzy: true` only normalizes whitespace and confusable Unicode after exact matching fails, so it is not approximate or semantic matching.

Anchored batches resolve and validate against original-file targets before bottom-up application. Unsafe intersecting replacements/deletions and consumed insertion boundaries fail with `overlapping-edit`, leaving the file unchanged. Keep dependent changes in separate calls. A one-line replacement plus `insert_after` on that same stable line remains valid. Distinct `insert_after` operations sharing the same resolved anchor retain request order.

`write` creates parent directories automatically. `edit` and `write` write atomically through a same-directory temporary file and rename. Symlink targets are followed and the symlink is preserved. Existing files keep their permission mode; newly created files use the OS/umask default. Hard-linked targets are updated in place to preserve the shared inode. In other words, hard-linked targets keep their shared inode, so that exceptional path is not temp-and-rename atomic.

### Whole-symbol replacement and syntax validation

`replace_symbol` replaces one declaration using `Name`, `Class.method`, or `Name@line`. Precise in-memory replacement is available for TypeScript, JavaScript, Rust, and Java. `new_body` is re-indented and must be non-blank; ambiguous and approximate matches use the same selector guidance as symbol reads.

Rust, C++, C headers, and Java can run parser-error validation before writing. `warn` is the default, `block` aborts, and `off` skips validation. Set `PI_HASHLINE_SYNTAX_VALIDATE=block|warn|off`. Existing syntax errors are tolerated; only newly introduced parser errors trigger the regression result.

## Image reads

`read` delegates `jpg`, `jpeg`, `png`, `gif`, and `webp` to Pi's image reader and returns attachments rather than edit anchors. Supported image magic bytes are detected for extensionless or misnamed files before binary/text fallback.

## Composed symbol reads

A symbol may combine with `limit`, `map: true`, and `bundle: "local"`; `symbol+offset` and bundle without `symbol` are invalid. Bundled output is ordered as requested symbol, local support, then full-file map. Truncated full-file text reads append a structural map automatically when available.

On supported files, direct symbol reads can target functions, classes, methods, interfaces, type aliases, constants, and enums. Symbol composition rules are unchanged.

## Structural-search budgets

`ast_search` applies its positive limit, default 100, to raw ast-grep match records before merging ranges. Deterministic line/byte budgets apply to the response. Blocks are admitted whole: an oversized block is omitted with narrowing guidance. Structured `ptcValue.files` retains all records admitted by the result limit, and TUI summaries distinguish anchored lines from omitted AST matches.

## File exploration output

`ls` lists one directory, directories first, including dotfiles, with optional balanced glob filtering. `find` recurses, respects nested `.gitignore`, includes hidden files, and supports depth, regex, sort, mtime, and size filters. `find` matches basenames rather than paths; put the directory in `path`. A glob pattern containing `/` cannot match a basename, and an empty result includes guidance to move the directory portion into `path`. `nu` registers only when Nushell is available and is intended for structured inspection rather than project command execution.

`grep` supports literal and regex search, per-file counts with `summary: true`, and enclosing-symbol scope. Use `scopeContext: 0` to return only matching lines inside the resolved symbol block.

## Compatibility notes

- Treat `ptcValue` as additive metadata, not a replacement for rendered text.
- Use stable fields such as `tool`, `path`, `lines`, `anchor`, `warnings`, and `error.code` when available.
- Avoid parsing rendered text when the same data exists in `ptcValue` or `structuredContent`.
- Decide confirmation and exposure from tool `annotations`: `edit` and `write` are destructive, while `read`, `grep`, `ast_search`, `ls`, and `find` are read-only.

## Physical edit patches

Successful edit results keep `details.diff` and `details.diffData` as logical, line-oriented render data. `details.patch` (also present in the edit structured value) is a unified patch between the actual pre-write and persisted physical file contents, including BOM and LF/CRLF separators. Integrations needing byte-preserving replay should use the patch with newline conversion disabled in their patch consumer, rather than reconstructing bytes from the rendered diff. A newline-only mutation can have an empty logical diff while its physical patch still records a real change.

`postEditVerify: true` verifies persisted content against this physical candidate. It is not a second interpretation of payloads or a newline normalization pass.

## Read snapshot consistency

For a successful symbol read, `range`, `symbol`, `lines`, local-support anchors, and any appended map describe the same captured source bytes. This is an internally coherent snapshot, not a promise that the file cannot change after capture. Path identity remains the original requested file; private mapper staging paths are not exposed as result paths.

The extension-owned error `read-snapshot-unavailable` means symbol-map snapshot acquisition failed. It has the standard read error envelope and no source-line records. In codemode, default mode rejects; `errorMode: "value"` exposes `{ tool: "read", ok: false, error: { code, message }, text }` with this code. The failure does not invoke the successful-read callback or establish a fresh served-line baseline. Ordinary unmappable and strict symbol-lookup classifications are unchanged.
