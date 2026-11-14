---
status: active
---
# Own changes keep anchors exact

When a model edits a file through Hashline, it points at lines with short anchors taken from what it last read. Three gaps let those anchors, or the model's view of the file, drift after Hashline's own changes: a whole-file write that moves lines far, a move of lines from one file to another, and tool calls a script runs side by side. This arc closes them, so an edit lands where the model meant it to.

## Destination
After the extension's own `write`, a cross-file `move_lines`, or an own write run in parallel inside a codemode script, anchors the model already holds stay exact and its context shows which earlier results are stale; changes the extension didn't make still expire freshness (ruling 0004). Ships as 0.28.2.

## Done when
- [ ] After the extension's own `write` moves an unchanged line by more than 20 lines, an anchored edit using that line's anchor from a read made before the write lands on the line's new number, reported as remapped; an anchor on a line the write changed or removed is refused with fresh rows — verified by `tests/write-shift-remap.test.ts`
- [ ] After a cross-file `move_lines`, the source file's earlier read is marked stale in context at the next `context` event, and an anchored edit of the source with that read's anchors still lands without a re-read — verified by `tests/edit-move-source-stale.test.ts`
- [ ] A codemode script that runs the extension's own `write` beside another tool call in `Promise.all` leaves the written file fresh: on the next turn an anchored edit with the write's anchors lands without `file-not-read` — verified by `tests/pi-host-codemode-freshness.test.ts`, through the selected host's real loader, `runToolCall` and codemode executor
- [ ] A change the extension didn't make still expires a file's freshness — verified by `tests/repro-144-stale-read-edit-guard.test.ts`, `tests/context-hygiene-edit-guard-bash-stale.test.ts` and `tests/read-freshness.test.ts`, inside `npm test && npm run typecheck`
- [ ] 0.28.2's CHANGELOG names each change above, and the `pi-compatibility` workflow passes on its release commit — verified on the release, by `gh run list --workflow pi-compatibility.yml --commit <release sha>`

## Now
slice 1 (Parallel own writes stay fresh) is next, on no branch yet; run `slice` in a fresh session.

## Design
- **Chosen:** each own change states its effect at its own call. `write` gains `served` and calls `ServedLines.remapAfterWrite` on an overwrite as `edit` does, and its result no longer clears the moved-anchor map. A cross-file `move_lines` names both files in its context-hygiene event and marks its source fresh, as it does its target. If slice 1 reproduces the race, freshness becomes a set of paths: own changes mark, changes the extension didn't make expire through `expirePath` at their own result (bash already does; `edit` and `write` failing after they wrote join it), and `expireFromReport` with its anticipated event id goes.
- **Other:** keep event ids and tag each recorded mutation with the tool call that made it: `note` stores its `toolCallId`, `expireFromReport` skips a mutation from that same call and compares against the read's recorded event id, looked up by result id.
- **Simpler by reader load:** Chosen. It removes the guessed id and the `own` comparison, state a reader holds today; tagging adds a result-id to event-id lookup and keeps two expiry paths.

## Seams
- `createReadFreshness` in `src/read-freshness.ts` (`note`, `has`, `expireFromReport`, `expirePath`) → `tests/read-freshness.test.ts`
- `ServedLines.remapAfterWrite` and `shiftedAnchor` in `src/served-lines.ts` → `tests/served-lines-shifted.test.ts`
- `registerWriteTool` and `registerEditTool` options, driven through captured `pi.on` handlers that fire `tool_result` and `context` (the `tests/edit-scenarios.test.ts` harness) → `tests/write-shift-remap.test.ts`, `tests/edit-move-source-stale.test.ts`
- The selected host's real loader, `runToolCall` and codemode executor, by `tests/helpers/selected-host-codemode.mjs` → `tests/pi-host-codemode-freshness.test.ts`
- Real artifact: `AGENTS.md` § Prove's `pi -e <repo>/index.ts --mode json -p` drive, adding `-e builtin:codemode --tools +codemode` for a codemode script, observed in `tool_execution_end` events and the changed files

## Slices
1. **Parallel own writes stay fresh** — delivers a pin through the selected host: a codemode script runs `write f` beside `read g` in `Promise.all`, and the next turn's anchored edit of `f` with the write's anchors lands; if the pin is red on main, freshness drops the anticipated event id by Design's Chosen · proof `tests/pi-host-codemode-freshness.test.ts` red on main then green, with `tests/repro-144-stale-read-edit-guard.test.ts`, `tests/context-hygiene-edit-guard-bash-stale.test.ts` and `tests/read-freshness.test.ts` green; a live codemode drive. If the pin is green on main, the slice lands it as a test-only change and moves the anticipated id to Not yet specified, marked not reproduced · blocked-by — · status next
2. **Own write remaps moved anchors** — delivers `write` remapping anchors shown before it through `ServedLines`, as `edit` does: an unchanged line moved by any distance is reported as remapped, a changed or removed one refused with fresh rows · proof `tests/write-shift-remap.test.ts` red→green, `tests/served-lines-shifted.test.ts` green; a live drive that reads a file, writes it with 30 lines added at the top, then edits with a pre-write anchor · blocked-by — · status next
3. **Move source shows stale** — delivers a cross-file `move_lines` whose context-hygiene event names its source too, so the source's earlier read is marked stale in context, with the source kept fresh for anchored edits · proof `tests/edit-move-source-stale.test.ts` red→green; a live drive that reads both files, moves lines, then edits the source with its old anchors · blocked-by 1 · status next
4. **Release 0.28.2** — delivers the version bump in package and lock, a dated `[0.28.2]` CHANGELOG naming slices 1 (Parallel own writes stay fresh), 2 (Own write remaps moved anchors) and 3 (Move source shows stale), and the `pi-compatibility` workflow green on the release commit · proof `tests/package-version.test.ts` and `tests/package-changelog.test.ts` green; `gh run list --workflow pi-compatibility.yml --commit <release sha>` · blocked-by 1, 2, 3 · status next

## Not yet specified

## Out of scope
- Changes another process makes outside any tool call (NOW.md's Later); the per-line edit hashes keep refusing those
- Bash classifier gaps, such as a `sudo` or `env` prefix hiding a mutation
- `npm publish`: the owner's, after slice 4 (Release 0.28.2)

## Decisions
- [0004 Own edits keep a file's anchors fresh](../decisions/0004-own-edits-keep-freshness.md)
