---
status: active
---
# Pi 1.5 is the one tested host

## Destination
The extension is developed and tested against Pi's latest release, Pi 1.5.0 or a later 1.5.x, as its one host (ruling 0005): codemode host tests fail instead of skipping, the docs name no other host as tested, and Pi's update notice reads our changelog. Ships as 0.19.0.

## Done when
- [ ] The locked host is Pi's latest release at the lock move, at least 1.5.0, with the whole Pi graph, `pi-schema` included, at one version, and the AGENTS.md trial recipe pins `pi-schema` — verified by `npm ls @earendil-works/pi-coding-agent @earendil-works/pi-schema`, `npm run typecheck:pi-host` (its one-version audit naming `pi-schema`) and `grep -n 'pi-schema@\$version' AGENTS.md` (main 2026-11-02: `pi-coding-agent@1.4.0`, no `pi-schema`; neither the audit nor the recipe names it)
- [ ] `npm test && npm run typecheck` pass on that lock, and no codemode host test can skip: a host without the codemode executor fails them — verified by `git grep -n 'skipIf(!supported)' -- tests` returning nothing and the suite run (main 2026-11-02: 37 sites)
- [ ] README.md, AGENTS.md and `docs/` name no Pi version as the current or tested host other than the locked one; a minimum-version claim (`Pi 0.99+`) or a dated measurement passes — verified by a new `tests/doc-host-version.test.ts` (main 2026-11-02: absent; 5 docs say "Pi 1.1" for today's behavior)
- [ ] Pi's own changelog parser, from the selected host, reads `CHANGELOG.md`'s entry for `package.json`'s version — verified by a new `tests/package-changelog.test.ts` (main 2026-11-02: absent)
- [ ] 0.19.0 is released: the version is bumped, a user-facing `[0.19.0]` CHANGELOG entry names the new host, and the `pi-compatibility` workflow passes on the release commit — verified by that workflow run and `tests/package-version.test.ts` (main 2026-11-02: 0.18.0)

## Now
Active: slice 4 (Pi reads our changelog), branch `pi-1-5-host/04-changelog-parse`; next: build `tests/package-changelog.test.ts`.

## Seams
- `scripts/pi-compat-host.mjs` (`selectCompatHost`) and `tests/helpers/codemode-recipes.ts` (`supported`) → the `tests/pi-host-*.test.ts` files
- `package.json` devDependencies and `package-lock.json` → `npm ls`
- `scripts/typecheck-pi-host.mjs`'s one-version audit → `tests/pi-host-declarations.test.ts`
- Host version wording in README.md, AGENTS.md and `docs/` → `tests/doc-host-version.test.ts` (new)
- `CHANGELOG.md` through the selected host's `parseChangelog` (`dist/utils/changelog.js`) → `tests/package-changelog.test.ts` (new)
- `.github/workflows/pi-compatibility.yml` → its run on the slice's PR
- Real artifact: the locked Pi's `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<prompt>"`, observed in the `tool_execution_end` events

## Slices
1. **Codemode host tests fail instead of skipping** — delivers `supported` and its 37 `it.skipIf(!supported)` sites gone; any selected host without the codemode executor fails the helper at load, as an explicit override already does (a prefactor, on Pi 1.4.0) · proof: the `git grep` goes 37→0; with the executor check pointed at a missing path, the codemode tests fail instead of skipping; `npm test && npm run typecheck` · blocked-by — · status done
   `tests/helpers/codemode-recipes.ts` throws at load on any executorless host and exports `executor`; 24 codemode host files lose their skips, five copied checks and `pi-host-codemode.test.ts`'s `describe.skipIf` included · deviation: `tests/pi-host-codemode-host-selection.test.ts` gained a locked-host case after review (the override-only pin let `PI_COMPAT_HOST && …` stay green) · grep 37→0; executor pointed at a missing file: main 24 files skipped, branch 24 failed; `npm test` 653 files, 2659 passed, 1 skipped (startup-performance `runIf`); typecheck clean · `bd56f921`
2. **Docs name only the locked host** — delivers `tests/doc-host-version.test.ts`, reading the locked version from `package-lock.json`, and the "Pi 1.1" lines rewritten as minimum-version claims or the locked host (on Pi 1.4.0) · proof: the new test red on main's docs, green after; a "locked Pi <other>" line turns it red · blocked-by — · status done
   `tests/doc-host-version.test.ts` passes a `Pi <version>` that is the locked one, a minimum claim (`+`, `and newer`, `or later`) or on a dated line, but never a dated `locked`/`currently` one; four codemode-enable and `--no-extensions` lines became `Pi 1.1+` (Pi's CHANGELOG 1.1.0 adds `+name`), and the startup and benchmark records gained their dates · deviation: none · main's docs: 8 violations named; after: green; a scratch "locked Pi 1.3.0" line red; 7 mutations of the rule each red; `npm test` 654 files, 2662 passed, 1 skipped; typecheck clean · `6ae1a2ed`
3. **Locked host moves to Pi 1.5** — delivers devDependencies and the lockfile at Pi's latest 1.5.x release, `pi-schema` in the AGENTS.md recipe and the one-version audit, and README.md, AGENTS.md and `docs/` naming the new host · proof: the first done-when command goes red→green; `npm test && npm run typecheck`; `tests/doc-host-version.test.ts` red after the bump until the docs move; a live drive in a fresh session on the new host · blocked-by 1, 2 · status done
   devDependencies and lock at Pi 1.5.0 with `pi-schema` 1.5.0 in the graph; `typecheck-pi-host.mjs` audits `pi-schema`; the AGENTS.md recipe pins it; README.md and AGENTS.md name 1.5.0, AGENTS.md:131 keeps its dated 1.4.0 measurement without "locked" · deviation: `vitest.config.ts` aliases the pi-ai root to the host's `pi-ai-extension-view.js`, as Pi's loader does, since 1.5.0's root `StringEnum` is a plain object and `Type.Optional` leaked `"~optional": true` into 6 direct-import schema tests (the real loader, source and dist, shows none) · `npm ls` 1.4.0/no pi-schema → 1.5.0 with pi-schema; a 1.4.0 pi-schema fails the audit; doc test red (5 lines) before the docs moved; `npm test` 654 files, 2662 passed, 1 skipped; host tests with `PI_COMPAT_REQUIRE_NU=1` 30 files, 72 passed; live drive on Pi 1.5.0 read `1:1df|export function alpha() {` and edited the file · `1f549167`
4. **Pi reads our changelog** — delivers `tests/package-changelog.test.ts`: the selected host's `parseChangelog` finds `CHANGELOG.md`'s entry for `package.json`'s version · proof: the test passes on the new host; a heading outside Pi's format (`## v0.18.0`) turns it red · blocked-by 3 · status done
   `tests/package-changelog.test.ts` imports `parseChangelog` from `selectCompatHost()`'s `dist/utils/changelog.js` and expects `package.json`'s version among the parsed entries; AGENTS.md's trial recipe runs it · deviation: none · green on Pi 1.5.0 and through `PI_COMPAT_HOST`; `## v0.18.0` red, package.json at 0.19.0 red, a missing override fails at load; `npm test` 655 files, 2663 passed, 1 skipped; host tests with `PI_COMPAT_REQUIRE_NU=1` 31 files, 73 passed; `npm run typecheck` clean
5. **Release 0.19.0** — delivers the version bump and a dated, user-facing `[0.19.0]` CHANGELOG entry naming the new host, with the `pi-compatibility` workflow green on the release commit · proof: that workflow run; `tests/package-version.test.ts`; `tests/package-changelog.test.ts` · blocked-by 3, 4 · gate human · status next

## Not yet specified
- A later 1.5.x than 1.5.0 may break more than 1.5.0 did; 1.5.0 passed the host tests (30 files, 71 tests) and `typecheck:pi-host` (0 diagnostics) through `PI_COMPAT_HOST`, measured 2026-11-02.
- From slice 3: no real-loader test pins the optional enum schemas (`find.type`, `find.sortBy`, `read.bundle`, `grep.scope`); a host that dropped the `TUnsafe` `StringEnum` view would leak `"~optional": true` into provider schemas without any test failing

## Out of scope
- Integer parameter schemas in place of the number-or-string unions and `coerce-obvious-int.ts`: Pi 1.5's pi-schema converts numeric strings itself and passes any string through the unions (measured 2026-11-02); a contract change for its own arc, in NOW.md's Next
- `raw-argument-guard`'s null handling, which pi-schema's coercion of `null` optional fields now overlaps
- `keyHint`/`keyText` from the render context in place of the `pi-coding-agent` import in `src/tui-render-utils.ts`
- `toScriptJson` returning `JsonValue`; whether the npm 11/12 pack matrix earns its CI time
- The `Python mapper failed` log in the host tests, present on Pi 1.4.0 too
- `npm publish`: the owner runs it after slice 5 (Release 0.19.0)

## Decisions
- [0003 Host-provided peers keep "*" ranges](../decisions/0003-host-peers-stay-wildcard.md)
- [0005 One tested host](../decisions/0005-one-tested-host.md)
