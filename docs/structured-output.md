# Structured output and PTC policy

`pi-hashline-readmap` keeps user-facing output readable, but tool results also carry structured metadata for integrations that should not parse display text.

[Back to README](../README.md)

## `details.ptcValue`

Tool implementations attach a `details.ptcValue` object where the host supports tool result details. The value is additive: rendered text remains the compatibility surface, while `ptcValue` gives downstream code typed access to paths, ranges, anchors, warnings, summaries, and errors.

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

## Exported PTC policy

The extension exports a static `HASHLINE_TOOL_PTC_POLICY` for downstream integrations:

```ts
import {
  HASHLINE_TOOL_PTC_POLICY,
  getHashlineToolPtcPolicy,
} from "pi-hashline-readmap";
```

Policy entries describe:

- tool name
- helper name
- whether the tool overrides a built-in pi tool
- mutability (`read-only` or `mutating`)
- default exposure (`safe-by-default`, `opt-in`, or `not-safe-by-default`)

Current policy summary:

| Tool | Helper | Overrides built-in | Mutability | Default exposure |
|---|---|---:|---|---|
| `read` | `read` | Yes | `read-only` | `safe-by-default` |
| `grep` | `grep` | Yes | `read-only` | `safe-by-default` |
| `ast_search` | `ast_search` | No | `read-only` | `opt-in` |
| `edit` | `edit` | Yes | `mutating` | `not-safe-by-default` |
| `write` | `write` | Yes | `mutating` | `not-safe-by-default` |
| `ls` | `ls` | Yes | `read-only` | `safe-by-default` |
| `find` | `find` | Yes | `read-only` | `safe-by-default` |
| `nu` | `nu` | No | `read-only` | `opt-in` |

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
- Avoid parsing rendered text when the same data exists in `ptcValue`.
- Mutating consumers should honor the exported policy: `edit` and `write` are mutating and not safe-by-default, while `read`, `grep`, `ls`, and `find` are read-only.
