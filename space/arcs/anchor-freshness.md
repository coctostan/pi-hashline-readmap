---
status: active
---
# Anchor freshness matches what the model sees

## Destination
The extension's own edits and writes keep a file's anchors usable across turns and within a batch. Any bash change the classifier can find, anywhere in a command chain, forces a re-read. Ships as 0.17.0, and replaces community PRs #237–#240 with this repo's own versions.

## Done when
- [ ] An anchored edit on a later turn, using anchors from a read made before the extension's own edit or write, lands without a re-read — verified by `tests/edit-scenarios.test.ts` with a harness that fires `context`, and a live `pi -e` drive
- [ ] A read batched after an edit of the same file in one turn returns post-edit anchors — verified by `tests/edit-batch-execution-order.test.ts` through the locked host's real `runAgentLoop`
- [ ] After a bash change to a file, an anchored edit with old anchors is refused with `file-not-read`. This holds for a change after `cd`, inside a subshell, after a here-string, and on a file known only from write/edit — verified by `tests/bash-command-state.test.ts` and `tests/context-hygiene-edit-guard-bash-stale.test.ts`
- [ ] A change made outside the extension still expires a file's freshness — verified by `tests/repro-144-stale-read-edit-guard.test.ts`
- [ ] `npm test && npm run typecheck` and the Pi 1.2.0 lane pass on the 0.17.0 release commit — verified by the `pi-compatibility` workflow run on it
- [ ] PRs #237–#240 are closed, each with a comment linking the commit that replaced it, and the 0.17.0 CHANGELOG thanks @llehouerou — verified by `gh pr view <n> --json state,comments`

## Now
Slice 4 (Classifier splits command chains) is active, branch `anchor-freshness/04-classifier-splits-chains`. Next action: build its tokenizer and cases.

## Seams
- `src/read-freshness.ts` (new, slice 1): note, has, expire-from-report, expire-path → `tests/read-freshness.test.ts`
- `index.ts` `context` and `tool_result` handlers, driven through captured `pi.on` handlers → `tests/repro-144-stale-read-edit-guard.test.ts`, `tests/context-hygiene-edit-guard-bash-stale.test.ts`, `tests/edit-scenarios.test.ts`
- `extractShellFileMutationTargets` in `src/bash-command-state.ts` → `tests/bash-command-state.test.ts`
- Tool definitions' `executionMode`, run through the locked host's `runAgentLoop` → `tests/edit-batch-execution-order.test.ts`
- Real artifact: `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<read, edit, then edit again with the first read's anchors>"`, observed in the `tool_execution_end` events

## Slices
1. **Freshness tracker extracted** — delivers `readTurns`, `noteRead`, `wasReadInSession` and `expireStaleReadTurns` moved from `index.ts` into `src/read-freshness.ts`, with no behavior change · proof: the existing freshness tests stay green unchanged, plus a new `tests/read-freshness.test.ts` that pins today's expiry at an equal event id · blocked-by — · status done
   `createReadFreshness` (`note`, `has`, `expireFromReport`) in `src/read-freshness.ts`, fed an event-count getter · deviation: the seam's expire-path is deferred to slice 6 (Any bash change expires freshness), its first caller · evidence: six freshness files 68/68 unchanged, new pin 3/3 and red under `<=`→`<`, full suite 628 passed / 25 skipped (main 627 / 25), typecheck clean, live drive identical to main (second edit `file-not-read`) · `b5fb01f5`
2. **Own edits keep freshness** — delivers #237's behavior under ruling 0004: an own write or edit marks the file fresh, and so does `move_lines` with `from_path` on its source. The `edit-scenarios` harness fires `context`, and `repro-144` invalidates through a bash change · proof: `b13-chained-diff-edit` and write-then-edit go red→green; a move-source test · blocked-by 1 · status done
   `createReadFreshness` entries `{ id, own }`, an own mark from successful `write` and from `edit` on an already-fresh file, kept through its own mutation id; the move note reports the source's shift instead of asking for a re-read · deviation: no own mark on the move source, since measured unneeded (the edit records its mutation on the target only), the move-source test guards it · evidence: b13, write-then-edit, move-source red→green; old repro-144 red against the fix; five mutation probes all red; full suite 2529 passed / 65 skipped, typecheck clean; live drive third edit with the first read's `6:d07` lands (main: `file-not-read`); review standards none, spec 1 medium valid trade-off · `ddc3ff17`
3. **Mutating batches run in call order** — delivers `executionMode: "sequential"` on `edit` and `write` (#238) · proof: `tests/edit-batch-execution-order.test.ts` goes red→green; a live `pi -e` drive shows the later-turn edit landing without a re-read · blocked-by 2 · status done
   `executionMode: "sequential"` on the `edit` and `write` tool objects, so Pi runs a batch containing either in call order (both hosts, measured in their `agent-loop.js`) · deviation: the drive's later-turn edit already lands on main, remapped by `ServedLines` since slice 2 (Own edits keep freshness); what the fix changes live is the batched read, which ran before the edit and showed `4:efd|ddd` on main, and runs after it showing `5:efd|ddd` here · evidence: batch test red on main (`4:efd`, expected `5:efd`), green with the fix; each of the two lines removed alone turns a test red; full suite 2531 passed / 65 skipped, typecheck clean; review standards and spec no findings; `pi-compatibility` green · `a3c63f08`
4. **Classifier splits command chains** — delivers a mutation found in any simple command of a chain: separators, keywords, `NAME=value` prefixes, heredoc bodies excluded, `<<<` and `$((…<<…))` not taken as heredocs, a quoted `>` not taken as a redirection · proof: `tests/bash-command-state.test.ts` cases go red→green · blocked-by — · status active
   Goal: `extractShellFileMutationTargets` finds sed/mv/cp/rm/install/tee and write redirections in every simple command, split at `;` `&` `&&` `|` `||` `|&` newline `(` `)`; the command word follows keywords (`!` `{` `if` `then` `elif` `else` `do` `while` `until` `time`) and `NAME=value` prefixes; heredoc bodies are skipped; `<<<`, `${…}`, `$((…))` and `((…))` open no heredoc, though the substitutions inside them still count; a quoted `>` is a word, not a redirection. The parser covers the bash subset agents write, not all of bash: its known misses are listed in a `shortcut:` comment (approved by the human after review round 2, option A); a missed target behaves as main does today, the edit still checked against content hashes.
   Assumptions: every command still resolves against the input cwd (cd is slice 5 (Classifier follows cd)); `$(…)`, backticks and `<(…)`/`>(…)` are parsed as commands of their own, keeping today's catch of `$(… > f)`; the whole-line `eval|source|.` skip existed only because a quoted `>` matched, so it goes, its test kept.
   Reach: `src/bash-command-state.ts` — a quote-aware `parseShellCommands` (words + write targets per simple command) replaces `REDIRECTION_RE`, `TEE_RE`, `splitShellWords` and `extractTeeTargets`; `extractSedInPlaceTargets` and `extractPathCommandTargets` take command words; `extractShellFileMutationTargets` walks the commands. Caller `buildBashCommandState` → `index.ts` `tool_result` handler, unchanged: more targets now reach `freshness.expireFromReport` on a successful bash. `tests/bash-command-state.test.ts` new cases; the context-hygiene bash tests rerun.
   Proof: new cases red on main, green here; `npm test && npm run typecheck`; a live `pi -e` drive: read f, bash `true && sed -i … f`, edit with the first read's anchors → `file-not-read` here, not on main.
5. **Classifier follows cd** — delivers targets resolved against a literal `cd`; after a `cd` it cannot follow, relative targets are dropped; a subshell restores the directory at `)` · proof: `tests/bash-command-state.test.ts` cases, including `(cd sub && make) && echo x > out.txt` → `out.txt` · blocked-by 4 · status next
6. **Any bash change expires freshness** — delivers expiry of every classified target's freshness on any bash result, failed ones included (#239) · proof: `tests/context-hygiene-edit-guard-bash-stale.test.ts` goes red→green, including a `cd d && sed -i … f` case · blocked-by 1, 5 · status next
   From slice 1: add the seam's expire-path to `src/read-freshness.ts` (deferred there, no caller yet), with its case in `tests/read-freshness.test.ts`
7. **Release 0.17.0** — delivers the version bump, a CHANGELOG with thanks to @llehouerou, the Pi 1.2.0 lane green, and #237–#240 closed with links to the commits that replaced them · proof: the `pi-compatibility` run on the release commit; `gh pr view` for each PR · blocked-by 3, 6 · gate human · status next
   From slice 3: thank @llehouerou for #238 and close it with a link to `a3c63f08`

## Not yet specified
- Whether `noteRead`'s anticipated event id (`eventCount + 1`) stays correct when parallel read-only batches finish out of order. This is inferred from the code and not reproduced.
- From slice 2: after an own `write` that shifts lines more than 20, a pre-write read's anchor is refused with `hash-mismatch` and fresh rows, not remapped (measured; within ±20 it auto-relocates). `write` records a complete view with no line map; exact remapping would need a `ServedLines` seam this arc doesn't list.
- From slice 2: a cross-file `move_lines` source's earlier read is never annotated stale in context, since the edit's context-hygiene event names only its target (`src/edit-output.ts`). Its anchors stay usable through `ServedLines`.

## Out of scope
- Per-file ordering in place of sequential batches
- Following `git mv` and `pushd` in the classifier
- `npm publish`: the human runs it after slice 7 (Release 0.17.0)

## Decisions
- [0004 Own edits keep a file's anchors fresh](../decisions/0004-own-edits-keep-freshness.md)
