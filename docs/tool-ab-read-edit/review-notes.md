# Blind trace review notes (written before key.json was opened)

Each line: what the trace did, any confusion, and a guess at the arm. The tools a trace calls reveal much of the arm: `N:HASH|` lines in a `read` result mean Hashline's `read`, `oldText`/`newText` Pi's `edit`, `set_line`/`replace`/`copy_lines` Hashline's, no `grep` tool `stock`, no `read`/`edit` `bash-read-edit`. A trace that calls neither `read` nor `write` leaves Hashline's `read` and Pi's apart only by elimination within its task. "Blind" hides the model and the task's outcome.

The draw: 5 (task, model, repeat) combos, each in all 6 arms. By the prompts: a one-test plain replace in a 1000-test file (A), a three-test replace under Unicode titles in a 1000-test file (B), a one-occurrence zero-width-space replace (C), the locate task `markdown-extension` (D), and copying a marked block to the end of a file (E).

## A: replace `legacyCheckout` in test 0500 of 1000

- T01: bash `grep -n -A25`, then an `oldText` edit: 2 calls, 8.6k input tokens. Guess: stock.
- T04: two `grep`s (the first 744 B, 100 matches), an `oldText` edit. 21k. Guess: pi-edit.
- T05: one `grep` with 15 lines of context, an `oldText` edit: 2 calls, 14k. Guess: pi-read-edit.
- T11: two `grep`s, a GNU `sed -i` that BSD sed refused, then `sed -i ''`. 29k. Guess: bash-read-edit.
- T15: two `grep`s, `set_line` by the grep anchor `5499:e66`, no read. 27k. Guess: no-ls-find.
- T30: one `grep` with context, `set_line` by its anchor, no read: 2 calls, 18k. Guess: pi-read.

## B: replace in three tests whose titles hold U+2011 and U+00A0

- T06: a whole-file anchored `read` (52 KB), two `grep`s, two windowed reads, three `set_line`s by anchor. 126k. Guess: no-ls-find.
- T09: a `grep`, then the same `perl -0pi` substitution with `\x{2011}`/`\x{00a0}` 8 times; each matched nothing (perl read bytes, not UTF-8), each checked by a `grep` showing 0 `stable` lines; the 19th call rewrote it per title. 19 calls, 62k. Guess: bash-read-edit.
- T17: a whole-file anchored `read` (52 KB), two `grep`s, two windowed anchored reads, then one `oldText` edit of 3 blocks. 122k. Guess: pi-edit.
- T18: a whole-file plain `read` (51 KB), bash `rg -C 3`, one `oldText` edit of 3 blocks. 45k. Guess: stock.
- T20: a `grep` with context, a plain 30-line `read`, a narrower `grep`, one `oldText` edit of 3 blocks. 16k. Guess: pi-read-edit.
- T21: two `grep`s with context, a Hashline `replace` of the three blocks, a verifying `grep`. 20k. Guess: pi-read.

## C: replace the one `legacy\u200bCheckout`

- T03: a literal `grep`, a Hashline `replace` with `all`: 2 calls, 7k. Guess: pi-read.
- T08: an anchored `read` (636 B), an `oldText` edit: 2 calls, 7k. Guess: pi-edit.
- T12: a `grep` with the escape `\u200b` typed literally (0 matches), an anchored `read`, a Hashline `replace`. 11k. Guess: no-ls-find.
- T24: a `grep` with a vertical tab in place of U+200B (0 matches), the right `grep`, `pwd`, `ast_search`, `ls`; `perl -pi` with `\x{200b}` matched nothing (bytes again), two more `grep`s, `ast_search`, then `s/legacy/stable/` on any line and `od` dumps to check. 17 calls, 40k. Guess: bash-read-edit.
- T26: bash `ls -la && rg -F`, an `oldText` edit: 2 calls, 4k. Guess: stock.
- T28: a literal `grep`, an `oldText` edit: 2 calls, 6k. Guess: pi-read-edit.

## D: `markdown-extension` (locate)

- T02: bash `ls -la`, a `grep` over `src`, a plain `read`, `insert_after` by the grep's anchor `66:46b`, then a new test file by `write` (its result anchored) and a failing `npx vitest`. 74k. Guess: pi-read.
- T10: bash `rg` over `.` (51 KB), a plain `read`, an `oldText` edit, `cat package.json`, an `oldText` edit with identical old and new text (refused), a read, a test edit, failing vitest. 156k. Guess: stock.
- T14: `grep` over `.` (10 KB), `grep` over `src` (23 KB), a plain `read`, an `oldText` edit, an identical-text edit (refused), a new test by `write` (unanchored result), failing `npm test`. 130k. Guess: pi-read-edit.
- T22: two `grep`s (23 KB and 9 KB), an anchored `read`, `insert_after` with the anchor `67c|  // Markdown` (refused: hash and text in place of `LINE:HASH`), then `65:ff8`, failing `npm test`. 71k. Guess: no-ls-find.
- T23: two scoped `grep`s (4 KB each), an anchored `read`, an `oldText` edit, failing `npm test`. 27k. Guess: pi-edit.
- T27: 26 calls, 547k input tokens, no edit: `grep`s, 10 `ast_search` patterns over the tests and the source (one returning 50 KB), `git status`, `ls`, `npm test` and `git diff --check`. It never wrote the file with bash. Guess: bash-read-edit.

## E: copy a marked block to the end of the file

- T07: a plain `read` of the file, two `grep`s for the markers, `copy_lines` after the invented anchor `141:??` (refused), a `grep` for `});` to get the last line's anchor, `copy_lines` again. 32k. Guess: pi-read.
- T13: an anchored `read`, `copy_lines` with `20:c25` for the shown `20:20c` (refused as a changed line), the same with `20:20c`. 20k. Guess: no-ls-find.
- T16: a plain `read`, one `oldText` edit anchored on the last two lines with the block as new text: 2 calls, 13k. Guess: stock.
- T19: a plain `read`, one `oldText` edit as T16's: 2 calls, 12k. Guess: pi-read-edit.
- T25: an anchored `read`, one `oldText` edit: 2 calls, 16k. Guess: pi-edit.
- T29: bash `ls`, a `grep` for both markers, then a `nu` pipeline appending lines 20 to 128 after an empty line, saved over the file. 6k. Guess: bash-read-edit.

## Patterns before unblinding

- Bash in place of `read` and `edit` was costly where a byte had to be matched: T09 ran one perl substitution 8 times and T24 fell back to an unconditional `s/legacy/stable/`, both because perl matched bytes, not the `\x{...}` code points they wrote. T11 lost a call to BSD `sed -i`. T27 never edited.
- Hashline's anchors went wrong 3 times in 30 traces, each refused and fixed on the next call: an invented `141:??` for the end of a file (T07, Pi's `read` on screen, so no anchor of the last line was), a mistyped hash (T13) and a hash-and-text anchor (T22). Pi's `edit` went wrong twice, both an `oldText` equal to its `newText` (T10, T14), refused as "No changes made". Escapes typed literally into a search missed twice (T12's `\u200b`, T24's vertical tab), each followed by a search that matched.
- An edit by a `grep` anchor with no read: T02, T15, T30 (Hashline's `edit`); with Pi's `edit`, an `oldText` copied from `grep` context did the same (T04, T05, T28).
- Whole-file reads of the 1000-test file (51 to 52 KB) cost 45k to 126k input tokens in B (T06, T17, T18); the arms that searched first held B to 16k to 20k (T20, T21).

## After unblinding

The draw: gpt-6-luna's `copy-within-100-plain#1` (E), `markdown-extension#2` (D), `replace-all-1-unicode#2` (C) and `select-subset-1000-unicode#1` (B), and Sonnet's `select-one-1000-plain#2` (A). 28 of 30 guesses named the right arm; the two misses swapped `stock` and `pi-read-edit` in E (T16 is `pi-read-edit`, T19 `stock`), the pair told apart by elimination only. 25 of 30 runs passed.

- no-ls-find (T06, T12, T13, T15, T22): all passed. Two refused anchors, a mistyped hash (T13) and a hash-and-text anchor (T22), each fixed on the next call; the whole-file read in T06 made it B's costliest trace (126k).
- pi-read (T02, T03, T07, T21, T30): all passed. Hashline's `edit` worked from `grep` anchors with Pi's `read` on screen (T02, T30); T07 had no anchor for the file's last line and invented `141:??`, then took it from a `grep`.
- pi-edit (T04, T08, T17, T23, T25): 4 passed; T25 (E) failed.
- pi-read-edit (T05, T14, T16, T20, T28): 4 passed; T16 (E) failed.
- stock (T01, T10, T18, T19, T26): 4 passed; T19 (E) failed.
- bash-read-edit (T09, T11, T24, T27, T29): 2 passed (T11, T24); T09 (B) left the file wrong after its perl loop, T27 (D) never edited, T29 (E) failed.

E split by tool: `copy_lines` (T07, T13) copied the block exactly; the three `oldText` edits (T16, T19, T25) retyped its 109 lines with a blank line before them (`});\n\n// BEGIN`), and T29's `nu` pipeline added the same blank line, each failing at line 140, the checker's first difference. Across the run gpt-6-luna passed `copy-within-100-plain` 2 of 2 in both arms with Hashline's `edit` and 1 of 8 in the other four (`table.md`).
