---
status: active
---
# Chained bash output is never mislabeled

## Destination
Bash compression never drops or mislabels output from a chained or piped command: a command line compresses only when exactly one of its parts prints, and that part picks the compactor; any result a compactor changed names `PI_RTK_BYPASS=1`. Ships as 0.19.1.

## Done when
- [ ] `git log -3; gh pr view 259 --json body` and `git log -1 --format=%B && cat README.md` come back with every output line and technique `none` — verified by a new `tests/rtk-compound-routing.test.ts` (main 2026-11-02, `filterBashOutput` probe: technique `git`, 38 and 23 lines replaced by "… and N more commits")
- [ ] A command line whose one printing part has a compactor still routes to it, the rest of its parts being known-silent (`cd`, `pushd`, `popd`, `export`, `unset`, `set`, `mkdir -p`, `true`, `:`, bare assignments) or feeding a pipe: `cd sub && git diff` and `export X=1; git diff` route `git`, `git diff | cat` routes as `cat` (none), and `git status && git diff` passes through — verified by `tests/rtk-compound-routing.test.ts` (main 2026-11-02: `cd sub && git diff` technique `none`)
- [ ] Every bash result a compactor changed starts with the `[RTK: compressed …]` line naming `PI_RTK_BYPASS=1 <command>`, whatever its size and ratio — verified by `tests/rtk-metadata.test.ts` (main 2026-11-02: it pins the notice's absence at an original of 2000 B and at a ratio of 0.5)
- [ ] 0.19.1 is released: the version is bumped, a `[0.19.1]` CHANGELOG entry names the fix under Fixed, and the `pi-compatibility` workflow passes on the release commit — verified by that workflow run, `tests/package-version.test.ts` and `tests/package-changelog.test.ts` (main 2026-11-02: 0.19.0)

## Now
Slice 2 (Compound commands route by their one printing part) active on `compound-routing/02-route-by-printing-part`. Next action: build it; slice 3 (Every compaction names its bypass) stays unblocked for a later session.

## Seams
- `parseShellCommands` in `src/bash-command-state.ts` → `tests/bash-command-state.test.ts`
- `filterBashOutput` in `src/rtk/bash-filter.ts` → `tests/rtk-compound-routing.test.ts` (new), `tests/bash-filter.test.ts`
- `buildRtkNotice` in `index.ts`, through the extension's bash `tool_result` handler → `tests/rtk-metadata.test.ts`
- `package.json`, `package-lock.json` and `CHANGELOG.md` → `tests/package-version.test.ts`, `tests/package-content.test.ts`, `tests/package-changelog.test.ts`, the `pi-compatibility` workflow
- Real artifact: `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<prompt>"` in a scratch directory, observing the bash `tool_execution_end` events

## Slices
1. **Shell parser marks printing parts** — delivers, for each simple command `parseShellCommands` returns, its source text, whether it runs inside a substitution, and whether its stdout feeds a pipe; `extractShellFileMutationTargets` unchanged (a prefactor) · proof: new cases in `tests/bash-command-state.test.ts` (`a; b`, `a && b | c`, `echo $(git log)`, `(cd x && git diff)`, a heredoc, quoted `;` and `|`), red on main for the new fields; the existing `tests/bash-command-state.test.ts` green · blocked-by — · status done
   `parseShellCommands`, now exported, gives each `SimpleCommand` `text` (source span, redirections included), `inSubstitution` (`$(…)`, backticks, `<(…)`, `>(…)`) and `feedsPipe` (`|`, `|&`, not `||`) · deviation: none; a group piped as a whole marks only its closing part, a `shortcut:` miss · evidence: 14 new cases red on main (no export), 83/83 green after; `npm test` 2676 passed, typecheck clean; mutation probe 8/8 red; live drive loads and still records the `cp` target · `3d2ef927`
2. **Compound commands route by their one printing part** — delivers `filterBashOutput` classifying the command line's parts: top-level, not feeding a pipe, not known-silent; exactly one such part picks the route and is the command the compactor sees, otherwise no route; `docs/bash-output.md` states the rule · proof: `tests/rtk-compound-routing.test.ts` red on main for the first two done-when checks, green after; `tests/bash-filter.test.ts` and the `tests/rtk-*.test.ts` suite green; a live drive of `git log -3; echo done` showing every line · blocked-by 1 · status done
   `filterBashOutput` routes by `printingPart`, the one part that is top-level, feeds no pipe and isn't known-silent (the shape's list, unless given `-` or a verbose flag), and hands that part to the compactor; none or several printing parts route nowhere; the test route follows the same rule; `docs/bash-output.md` states it · deviation: none from the destination; review added the `-`/verbose-flag exception (`cd -`, `mkdir -p -v`, `set -v` print); `bash-command-state.ts` imports `./context-hygiene.ts` so `bash-filter.ts` still loads under plain Node (#048); keyword parts and a piped group's inner parts count as printing, `>(…)` parts as silent, a `shortcut:` · evidence: 13 of 21 new cases red on main, the rest already `none` there (2 lost-line probes 58→21 and 39→23 lines), 21/21 green; mutation probe 20/20 red; `npm test` 2698 passed, typecheck clean; live drive of `git log -3; echo done`: main 21 lines, `done` dropped for "… and 7 more commits", branch 27 lines, `done` kept
3. **Every compaction names its bypass** — delivers `buildRtkNotice` emitting its notice whenever a compactor changed the output (technique not `none`, output differs from the ANSI-stripped input), dropping the 2000 B and 0.5 thresholds; `docs/bash-output.md` and `prompts/` updated where they state the threshold · proof: `tests/rtk-metadata.test.ts`'s two omission cases flip to expect the notice (red first), an ANSI-strip-only test-output result still has none · blocked-by — · status next
4. **Release 0.19.1** — delivers the version bump in package and lock (pins in `tests/package-version.test.ts`, `tests/package-content.test.ts`) and a dated `[0.19.1]` CHANGELOG entry with Fixed bullets, the `pi-compatibility` workflow green on the release commit · proof: that workflow run; `tests/package-version.test.ts`; `tests/package-changelog.test.ts` · blocked-by 2, 3 · gate human · status next

## Not yet specified
- Within one part, the test, linter and docker checks still match a word anywhere (`grep -rn "jest" src` routes `test-output`); measured harmless 2026-11-02, since `test-output` only strips ANSI and the linter and docker compactors return the input unchanged or give up on output that isn't theirs. Revisit if a compactor starts changing foreign output.

## Out of scope
- Splitting merged output back into per-part outputs: one stream, no reliable boundary
- `sudo`/`env`/`command`/`exec`/`xargs` prefixes and a real bash grammar (NOW.md's classifier gaps); a prefixed command matches no compactor and passes through
- Schema simplification on Pi 1.5's pi-schema (stays in NOW.md's Next)

## Decisions
- None new. The binding rule is AGENTS.md's hard rule: shrink a tool result only when the full result stays recoverable.
