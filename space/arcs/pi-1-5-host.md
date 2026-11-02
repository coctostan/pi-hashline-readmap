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
Active: slice 1 (Codemode host tests fail instead of skipping), branch `pi-1-5-host/01-codemode-tests-fail`; next: build.

## Seams
- `scripts/pi-compat-host.mjs` (`selectCompatHost`) and `tests/helpers/codemode-recipes.ts` (`supported`) → the `tests/pi-host-*.test.ts` files
- `package.json` devDependencies and `package-lock.json` → `npm ls`
- `scripts/typecheck-pi-host.mjs`'s one-version audit → `tests/pi-host-declarations.test.ts`
- Host version wording in README.md, AGENTS.md and `docs/` → `tests/doc-host-version.test.ts` (new)
- `CHANGELOG.md` through the selected host's `parseChangelog` (`dist/utils/changelog.js`) → `tests/package-changelog.test.ts` (new)
- `.github/workflows/pi-compatibility.yml` → its run on the slice's PR
- Real artifact: the locked Pi's `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<prompt>"`, observed in the `tool_execution_end` events

## Slices
1. **Codemode host tests fail instead of skipping** — delivers `supported` and its 37 `it.skipIf(!supported)` sites gone; any selected host without the codemode executor fails the helper at load, as an explicit override already does (a prefactor, on Pi 1.4.0) · proof: the `git grep` goes 37→0; with the executor check pointed at a missing path, the codemode tests fail instead of skipping; `npm test && npm run typecheck` · blocked-by — · status active
   - Goal: `git grep -n 'skipIf(!supported)' -- tests` returns nothing, and no codemode host test can skip: a selected host, locked or override, without `dist/extensions/codemode/execute.js` fails at helper load.
   - Assumptions: the five files that copy the executor check (cancellation, image-persistence, permission, codemode-boundaries, codemode) are the same skip and go too, `pi-host-codemode.test.ts`'s `describe.skipIf` included though the grep misses it; the locked Pi 1.4.0 ships the executor, so the suite stays green; no test pins the throw, since it is one line.
   - Reach: `tests/helpers/codemode-recipes.ts` (`supported` → an unconditional throw, `executor` exported); the 19 `tests/pi-host-recipe-*`, `pi-host-store-*`, `pi-host-codemode-{loadout,benchmark}` files importing `supported`; `tests/pi-host-{cancellation,image-persistence,permission,codemode-boundaries,codemode}.test.ts` (own check → the helper's); AGENTS.md "Host compatibility" ("an explicit host" → any selected host).
   - Proof: the grep 37→0 (and the `describe.skipIf` gone); the executor path pointed at a missing file on main skips, on the branch fails every codemode host file; `npm test && npm run typecheck`.
2. **Docs name only the locked host** — delivers `tests/doc-host-version.test.ts`, reading the locked version from `package-lock.json`, and the "Pi 1.1" lines rewritten as minimum-version claims or the locked host (on Pi 1.4.0) · proof: the new test red on main's docs, green after; a "locked Pi <other>" line turns it red · blocked-by — · status next
3. **Locked host moves to Pi 1.5** — delivers devDependencies and the lockfile at Pi's latest 1.5.x release, `pi-schema` in the AGENTS.md recipe and the one-version audit, and README.md, AGENTS.md and `docs/` naming the new host · proof: the first done-when command goes red→green; `npm test && npm run typecheck`; `tests/doc-host-version.test.ts` red after the bump until the docs move; a live drive in a fresh session on the new host · blocked-by 1, 2 · status next
4. **Pi reads our changelog** — delivers `tests/package-changelog.test.ts`: the selected host's `parseChangelog` finds `CHANGELOG.md`'s entry for `package.json`'s version · proof: the test passes on the new host; a heading outside Pi's format (`## v0.18.0`) turns it red · blocked-by 3 · status next
5. **Release 0.19.0** — delivers the version bump and a dated, user-facing `[0.19.0]` CHANGELOG entry naming the new host, with the `pi-compatibility` workflow green on the release commit · proof: that workflow run; `tests/package-version.test.ts`; `tests/package-changelog.test.ts` · blocked-by 3, 4 · gate human · status next

## Not yet specified
- A later 1.5.x than 1.5.0 may break more than 1.5.0 did; 1.5.0 passed the host tests (30 files, 71 tests) and `typecheck:pi-host` (0 diagnostics) through `PI_COMPAT_HOST`, measured 2026-11-02.

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
