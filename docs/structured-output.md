# Structured output and PTC policy

`pi-hashline-readmap` keeps user-facing output readable, but tool results also carry structured metadata for integrations that should not parse display text.

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

The extension exports a static PTC policy for downstream integrations:

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

## Compatibility notes

- Treat `ptcValue` as additive metadata, not a replacement for rendered text.
- Use stable fields such as `tool`, `path`, `lines`, `anchor`, `warnings`, and `error.code` when available.
- Avoid parsing rendered text when the same data exists in `ptcValue`.
- Mutating consumers should honor the exported policy: `edit` and `write` are mutating and not safe-by-default, while `read`, `grep`, `ls`, and `find` are read-only.
