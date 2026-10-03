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

Tools use structured error envelopes when a failure should be machine-readable. Consumers should key off stable error `code` values where available and treat display text as explanatory context.

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

Pi 0.99+ (verified against 1.0.0) ships a `codemode` tool whose JavaScript scripts call other tools through `ctx.executeTool()`. A tool that declares `outputSchema` resolves inside scripts to its `structuredContent`; other tools resolve to their text. Hashline registers every tool through a codemode integration layer (`src/codemode-integration.ts`) that:

- declares a compact `outputSchema` for `read`, `grep`, `ast_search`, `edit`, `write`, `ls`, and `find`, so codemode descriptions say what a call resolves to (for example, `tools.read(args)` resolves to `{ text, path, range, lines, continuation, warnings }`);
- sets `structuredContent` on successful results to `{ text, ...details.ptcValue }`, where `text` is the exact model-facing output, so `await tools.read({ path })` gives scripts `lines[*].anchor` and `lines[*].raw` without reparsing `LINE:HASH|` text;
- adds raw source text to `grep` script records (`records[*].raw`) only in `structuredContent`. Persisted `details.ptcValue.records` stay compact, and `structuredContent` is neither persisted in the session nor sent to the model;
- leaves error results without `structuredContent`, so failed script calls keep rejecting with the tool's error text;
- declares MCP-style `annotations`: `read`, `grep`, `ast_search`, `ls`, `find`, and the debug `context_hygiene_report` are `readOnlyHint: true, openWorldHint: false`, and `edit` and `write` are `destructiveHint: true`. `bash` and `nu` run arbitrary commands, so they keep Pi's conservative defaults (not read-only, possibly destructive, open world). Permission extensions can rely on these hints.

Calls that a script makes carry `parentToolCallId`. Hashline still records their context-hygiene effects, so a script's `edit` marks earlier model-visible reads stale. It does not count them toward repeated-call (doom-loop) warnings, and it does not prefix model-facing notices onto their results: scripts receive clean values, and pending notices go to the next result the model actually sees.

Example script:

```js
const g = await tools.grep({ pattern: "TODO", path: "src", literal: true });
for (const r of g.records.filter((r) => r.kind === "match")) {
  await tools.edit({ path: r.path, edits: [{ set_line: { anchor: r.anchor, new_text: r.raw.replace(/\s*\/\/ TODO$/, "") } }] });
}
return `${g.totalMatches} TODOs cleaned`;
```

With `codemode.mode: "only"`, these declarations are listed in the codemode description within `codemode.inlineBudget`. The compact schemas keep all Hashline tools within the default budget.

The `HASHLINE_TOOL_PTC_POLICY` export, per-tool `ptc` metadata, and the `hashline:tool-executors` / `globalThis.__hashlineToolExecutors` executor map served the separate PTC extension, which codemode replaced. They were removed; use `annotations` and `ctx.executeTool()` instead.
## Editing safety

Copy fresh anchors from `read`, `grep`, `ast_search`, or `write`. Replacement text is plain content: never include `LINE:HASH|`, hash-only, or diff prefixes. `edit` strips them defensively when they dominate the replacement, but callers should omit them. Set `new_text` to `""` to delete anchored lines and use `"\n"` for an intentionally blank line.

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
