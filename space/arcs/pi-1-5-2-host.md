---
status: active
---
# Pi 1.5.2 is the one tested host

Pi 1.5.2 is out, and it is what `pi update` installs, but the extension is still tested against Pi 1.5.0. Pi 1.5.1 also fixed its own grep, which ours hands each search to: a file filter beside a folder now finds files instead of nothing, and a search that hits its limit exactly now counts as complete. No test of ours notices either change. This arc moves testing to Pi 1.5.2, makes our grep's tests and docs say what it now does, and ships the result as 0.25.0.

## Destination
The extension is developed and tested against Pi 1.5.2 as its one host (ruling 0005), and our `grep`'s `glob`, completeness and context-line behavior on that host is pinned by tests and stated in `prompts/grep.md`. Ships as 0.25.0.

## Done when
- [ ] The locked host is Pi 1.5.2, with the whole Pi graph, `pi-schema` included, at one version — verified by `npm ls @earendil-works/pi-coding-agent @earendil-works/pi-schema` and `npm run typecheck:pi-host`'s one-version audit (main 2026-11-10: 1.5.0)
- [ ] `npm test && npm run typecheck` pass on that lock, `tests/doc-host-version.test.ts` among them, with README.md, AGENTS.md and `docs/` naming no other host as current — verified by the suite run (main 2026-11-10 with the lock moved to 1.5.2 in a scratch worktree: 3 files failed, `doc-host-version`, `grep-limit-notice-dedup`, `repro-262-codemode-gaps`)
- [ ] `grep` with `path` and a `glob` naming subfolders (`path: "repo", glob: "sub/**/*.ts"`) matches the glob relative to `path` and names each file from the cwd (`repo/sub/deep/x.ts`), and `prompts/grep.md` says `glob` is relative to `path` — verified by a new `tests/grep-glob-path.test.ts` (main 2026-11-10: Pi 1.5.0's grep returns `No matches found`)
- [ ] `grep` with exactly `limit` matches reports a complete search with no stop notice, and with more than `limit` still reports `completeness unknown` with the notice, and `prompts/grep.md` says so — verified by `tests/repro-262-codemode-gaps.test.ts` and `tests/grep-limit-notice-dedup.test.ts` (main 2026-11-10: exactly `limit` reads `unknown`)
- [ ] `grep` with `context` prints each line of overlapping windows once, each with its anchor, and `deduplicateContext` is gone from `src/` unless a pinned case still needs it — verified by a new `tests/grep-context-output.test.ts` and `git grep -n deduplicateContext -- src` (main 2026-11-10: test absent; `src/grep.ts:284`)
- [ ] 0.25.0 is released: the version is 0.25.0, and its `[0.25.0]` CHANGELOG entry names Pi 1.5.2 as the tested host and the `glob` and exact-limit changes — verified by `tests/package-version.test.ts`, `tests/package-changelog.test.ts` and the `pi-compatibility` workflow on the release commit (main 2026-11-10: 0.24.0)

## Now
Next: slice 3 (Grep context dedup cut), on a branch from main.

## Seams
- `package.json` devDependencies and `package-lock.json` → `npm ls`; `scripts/typecheck-pi-host.mjs`'s one-version audit → `tests/pi-host-declarations.test.ts`
- `src/grep.ts`'s registered `grep` over the locked host's `createGrepTool` → `tests/grep-glob-path.test.ts`, `tests/grep-context-output.test.ts` (new), `tests/grep-limit-notice-dedup.test.ts`, `tests/repro-262-codemode-gaps.test.ts`
- `prompts/grep.md` → its phrase pins in `tests/documentation-*.test.ts`, if any name the changed lines
- Host version wording in README.md, AGENTS.md and `docs/` → `tests/doc-host-version.test.ts`
- `CHANGELOG.md` and the version → `tests/package-changelog.test.ts`, `tests/package-version.test.ts`, `tests/package-content.test.ts`
- `.github/workflows/pi-compatibility.yml` → its run on the slice's PR
- Real artifact: the installed `pi` (1.5.2): `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<prompt>"`, observed in the `tool_execution_end` events

## Slices
1. **Grep context output pinned** — delivers `tests/grep-context-output.test.ts`: `grep` with `context` over one file whose match windows overlap and end on an empty line prints each line once, in order, with its anchor, as it does today on Pi 1.5.0 (a prefactor) · proof: the test green on main's lock; each of dropping `deduplicateContext` and reordering its output turns it red, or the test names the case that stays green · blocked-by — · status done
   `tests/grep-context-output.test.ts` pins one file's `context: 1` output through `registerGrepTool`: exact text lines and `ptcValue.records`, the overlap at line 3 once, the empty line 5 with its anchor, `--` at the 6–7 gap, adjacent match 10 as a match · deviation: none; the sort stays unpinned, named in the test, since the host emits a file's new line numbers in ascending order · evidence: green on the Pi 1.5.0 lock; mutants of `deduplicateContext` red for return-input (line 3 twice, 9 and 10 as context, no `--`), no `--`, no match-over-context, green for no-sort; `npm test` 631 files, 2502 passed, 1 skipped; typecheck clean; standards review no findings · `bad8c672`
2. **Locked host moves to Pi 1.5.2** — delivers devDependencies and the lockfile at Pi 1.5.2; `tests/grep-glob-path.test.ts` and `prompts/grep.md`'s `glob` line naming `path` as its base; the exact-limit cases of the two completeness tests and `prompts/grep.md:30` following Pi 1.5.2; the docs' 1.5.0 lines moved to 1.5.2 or dated as measurements; `src/bash-renderer.ts:96`'s copied `formatToolDuration` checked against 1.5.2's · proof: the new glob test red on the 1.5.0 lock, green on 1.5.2; the first two done-when checks red→green; slice 1's pin still green; a live drive of `grep` with `path` and `glob` on the installed Pi 1.5.2 · blocked-by 1 · status done
   Lock at Pi 1.5.2 (all eight Pi packages, `pi-schema` included); `tests/grep-glob-path.test.ts` pins `path: "repo", glob: "sub/**/*.ts"` → `repo/sub/deep/x.ts`; the completeness tests read exactly `limit` as complete with no notice; `prompts/grep.md`, `docs/structured-output.md` and `docs/codemode-verification.md`'s live gate say so; README.md and AGENTS.md name 1.5.2, `docs/tool-cost.md` and the two A/B summaries date their 1.5.0 runs · deviation: `tests/doc-host-version.test.ts`'s `locked`/`currently` check made case-insensitive, since `Locked Pi 1.5.0` at `docs/tool-cost.md:80` slipped past it; the two generated `summary.md` files hand-dated · evidence: `npm ls` and `typecheck:pi-host` 1.5.0 → 1.5.2, 0 diagnostics; glob test red on 1.5.0 (`[0 matches in 0 files]`), green on 1.5.2; the bump alone failed `doc-host-version`, `grep-limit-notice-dedup`, `repro-262-codemode-gaps`; after, `npm test` 632 files, 2504 passed, 1 skipped, typecheck clean, slice 1's pin green; `PI_COMPAT_REQUIRE_NU=1` host tests 31 files, 73 passed; live `pi` 1.5.2 drive returned `repo/sub/deep/x.ts:>>1:ae8|const needle = 1;`; standards review one medium (live gate) fixed, spec none · `70b81771`
3. **Grep context dedup cut** — delivers `deduplicateContext` removed from `src/grep.ts` when slice 1's pin stays green without it on Pi 1.5.2; else kept, with the case that needs it added to the pin · proof: `tests/grep-context-output.test.ts` green after the cut; `npm test && npm run typecheck` · blocked-by 2 · status next
   From slice 2: Pi 1.5.2 takes context lines from ripgrep (its 1.5.1 CHANGELOG); measure `deduplicateContext` against that output
4. **Release 0.25.0** — delivers the version bump and a dated `[0.25.0]` CHANGELOG entry: Changed for the tested host, `glob` beside `path` and the exact-limit completeness · proof: `tests/package-version.test.ts`, `tests/package-changelog.test.ts`; the `pi-compatibility` workflow on the merge commit · blocked-by 2, 3 · status next

## Not yet specified
- Whether models write a cwd-relative `glob` beside `path` (`path: "repo", glob: "repo/sub/**/*.ts"`), which matches nothing on Pi 1.5.2; a hint for it is option (c) of the shaping, act if a miss turns up in use.
- From slice 2: the provider-visible `glob` description in `src/grep.ts:43` stays "Glob filter" and does not say it is relative to `path`; revisit with the cwd-relative `glob` hint above.

## Out of scope
- Translating a cwd-relative `glob` into a `path`-relative one.
- The other Pi 1.5 follow-ups in NOW.md's Next: a real-loader pin of the optional enum schemas, one version test in place of the hard-coded literals, integer parameter schemas.
- `npm publish`: the owner runs it after slice 4 (Release 0.25.0).

## Decisions
- [0003 Host-provided peers keep "*" ranges](../decisions/0003-host-peers-stay-wildcard.md)
- [0005 One tested host](../decisions/0005-one-tested-host.md)
- Owner, 2026-11-10 (chat): move to Pi 1.5.2 before the replay drive; `glob` beside `path` follows Pi (relative to `path`), documented and pinned, no translation; exactly `limit` matches is a complete search; scope is the move plus grep's context pin and the `deduplicateContext` cut if measured unneeded; 0.25.0, merged by the agent, published by the owner.
