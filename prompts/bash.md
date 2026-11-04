# bash tool — public output contract

This document describes what `pi-hashline-readmap` does to `bash` tool results
and the **stable, public** fields it attaches to them. Display extensions (e.g.
`pi-tool-display`) and other downstream consumers may rely on these shapes.

## Model-facing text

The model reads Pi's own bash output with ANSI escape codes stripped; nothing
summarizes or reorders it, and only the context guard below trims it, keeping
the whole recoverable. Two kinds of notice may join it:

- an anti-pattern hint, after a blank line, when the command reaches for a
  dedicated tool (`[Hint: Prefer the grep tool for content search.]` after
  `rg foo`);
- the doom-loop and context-hygiene notices, before the output and a `---`
  line.

`structuredContent` stays Pi's native value: scripts receive the raw output,
`exit_code` and Pi's own truncation and `full_output_path`.

## Stable fields

- `details.bashContextGuard` — recoverable context guard metadata. When the
  model-facing text passes the guard's line or byte budget, the guard saves it
  to a `0600` temp file and shows a head-and-tail preview naming that file.
- `details.bashOriginalOutput` — pointer to the full output whenever the guard
  trimmed visible text: Pi's full-output file when Pi truncated, else a `0600`
  temp copy of the visible output byte for byte. Read it to recover what was
  cut without re-running the command. When no copy can be saved,
  `snapshotWriteError` says why.
