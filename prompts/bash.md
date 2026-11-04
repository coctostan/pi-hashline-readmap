# bash tool — public output contract

This document describes what `pi-hashline-readmap` does to `bash` tool results.
Display extensions (e.g. `pi-tool-display`) and other downstream consumers may
rely on it.

## Model-facing text

The model reads Pi's own bash output with ANSI escape codes stripped; nothing
summarizes, reorders or trims it beyond Pi's own truncation, which keeps the
last 2000 lines or 50 KB and names the full output's file. Two kinds of notice
may join it:

- an anti-pattern hint, after a blank line, when the command reaches for a
  dedicated tool that is active (`[Hint: Prefer the grep tool for content
  search.]` after `rg foo`, and no hint once `grep` is inactive);
- the doom-loop and context-hygiene notices, before the output and a `---`
  line.

`structuredContent` stays Pi's native value: scripts receive the raw output,
`exit_code` and Pi's own truncation and `full_output_path`.
