# Blind trace review notes (written before key.json was opened)

Each line: what the trace did, any confusion, and a guess at the arm. The tools a trace calls, and whether a bash grep's lines carry `N:HASH|`, reveal the arm, so the guesses are near certain; "blind" hides the model and the task's outcome.

- T01: ls-default-limit. `grep` for `500` over the root (40 KB, 80 matches), `src/ls.ts` read in two windows, two scoped `grep`s, then `set_line` edits by `grep` anchors to code and prompt. 152k input tokens. Guess: no-ls-find.
- T02: markdown-extension. Two `grep -rn … | head` in bash, lines anchored; `insert_after` by the bash anchor `66:46b`, no read: 3 calls. Guess: bash-grep-anchors.
- T03: bash-search-hint-commands. `grep -l`, then `grep -rn` in `src` (lines bare), a failed macOS `sed -i`, an `oldText` replace. Guess: no-ls-find-grep.
- T04: ansi-cursor-codes. `rg -n` over `.` (20 KB, bare), reads, `oldText` edit, a re-read, `set_line` on the test. Guess: no-ls-find-grep.
- T05: ls-default-limit. `rg -n` over `.` (21 KB, anchored), five reads, a malformed `ast_search`, edits to code, prompt, contract pins and tests, a second `rg` of 41 KB. Every edited file was read first; the bash anchors went unused. 352k input tokens. Guess: bash-grep-anchors.
- T06: ansi-cursor-codes. `grep` over `.` (18 KB), the same file read twice, `set_line` by anchor. Guess: no-ls-find.
- T07: markdown-extension. `grep -rn … | head` (bare), a narrower grep, an `oldText` edit by absolute path, no read, then a grep to check. Guess: no-ls-find-grep.
- T08: ls-default-limit. `rg` over `.` (51 KB, bare), two more `rg`, two whole-file reads, `set_line` and `oldText` edits. 203k input tokens. Guess: no-ls-find-grep.
- T09: ast-search-loop-suggestion. `rg` over `.` (44 KB, bare), two reads, `insert_after` edits to code and test. Guess: no-ls-find-grep.
- T10: ansi-cursor-codes. `rg -n` over `.` (33 KB, anchored), two reads, an edit that duplicated a line (an `insert_after` beside a `replace`), a re-read and a `replace_lines` fix. Bash anchors unused. Guess: bash-grep-anchors.
- T11: ast-search-loop-suggestion. `grep` in `src` printed paths relative to it; `read doom-loop.ts` failed (file not found); an `edit` with no edits; a re-grep, then edits. Guess: no-ls-find.
- T12: ast-search-loop-suggestion. `rg -n` over `.` (40 KB, anchored), one read, `insert_after` by the read's anchor; the table test left unchanged. Guess: bash-grep-anchors.
- T13: bash-search-hint-commands. One `grep`, then `set_line` by its anchor with no read: 2 calls. Guess: no-ls-find.
- T14: bash-search-hint-commands. Three bash `grep -rn` (anchored), a read, `set_line` by the read's anchor (the same `14:a0b` the first grep had printed): 5 calls for T13's 2. Guess: bash-grep-anchors.
- T15: markdown-extension. `grep` in `src` printed `readmap/language-detect.ts`; `edit` on that path answered "You must get fresh anchors" for a file that does not exist, then "File not found"; the third edit, under `src/`, landed. Guess: no-ls-find.

Patterns before unblinding:
- An edit by a search anchor without a read: T13 with the `grep` tool, T02 with an anchored bash grep. In T05, T10, T12 and T14 the anchored bash lines were on screen, and the model read the file anyway.
- Unscoped bash `rg` over `.` returns 20 to 51 KB (T04, T05, T08, T09, T10, T12); the `grep` tool's `limit` holds T01 and T06 near 18 to 40 KB with the match count shown. Anchors do not shrink a bash result.
- The `grep` tool's path-relative output misled twice (T11, T15), as in the pilot; T15 again met the misleading "fresh anchors" answer for a missing file.
- Every arm runs tests that cannot run (no `node_modules`).

## After unblinding

The draw fell on the pilot's five: Sonnet's `markdown-extension#1` and `bash-search-hint-commands#1`, and gpt-6-luna's `ls-default-limit#2`, `ansi-cursor-codes#2` and `ast-search-loop-suggestion#1`. All 15 guesses named the right arm; all 15 runs passed.

- no-ls-find (T01, T06, T11, T13, T15): Sonnet's `bash-search-hint-commands` took 2 calls by a `grep` anchor (T13); the path-relative miss cost gpt-6-luna one call (T11) and Sonnet two (T15).
- bash-grep-anchors (T02, T05, T10, T12, T14): Sonnet's `markdown-extension` edited by a bash anchor with no read (T02, 3 calls, as plain bash's T07 did by `oldText`); Sonnet's `bash-search-hint-commands` read before editing (T14, 5 calls); gpt-6-luna read every file before editing in all three of its traces, the anchors unused.
- no-ls-find-grep (T03, T04, T07, T08, T09): Sonnet's scoped `grep -rn … | head` and `oldText` edits (T03, T07), one failing macOS `sed -i`; gpt-6-luna's unscoped `rg` of 20 to 51 KB, as in the anchored arm.

What anchors changed in these traces: one edit without a read, on Sonnet, where plain bash reached the same 3 calls by `oldText` (T02 against T07). gpt-6-luna, whose input tokens the `grep` tool saves, did not use them.
