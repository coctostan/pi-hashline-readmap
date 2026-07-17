# bash tool — output behavior

`pi-hashline-readmap` normalizes Bash results without interpreting command-specific output formats.

## Visible output

- ANSI escape sequences are stripped.
- Git, test, build, linter, Docker, package-manager, HTTP, transfer, and file-listing output is otherwise preserved.
- A short `[Hint: ...]` line may be appended when a dedicated repository tool is more appropriate.
- Oversized output may be replaced by the recoverable Bash context-guard preview documented in [`docs/bash-output.md`](../docs/bash-output.md).

## Result details

The extension may attach:

- `details.contextHygiene` — command-output or mutation tracking metadata.
- `details.bashContextGuard` — limits, measured size, trim status, and the guarded full-output path.
- `details.bashOriginalOutput` — source and snapshot metadata for the original output when recovery information is available.

The removed semantic compression pipeline no longer emits `details.rtkCompaction`, `details.ptcValue.rtkCompaction`, or `details.compressionInfo`.
