# bash tool — public output contract

This document describes the **stable, public** fields that `pi-hashline-readmap`
attaches to `bash` tool results. Display extensions (e.g. `pi-tool-display`) and
other downstream consumers may rely on these shapes.

## `details.rtkCompaction`

```ts
type RtkCompaction = {
  applied: boolean;
  techniques: string[];
  truncated: boolean;
  originalLineCount?: number;
  compactedLineCount?: number;
};
```

The same value is mirrored at `details.ptcValue.rtkCompaction` (deep-equal).

### Semantics

- **`applied`** — `true` iff at least one RTK technique modified the bash
  output. `false` means RTK had the **opportunity** to run but produced no
  change.
- **`techniques`** — ordered array of technique IDs that fired. Today the
  pipeline reports at most one entry; the field is an array so multi-technique
  pipelines remain representable without a contract change. Possible IDs are the
  values used in `src/rtk/bash-filter.ts`: `git`, `linter`, `build-tools`,
  `build`, `package-manager`, `docker`, `file-listing`, `http-client`,
  `transfer`, `test-output`.
- **`truncated`** — `true` iff an RTK route truncated output beyond a size
  budget *inside* the routed compression step. This is detected from the
  deterministic truncation markers emitted by current RTK routes (for example
  `... N lines omitted ...`, `... +N more changes`, and `[... N more lines]`).
  Only routed RTK compression techniques can set this field; post-RTK guard
  trimming and test-output ANSI normalization do not.
- **`originalLineCount` / `compactedLineCount`** — newline-split line counts of
  the pre-RTK and post-RTK strings. Both are present when measurable; both are
  omitted when not (e.g. the empty-input fast path).

### Presence guarantee

`details.rtkCompaction` is present on every bash tool result where the RTK
pipeline had the opportunity to inspect output. That includes:

- routed RTK compression (the normal case)
- the test-output short-circuit (`npm test`, `vitest`, etc.)
- failed command output (specialized route reducers are skipped; test-output normalization can still apply)
- the `PI_RTK_BYPASS=1` bypass path
- the empty-input fast path

Bash results that never reach RTK (e.g. when bash filtering is disabled at the
extension level before `filterBashOutput` is called) do not include the field.

### Out of scope

`rtkCompaction.truncated` reflects only RTK route-internal truncation. The
post-RTK `bashContextGuard` layer has its own metadata at
`details.bashContextGuard` and is **not** folded into `rtkCompaction.truncated`.

## Related stable fields

- `details.bashContextGuard` — post-RTK recoverable context guard metadata.
- `details.bashOriginalOutput` — pointer/snapshot of the original pre-RTK output
  when the guard trimmed visible text.
- `details.compressionInfo` — internal diagnostic shape (byte counts, single
  technique, bypass marker); kept for backwards compatibility but **not** the
  stable consumer surface — use `details.rtkCompaction` instead.
