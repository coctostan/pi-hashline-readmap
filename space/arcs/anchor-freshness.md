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
Slice 1 (Freshness tracker extracted) is next, with no branch yet. Next action: run `slice` in a fresh session.

## Seams
- `src/read-freshness.ts` (new, slice 1): note, has, expire-from-report, expire-path → `tests/read-freshness.test.ts`
- `index.ts` `context` and `tool_result` handlers, driven through captured `pi.on` handlers → `tests/repro-144-stale-read-edit-guard.test.ts`, `tests/context-hygiene-edit-guard-bash-stale.test.ts`, `tests/edit-scenarios.test.ts`
- `extractShellFileMutationTargets` in `src/bash-command-state.ts` → `tests/bash-command-state.test.ts`
- Tool definitions' `executionMode`, run through the locked host's `runAgentLoop` → `tests/edit-batch-execution-order.test.ts`
- Real artifact: `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<read, edit, then edit again with the first read's anchors>"`, observed in the `tool_execution_end` events

## Slices
1. **Freshness tracker extracted** — delivers `readTurns`, `noteRead`, `wasReadInSession` and `expireStaleReadTurns` moved from `index.ts` into `src/read-freshness.ts`, with no behavior change · proof: the existing freshness tests stay green unchanged, plus a new `tests/read-freshness.test.ts` that pins today's expiry at an equal event id · blocked-by — · status next
2. **Own edits keep freshness** — delivers #237's behavior under ruling 0004: an own write or edit marks the file fresh, and so does `move_lines` with `from_path` on its source. The `edit-scenarios` harness fires `context`, and `repro-144` invalidates through a bash change · proof: `b13-chained-diff-edit` and write-then-edit go red→green; a move-source test · blocked-by 1 · status next
3. **Mutating batches run in call order** — delivers `executionMode: "sequential"` on `edit` and `write` (#238) · proof: `tests/edit-batch-execution-order.test.ts` goes red→green; a live `pi -e` drive shows the later-turn edit landing without a re-read · blocked-by 2 · status next
4. **Classifier splits command chains** — delivers a mutation found in any simple command of a chain: separators, keywords, `NAME=value` prefixes, heredoc bodies excluded, `<<<` and `$((…<<…))` not taken as heredocs, a quoted `>` not taken as a redirection · proof: `tests/bash-command-state.test.ts` cases go red→green · blocked-by — · status next
5. **Classifier follows cd** — delivers targets resolved against a literal `cd`; after a `cd` it cannot follow, relative targets are dropped; a subshell restores the directory at `)` · proof: `tests/bash-command-state.test.ts` cases, including `(cd sub && make) && echo x > out.txt` → `out.txt` · blocked-by 4 · status next
6. **Any bash change expires freshness** — delivers expiry of every classified target's freshness on any bash result, failed ones included (#239) · proof: `tests/context-hygiene-edit-guard-bash-stale.test.ts` goes red→green, including a `cd d && sed -i … f` case · blocked-by 1, 5 · status next
7. **Release 0.17.0** — delivers the version bump, a CHANGELOG with thanks to @llehouerou, the Pi 1.2.0 lane green, and #237–#240 closed with links to the commits that replaced them · proof: the `pi-compatibility` run on the release commit; `gh pr view` for each PR · blocked-by 3, 6 · gate human · status next

## Not yet specified
- Whether `noteRead`'s anticipated event id (`eventCount + 1`) stays correct when parallel read-only batches finish out of order. This is inferred from the code and not reproduced.

## Out of scope
- Per-file ordering in place of sequential batches
- Following `git mv` and `pushd` in the classifier
- `npm publish`: the human runs it after slice 7 (Release 0.17.0)

## Decisions
- [0004 Own edits keep a file's anchors fresh](../decisions/0004-own-edits-keep-freshness.md)
