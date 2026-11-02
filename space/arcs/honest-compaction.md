---
status: active
---
# Compacted bash output names what it dropped

## Destination
Every bash result a compactor changed tells the truth about what it dropped: each drop marker gives the true count in its true unit, `git log` keeps whole commits, and `details.rtkCompaction`'s `applied` and `truncated` match what the compactor did. Ships as 0.19.2.

## Done when
- [ ] `git log -3` comes back with every line, `applied: false` and no notice. `git log -30` keeps its first 20 commits whole, bodies uncut, and ends `... and 10 more commits`, and so does `git log --graph -30`. `git log --oneline -30` ends `... and 10 more lines`. All four set `truncated` exactly when something was dropped — verified by `tests/rtk-git.test.ts` and `tests/rtk-compaction-builder.test.ts` (main 2026-11-02, `filterBashOutput` on this repo's log: `-3` kept 1 commit and said "… and 33 more commits"; `-30` said "… and 543 more commits"; `--oneline -30` said "… and 11 more commits" for 10 dropped)
- [ ] The anti-pattern hint is not a compaction: through the bash handler, a 2-line `find src -name '*.ts'` reports `applied: false, techniques: []`, and an ANSI-only `npm test` result keeps `applied: true, techniques: ["test-output"]` — verified by `tests/rtk-compaction-contract.test.ts` (main 2026-11-02: the `find` reports `applied: true, techniques: ["file-listing"]`)
- [ ] Every compactor that cuts output past a budget ends the cut with a marker that names the true count in its own unit, and that marker sets `truncated`. The budget cuts are the `git diff` cap, the `git status` file lists, `build`'s error list and per-error cut, `linter`'s top-10 rules and files, the `file-listing` summary (counted as `entries`) and the `http-client` body cap. Noise filters set nothing — verified by a new `tests/rtk-drop-markers.test.ts` (main 2026-11-02: `find src tests -maxdepth 1`, 150 entries with 2 directories among them, came back `Total: 150 files in 3 directories` with `truncated: false`)
- [ ] 0.19.2 is released: the version is bumped, a `[0.19.2]` CHANGELOG entry names the fixes under Fixed, and the `pi-compatibility` workflow passes on the release commit — verified by that workflow run, `tests/package-version.test.ts` and `tests/package-changelog.test.ts` (main 2026-11-02: 0.19.1)

## Now
slice 3 (Drop markers name true counts) is next, on branch `honest-compaction/03-drop-markers-true-counts`; nothing awaits; next action: `slice` plans it.

## Seams
- `buildRtkCompaction` in `src/rtk/rtk-compaction.ts` → `tests/rtk-compaction-builder.test.ts`
- `details.rtkCompaction` through the extension's bash `tool_result` handler in `index.ts` → `tests/rtk-compaction-contract.test.ts`, `tests/rtk-metadata.test.ts`
- `compactGitOutput` and `compactLog` in `src/rtk/git.ts` → `tests/rtk-git.test.ts`
- `filterBashOutput` in `src/rtk/bash-filter.ts`, over each compactor → `tests/rtk-drop-markers.test.ts` (new), the per-compactor `tests/rtk-*.test.ts`
- `package.json`, `package-lock.json` and `CHANGELOG.md` → `tests/package-version.test.ts`, `tests/package-content.test.ts`, `tests/package-changelog.test.ts`, the `pi-compatibility` workflow
- Real artifact: `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<prompt>"` in a scratch directory, observing the bash `tool_execution_end` events

## Slices
1. **`applied` ignores the anti-pattern hint** — delivers `buildRtkCompaction` taking `filterBashOutput`'s `compacted` and deleting its own re-derivation, with one exception: an ANSI-only `test-output` result stays `applied: true, techniques: ["test-output"]`. `prompts/bash.md` and `docs/bash-output.md` say the hint is no compaction · proof: a red case first in `tests/rtk-compaction-contract.test.ts` (the 2-line `find`); `tests/rtk-compaction-builder.test.ts`, `tests/rtk-metadata.test.ts` and the `tests/rtk-*.test.ts` suite green · blocked-by — · status done
   `buildRtkCompaction` takes `compacted` (test-output keeps its ANSI-only `applied`), docs say the hint is no compaction · deviation: branch `honest-compaction/01-applied-ignores-hint`, not `fix/applied-ignores-hint`; one added builder case pins `truncated` ⇒ `applied` · evidence: the `find` contract case red on main (`applied: true, techniques: ["file-listing"]`) then green; `npm test` 656 files green, typecheck clean; live drives: `find src -name '*.ts'` → `applied: false, techniques: []`, ANSI `npm test` → `applied: true, techniques: ["test-output"]`; review converged, no findings · `5e25c601`
2. **`git log` counts whole commits** — delivers `compactLog` keeping up to 20 whole commits, split at `commit <sha>` headers (with any `--graph` prefix), and ending `... and N more commits`. Output with no header (`--oneline`, `--format`) keeps 20 lines and ends `... and N more lines`, with no off-by-one from a trailing newline. The 80-character line cut goes, and `ROUTE_TRUNCATION_MARKERS` matches the new marker · proof: red cases first in `tests/rtk-git.test.ts` for `-3`, `-30`, `--graph -30` and `--oneline -30` on fixture logs; `truncated` pinned in `tests/rtk-compaction-builder.test.ts`; a live drive of `git log -3` returns every line with `applied: false` · blocked-by — · status done
   `compactLog` keeps up to 20 whole commits, split at `LOG_COMMIT_HEADER`, else 20 lines; markers `... and N more commits` / `... and N more lines`, the latter in `ROUTE_TRUNCATION_MARKERS`; no 80-char cut · deviation: headers wider than planned, from review and measured git output (`<`/`>`/`o` graph nodes, a blank first graph column, `commit [<>=+-] <sha>` side marks, 4-digit abbreviations; a graph with two adjacent blank columns before a node is a `shortcut:`); the selected-host harness and `tests/pi-host-codemode-boundaries.test.ts` seed 25 commits and run `git log -25`, since 5 no longer compact; shared fixture `tests/helpers/git-log-fixture.ts` · evidence: 6 `compactLog` cases and the builder's `git log -3` red on main, then green; every new condition killed by a mutation probe; real git 2.56 logs (default, `--graph`, `--boundary`, `--left-right`, `--cherry-mark`, `--abbrev=4`, octopus) count exactly; `npm test` 656 files green, typecheck clean; live drives: `git log -3` → 30 lines, `applied: false`, no notice; `-30` and `--graph -30` → 20 whole commits, `... and 10 more commits`, `truncated: true`; `--oneline -30` → `... and 10 more lines`, `truncated: true`; review: spec none, standards round 1 high (non-`*` graph nodes) fixed, round 2 medium (4-digit abbreviations) fixed, unreviewed · `2c34fc4b`
3. **Drop markers name true counts** — delivers, for each budget cut in done-when 3, a marker with the true count and unit that `ROUTE_TRUNCATION_MARKERS` matches. `file-listing` reports `entries`. `docs/bash-output.md` lists the markers · proof: `tests/rtk-drop-markers.test.ts`, one red case per compactor first, then green; the per-compactor `tests/rtk-*.test.ts` green · blocked-by 2 · status next
4. **Release 0.19.2** — delivers the version bump in package and lock (pins in `tests/package-version.test.ts` and `tests/package-content.test.ts`) and a dated `[0.19.2]` CHANGELOG entry with Fixed bullets; the `pi-compatibility` workflow is green on the release commit · proof: that workflow run; `tests/package-version.test.ts`; `tests/package-changelog.test.ts` · blocked-by 1, 2, 3 · gate human · status next
   From slice 2: a Fixed bullet for `git log` keeping whole commits and counting `... and N more commits` / `... and N more lines` in their true unit

## Not yet specified
- `git diff`'s per-hunk `... (N context lines)` cut: is it noise, which sets nothing, or a budget cut, which sets `truncated`? Settle it in slice 3's plan. On main its fallback `... +N more changes` counts every output line it drops, file headers and hunk headers included (inferred from `src/rtk/git.ts:126-146`).

## Out of scope
- The word-anywhere matching of the test, linter and docker routes (`grep -rn "jest" src` routes `test-output`): measured harmless 2026-11-02; stays in NOW.md's Next
- Compactors returning a structured `{output, dropped}` in place of marker detection
- Size limits for `git log -p` and other long logs: the bash context guard owns size, with a recoverable original
- `sudo`/`env`/`command`/`exec`/`xargs` prefixes (NOW.md's classifier gaps)
- `src/rtk/truncate.ts`'s `... N lines omitted ...`: exported, called by no route (inferred from `src/rtk/index.ts:3`)

## Decisions
- AGENTS.md's hard rule binds: shrink a tool result only when the full result stays recoverable. `PI_RTK_BYPASS=1` and the context guard keep it so; this arc makes the labels true.
- Owner, 2026-11-02 (chat): `truncated` keeps its documented meaning, a cut past a size budget marked by its "N more" line; noise filters don't set it. `compactedLineCount` keeps counting the final string, hint included. `git log` keeps 20 whole commits and loses its 80-character line cut.
