# Blind trace review notes (written before key.json was opened)

Each line: what the trace did, any confusion, and a guess at the arm (the tools a trace calls reveal much of it).

- T01: ls-default-limit. One unscoped `rg` over `.` (51 KB result), reads, `oldText` edits, a test added. Clean. Guess: stock.
- T02: markdown-extension. `grep` in `src` printed `readmap/language-detect.ts`; the model edited that path relative to the workspace and got "You must get fresh anchors" for a file that does not exist, a misleading message; it recovered on the second edit. Guess: extension or no-ls-find.
- T03: ls-default-limit. First call greps the host's `node_modules/@earendil-works/pi-coding-agent` under the owner's checkout, a path it can only know from the system prompt's Pi docs paths; then 11 calls in the real checkout (one at a guessed `/Users/maxwellnewman/pi-hashline-readmap`) before `pwd` brings it back. Leak. Guess: extension.
- T04: ansi-cursor-codes. `read` on `。` then on `.` with `map: true`, refused "Use ls to inspect directories"; then bash `pwd; ls -la; rg` (38 KB). Wrote a new test file. Guess: no-ls-find-grep.
- T05: ls-default-limit. `read .` refused with "Use ls"; bash `rg` over `.` (43 KB); many reads; thorough edit including the contract pins. Guess: no-ls-find-grep.
- T06: ansi-cursor-codes. Unscoped `rg` over `.`, two reads, `oldText` edits, a test. Clean. Guess: stock.
- T07: ansi-cursor-codes. `grep`, `read src/ansi.ts`, then `find *ansi*` for a file already read (wasted call), edit by anchor, full `npm test`. Guess: extension.
- T08: ansi-cursor-codes. `grep`, read, `grep` in a guessed `test` dir (Path not found), regrep, edit by anchor. Guess: no-ls-find or extension.
- T09: markdown-extension. Three scoped `rg … | head` calls, one `oldText` edit. Efficient. Guess: stock.
- T10: bash-search-hint-commands. Two `rg`, a failed macOS `sed -i`, an `oldText` edit. Guess: stock.
- T11: bash-search-hint-commands. `grep` then edit by the grep anchor, then bash `grep -n` to check the result (a wrong-tool pick with the grep tool active). Guess: extension or no-ls-find.
- T12: markdown-extension. Three scoped bash `rg`, one hashline `replace` edit. Efficient. Guess: no-ls-find-grep.
- T13: ls-default-limit. First call `read node_modules/@earendil-works/pi-coding-agent` (the host path from the system prompt, relative), not found; then `grep` and reads in the workspace. A leak attempt that failed harmlessly. Guess: no-ls-find.
- T14: ast-search-loop-suggestion. Two broad `grep` calls, read, `insert_after`, full `npm test`. Guess: extension or no-ls-find.
- T15: ast-search-loop-suggestion. One `rg`, read, `oldText` edits including the table test; `npx vitest` failed. Guess: stock.
- T16: ast-search-loop-suggestion. Two `grep`; read of `doom-loop-suggestions.ts` without `src/` (grep in `src` printed it relative) not found; `find` locates it; read; edit. Guess: extension.
- T17: ast-search-loop-suggestion. `read .` refused "Use ls"; `pwd`; `nu ls -a` as a stand-in for `ls`; `rg`; reads; edits to code and test. Guess: no-ls-find-grep.
- T18: bash-search-hint-commands. One `grep`, then edit by the grep anchor with no read: 2 calls. Guess: extension or no-ls-find.
- T19: bash-search-hint-commands. Four bash `grep -r` with excludes (a binary banner.png match), a failed `sed -i`, a hashline `replace`. 6 calls for T18's 2. Guess: no-ls-find-grep.
- T20: markdown-extension. Three `grep` calls, then edit by anchor with no read. Guess: no-ls-find.

Patterns before unblinding:
- Edit by a `grep` anchor without a read (T11, T18, T20) only happens where `grep` is a tool: the shortest traces.
- `grep` with a `path` prints results relative to it, and twice the model then used the printed path from the workspace root (T02, T16): one misleading "fresh anchors" error, one file-not-found.
- Without `ls`, models `read` a directory and are told to use `ls`, a tool they do not have (T04, T05, T17), then fall back to bash or `nu`.
- The system prompt's Pi docs paths name the owner's checkout; on the self-referential `ls` task models went looking there (T03, T13).
- Every arm runs tests that cannot run (no node_modules); none was misled by it beyond one wasted call.

## After unblinding

The draw fell on Sonnet's `markdown-extension#1` and `bash-search-hint-commands#1`, and gpt-6-luna's `ls-default-limit#2`, `ansi-cursor-codes#2` and `ast-search-loop-suggestion#1`, so 3 of the 20 traces are the `ls-default-limit` task that `verdict.md` leaves out. 14 of the 20 guesses named the right arm, 5 named the two arms with `grep` without choosing (T02, T08, T11, T14, T18), and 1 named the wrong one of those two (T20); "blind" hid the label, not the tools.

- stock (T01, T06, T09, T10, T15): unscoped or `head`-capped `rg`, reads without anchors, `oldText` edits. No confusion beyond macOS `sed -i` failing (T10) and tests that cannot run.
- extension (T03, T07, T16, T18, T20): `grep` anchors fed edits without a read (T18, T20). `find` ran twice, once for a file already read (T07), once to recover from `grep`'s path-relative output (T16); `ls` never. T03 is the leak.
- no-ls-find (T02, T08, T11, T13, T14): as the extension without `find`; the same `grep` path-relative miss (T02), a guessed `test` directory (T08), a leak attempt (T13).
- no-ls-find-grep (T04, T05, T12, T17, T19): bash `rg`/`grep` for search, gpt-6-luna's unscoped (38 to 51 KB results), and gpt-6-luna's `read .` refused with a pointer to `ls`, which it does not have (T04, T05, T17); T17 used `nu ls` instead. Sonnet's bash searches were scoped and short (T12), but took 4 calls where the `grep` arms took 1 (T19 against T18).

What the review adds to the numbers: the `grep` tool's win is the anchor that lets an edit skip the read; its one recurring confusion is printing paths relative to its `path` argument, which the model then used from the workspace root (5 errors in 4 runs across the whole pilot, two of them in this sample); `ls` and `find` did no work in the sample that `grep` or a read had not already done.
