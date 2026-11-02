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
  dropped: { count: number; unit: string }[];
  originalLineCount?: number;
  compactedLineCount?: number;
};
```

The same value is mirrored at `details.ptcValue.rtkCompaction` (deep-equal).

### Semantics

- **`applied`** — `true` iff at least one RTK technique modified the bash
  output. `false` means RTK had the **opportunity** to run but produced no
  change. Stripping ANSI codes and appending an anti-pattern hint are no
  compaction, except under `test-output`, whose one technique is ANSI
  stripping.
- **`techniques`** — ordered array of technique IDs that fired. Today the
  pipeline reports at most one entry; the field is an array so multi-technique
  pipelines remain representable without a contract change. Possible IDs are the
  values used in `src/rtk/bash-filter.ts`: `git`, `linter`, `build-tools`,
  `build`, `package-manager`, `docker`, `file-listing`, `http-client`,
  `transfer`, `test-output`.
- **`truncated`** — `true` iff an RTK route cut output past a size budget
  *inside* the routed compression step, ending the cut with a marker that
  names the true count in its unit (for example `... and N more lines`,
  `  ... and N more files`, `[... N more lines]`, `Total: N entries in M
  directories`; `docs/bash-output.md` lists them all): exactly when `dropped`
  is non-empty. Noise filters, such as dropped progress lines, set nothing.
  Only routed RTK compression techniques can set this field; post-RTK guard
  trimming and test-output ANSI normalization do not.
- **`dropped`** — one `{ count, unit }` per drop marker in the output, in
  output order, as the route reported it when it wrote the marker (`... and 3
  more commits` is `{ count: 3, unit: "commits" }`). A marker-like line the
  command printed itself is no drop. Always present; `[]` when nothing was
  dropped.
- **`originalLineCount` / `compactedLineCount`** — newline-split line counts of
  the pre-RTK and post-RTK strings, the post-RTK one counting any anti-pattern
  hint. Both are present when measurable; both are omitted when not (e.g. the
  empty-input fast path).

### Presence guarantee

`details.rtkCompaction` is present on every bash tool result where the RTK
pipeline had the opportunity to inspect output. That includes:

- routed RTK compression (the normal case)
- the test-output short-circuit (`npm test`, `vitest`, etc.)
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
  whenever RTK compacted the output or the guard trimmed visible text. Its
  `originalPath` is the path the RTK notice names as `Original output: <path>`:
  Pi's full-output file when Pi truncated, else a `0600` temp copy of the
  pre-RTK output byte for byte. Read it to recover what was cut without
  re-running the command. When no copy can be saved, RTK leaves the output
  uncompressed and `snapshotWriteError` says why.
- `details.compressionInfo` — internal diagnostic shape (byte counts, single
  technique, bypass marker); kept for backwards compatibility but **not** the
  stable consumer surface — use `details.rtkCompaction` instead.
