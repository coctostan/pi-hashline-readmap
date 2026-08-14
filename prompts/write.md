Write full file content. Creates new files and parent directories, overwrites existing files, and returns `LINE:HASH` anchors for immediate `edit` use.

> **Detailed reference document.** The provider-visible contract is [documented separately](../docs/tool-metadata.md) and consists of registered tool/parameter descriptions, snippets, and guidelines. This file is not loaded into `session.systemPrompt`. Changing this prompt body alone does not change provider-visible metadata.

## Use / avoid

Use `write` to create a file or intentionally replace a whole file. For small changes or appends, `read` first and use `edit` (`insert_after` for appends).

Existing files are overwritten without confirmation. Binary-looking content is written, but hashlines are not generated, so there are no anchors to feed into `edit`.

Content containing bare carriage returns (`\r` not paired as `\r\n`) is refused before mutation because read/edit normalization could not produce trustworthy anchors.

Writes are atomic: content is written to a temporary file in the same directory and renamed over the target, so the file is never left partially written. Symlinked targets are written through to their real target (the symlink is preserved). Hard-linked targets (`nlink > 1`) are the exception — they are updated in place to preserve the shared inode and all links, so that case is not temp+rename atomic. Existing files keep their permission mode; new files use the OS/umask default.

## Parameters

- `path` — relative or absolute file path.
- `content` — complete file contents.
- `map` — optional; append a structural map when possible. Map append is best-effort and write still succeeds if map generation fails.

## Output

Successful text writes return `LINE:HASH|content`; display hashlines escape control characters for safe rendering. Visible output is capped at 2000 lines or 50 KB, but full anchors remain available in `ptcValue`.

## Diff data contract

Successful text `write` results include additive final `details.diff`, `details.ptcValue.diff`, `details.diffData`, and `details.ptcValue.diffData` fields. The string fields remain the backward-compatible human-readable fallback.

`diffData` is a stable versioned contract:

```ts
type DiffData = {
  version: 1;
  entries: Array<
    | { kind: "context"; oldLine: number; newLine: number; text: string }
    | { kind: "add"; newLine: number; text: string }
    | { kind: "remove"; oldLine: number; text: string }
    | { kind: "meta"; text: string }
  >;
  stats: { added: number; removed: number; context: number };
  language?: string;
  blockRanges?: Array<{ kind: "add" | "remove"; startLine: number; endLine: number }>;
  inlineDiffs?: Array<{
    removeLineIndex: number;
    addLineIndex: number;
    removeSpans: Array<{ kind: "equal" | "remove" | "add"; text: string }>;
    addSpans: Array<{ kind: "equal" | "remove" | "add"; text: string }>;
  }>;
};
```

For compact one-line hashline diffs, `details.diff` remains compact, while `diffData.entries` uses expanded remove/add rows so renderers can show inline word changes without breaking hashline output.