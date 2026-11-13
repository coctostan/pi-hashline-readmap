---
status: active
---
# Known bugs stop recurring

Two bugs keep coming back. Claude Opus 5.5 sometimes sends an edit as text with a closing brace missing, so the edit is refused and sent again. One benchmark test fails at random when the machine is busy, which makes the full test run untrustworthy. This arc fixes both, removes a code path nothing uses and adds two small checks, then ships them as 0.28.1.

## Destination
On the locked Pi 1.5.2 host, an `edit` whose `edits` string is missing only closing `}` applies as the array it meant; `tests/bench-tool-ab.test.ts` no longer fails under load, its cause named; `buildGrepOutput` requires `native`; grep's one-line context gap and the bench summary's run date are pinned; 0.28.1 ships it.

## Done when
- [ ] Through Pi 1.5.2's real `runToolCall` pipeline, an `edit` whose `edits` is a string that parses as a JSON array once only closing `}` are inserted, each where `JSON.parse` stops wanting a property name at `{` or stops at `]`, writes what that array would; the ten such strings recorded in the owner's sessions since 2026-11-11 22:00 (four in this repo: 2026-11-12 02:11, 03:05, 17:56, 18:08) apply, the text inside each edit unchanged: the five from public repos verbatim, and the five from private repos with each `new_text`'s characters replaced by `x`, its whitespace, escapes and JSON punctuation kept, so no private text enters this public repo (owner, 2026-11-13); a string with any other fault (an unclosed string, a trailing comma, a missing `]`, an extra `}`, a JSON object) fails Pi's validation as it does today — verified by `tests/pi-host-string-edits.test.ts` and `tests/normalize-tool-params-recursive.test.ts` (main: 10 of 10 stringified `edits` in 79 sessions since 2026-11-11 22:00 refused, all Claude Opus 5.5, each valid after only that insertion)
- [ ] The `ENOTEMPTY` at `scripts/bench/tool-ab.mjs:428`'s cleanup has a named cause, with evidence, and a test reproducing it deterministically that fails on main and passes after the fix; if no deterministic repro exists, `tests/bench-tool-ab.test.ts` passes 20 runs in a row under a load the slice states — verified by that test or that run (main: failed 3 times in unused-code (Code nothing uses is gone), passing alone)
- [ ] `BuildGrepOutputInput.native` is required and `src/grep-output.ts` holds no fallback for its absence — verified by `npm run typecheck` and `git grep -n "native?\." -- src/grep-output.ts` printing nothing (main: 4 hits, lines 158, 172, 174, 182)
- [ ] `tests/grep-context-output.test.ts` pins a one-line context gap (context lines 3 then 5, `--` between them), and `tests/bench-tool-ab.test.ts` pins `formatSummary`'s summary line carrying the run's date — verified by those tests, the first red under `> previous + 2` in `separateContextGroups` (main: `> previous + 2` passes both context tests; the summary line has no date)
- [ ] Nothing else changes: `npm test && npm run typecheck && npm run typecheck:pi-host` pass with no existing assertion edited beyond those a slice's plan names — verified by that command
- [ ] 0.28.1 carries it: `package.json` reads 0.28.1 with a dated `[0.28.1]` CHANGELOG entry naming the changes, and the `pi-compatibility` workflow passes on the release's merge commit, verified on the release, outside the code — verified by `tests/package-version.test.ts`, `tests/package-changelog.test.ts` and that workflow run

## Now
slice 2 (Bench cleanup survives load) is active on `known-bugs/02-bench-cleanup`. Next action: build the fix and its test, then prove under suite load.

## Design
- **Chosen:** `parseJsonArray` (`src/normalize-tool-params.ts`), the one place an array field's string becomes an array, tries `JSON.parse` and, on failure, inserts a `}` only where the parser wanted a property name and found `{`, or found `]`, retrying until it parses or fails another way; it accepts the result only when it is an array, so Pi's validation and the hash anchors still judge every edit.
- **Other:** a general JSON repair library (such as `jsonrepair`) behind the same function, fixing quotes, commas, comments and truncation too.
- **Simpler by reader load:** the chosen one. The library is one call to read but repairs faults no model was seen making, so a reader must learn its whole repair set to know what can now land; the chosen repair does one thing a reader can check in the function.

## Seams
- `parseJsonArray` through `normalizeToolParameters` (`src/normalize-tool-params.ts`) → `tests/normalize-tool-params-recursive.test.ts`; the real host pipeline → `tests/pi-host-string-edits.test.ts`
- The bench's run lifecycle, `runOne` and `locateTask` (`scripts/bench/tool-ab.mjs`), and `formatSummary` → `tests/bench-tool-ab.test.ts`
- `buildGrepOutput` (`src/grep-output.ts`) → its test files and `npm run typecheck`
- The `grep` tool's context output (`separateContextGroups`, `src/grep.ts`) → `tests/grep-context-output.test.ts`
- Release → `tests/package-version.test.ts`, `tests/package-changelog.test.ts`, the `pi-compatibility` workflow
- Real artifact: `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p`, by `AGENTS.md` § Prove, reading `tool_execution_end` events

## Slices
1. **Missing closing braces are restored** — delivers `parseJsonArray` inserting only missing closing `}` into an array field's string before giving up on it; its reach is `git grep -n -E "parseJsonArray|normalizeToolParameters|expected object, got string|JSON\.parse" -- src prompts docs tests`, each hit listed or excluded by name · proof: the unit cases and the ten recorded strings in `tests/pi-host-string-edits.test.ts` red on main, green after; a live drive by `AGENTS.md` § Prove whose codemode script sends one recorded string, its `tool_execution_end` showing the edit applied · blocked-by — · status done
   `parseJsonArray` inserts a `}` where `JSON.parse` stops at an item's `{` after a `,`, or at `]`, until it parses or stops elsewhere; the ten recorded strings sit in `tests/fixtures/string-edits/recorded.json` with the arrays they meant · deviation: the five from private repos have their `new_text` replaced by `x` (done-when 1 reworded, owner 2026-11-13); the plan's brace budget was dropped, since the stop rule ends the loop (a 300,000-string fuzz never looped), and the live drive needed `-e builtin:codemode`, which `--no-extensions` drops · evidence: the two focused files red on main (4 unit cases; recorded string 0 refused by validation), 20 of 20 green after; `npm test` 639 of 639 files, `npm run typecheck`, `npm run typecheck:pi-host` 0 diagnostics; mutations of each branch, the `,` check (a hang) and the array check turn tests red; live gpt-6-luna drive: codemode's nested `edit` of the 877-character 2026-11-12 03:05 string `isError=false`, both lines written, the same drive on main `edits.0: expected object, got string` and the file unchanged · `5c7232a7`
2. **Bench cleanup survives load** — delivers the root cause of the `ENOTEMPTY` at `scripts/bench/tool-ab.mjs:428`, found by `diagnose`, and its fix; the reconcile line retires `NOW.md`'s accepted "full-suite load flakes (not root-caused)" or says what it still covers · proof: a deterministic repro red on main, green after, or 20 loaded runs of `tests/bench-tool-ab.test.ts` passing in a row, the load stated · blocked-by — · status active
   - **Goal:** done-when 2: the cause named with evidence, a deterministic test red on main and green after.
   - **Cause (diagnosed, measured):** `locateTask`'s `prepare` runs `git commit`, which spawns `git maintenance run --auto --detach` (git ≥ 2.47); on the 883 loose objects of the snapshot the detached process runs `geometric-repack` (`git repack -d … --write-midx`, then `update-server-info`) for ~0.45 s after `prepare` returns. Under full-suite load that overlaps `runOne`'s `rmSync`, whose libc++ `remove_all` (Node 26, `maxRetries` 0) finds `.git/objects/info/packs` written mid-removal: ENOTEMPTY. Evidence: a debug probe in 3 loaded full suites (3 of 3 runs red, 9 cleanups) found only `.git/objects/info/packs` (once also `.git/info/refs`) left; the failing workspace's trace2 log shows the repack starting after `commit` exited.
   - **Assumptions:** `-c maintenance.auto=false` stops `git commit` spawning maintenance (git-config `maintenance.auto`); the test helpers' own `git commit`s (`gitRepo`, `treeChanges`) hold 1–3 objects, under the repack threshold, so they stay.
   - **Reach:** `git grep -n '"commit"' -- scripts tests`: `locateTask` (`scripts/bench/tool-ab.mjs:112`) fixed; `tests/bench-tool-ab.test.ts` `gitRepo` and `treeChanges` excluded by the assumption; `explicit-edit.mjs` workspaces have no git. `space/NOW.md`'s accepted "full-suite load flakes (not root-caused)" is retired by the reconcile line.
   - **Behavior:** a prepared workspace starts no background git maintenance; expected from git's docs (commit runs `git maintenance run --auto` unless `maintenance.auto` is false); test in `tests/bench-tool-ab.test.ts`'s `locateTask` block reads `GIT_TRACE2_EVENT` for a `maintenance` child, red on main.
   - **Proof:** that test red on main, green after; the full suite run 4 times as load (the conditions that failed 3 of 3 above), `tests/bench-tool-ab.test.ts` green in each; `npm test && npm run typecheck && npm run typecheck:pi-host`.
3. **Grep output requires native** — delivers `BuildGrepOutputInput.native` required, the `?.` and `??` fallbacks at `src/grep-output.ts:158`, `:172`, `:174`, `:182` gone, and the tests that build output without it passing it; its reach is `git grep -n "buildGrepOutput(" -- src tests` · proof: `npm run typecheck`; the git grep of the third done-when check empty; the grep tests green · blocked-by — · status next
4. **Context gap of one line is pinned** — delivers a case in `tests/grep-context-output.test.ts` where context lines 3 and 5 are shown with `--` between · proof: the case green on main and red under `> previous + 2` in `separateContextGroups`, the mutation reverted · blocked-by — · status next
5. **Bench summary carries its run date** — delivers `formatSummary` writing the run's date into the summary line, from `run.json`'s `startedAt` · proof: a `tests/bench-tool-ab.test.ts` case red on main, green after · blocked-by — · status next
6. **Release 0.28.1** — delivers the version bump and a dated `[0.28.1]` CHANGELOG entry naming each slice's change; `npm publish` stays the owner's · proof: `tests/package-version.test.ts`, `tests/package-changelog.test.ts`; the `pi-compatibility` workflow on the merge commit · blocked-by 1, 2, 3, 4, 5 · status next

## Not yet specified
- From slice 1: `AGENTS.md` § Prove's drive gets no codemode under `--no-extensions`, which drops Pi's built-in extensions; a codemode drive needs `-e builtin:codemode --tools +codemode`, so name that in § Prove

## Out of scope
- A clearer error for other malformed `edits` strings; any repair beyond inserting `}`
- From `NOW.md`'s line on pi-1-5-2-host (Pi 1.5.2 is the one tested host)'s close: the hint for a cwd-relative `glob` beside `path`, and `src/grep.ts:43`'s "Glob filter" description
- `npm publish` of 0.28.1

## Decisions
