---
status: active
---
# Pi 1.4.0 is the one tested host

## Destination
The extension is developed and tested against exactly one Pi host, the locked Pi 1.4.0, with `PI_COMPAT_HOST` kept as an override for trying a newer Pi before the lock moves. The tools it replaces regain what Pi's built-ins gained since 0.84.2: constrained sampling and bash row durations. Ships as 0.18.0.

## Done when
- [ ] The locked development host is exactly Pi 1.4.0, and plain `npm test` runs the codemode host tests instead of skipping them — verified by `npm ls @earendil-works/pi-coding-agent` and `npx vitest run tests/pi-host-codemode-boundaries.test.ts tests/pi-host-recipe-program.test.ts tests/pi-host-codemode-loadout.test.ts --reporter=json` reporting 0 skipped (main 2026-10-31: 0.84.2; 18 of 18 skipped)
- [ ] CI provisions no second Pi, and no test, script, workflow or doc names 0.84.2 or 1.2.0 as a host — verified by `git grep -nE '0\.84\.2|1\.2\.0' -- tests scripts .github AGENTS.md README.md docs` returning nothing (main 2026-10-31: 57 lines) and no `PI_COMPAT_HOST` step in `.github/workflows/pi-compatibility.yml`
- [ ] Trying a newer Pi takes one environment variable, and moving the lock edits no test: `PI_COMPAT_HOST=<install>` runs the host tests against that install, and an unset one selects the locked host — verified by `tests/pi-compat-host-selection.test.ts` and `git grep -nF '1.4.0' -- tests scripts .github` returning nothing
- [ ] `read`, `edit`, `write` and `bash` request `strict: "prefer"` constrained sampling as the built-ins they replace do; `read`, `write` and `bash` pass the host's strict conversion, and a call sending `null` for every optional field runs as if those fields were omitted — verified by a new `tests/constrained-sampling.test.ts` (the host's `makeStrictJsonSchema` on the registered definitions) and `tests/pi-host-null-pipeline.test.ts`
- [ ] A finished bash row shows `Took <duration>` from the host's recorded `durationMs`, as the built-in bash row does — verified by `tests/bash-renderer-wrapper.test.ts`
- [ ] 0.18.0 is released: the version is bumped, the CHANGELOG names Pi 1.4.0 as the tested host, and the `pi-compatibility` workflow passes on the release commit — verified by that workflow run and `tests/package-version.test.ts`

## Now
Active: slice 4 (Constrained sampling on replaced built-ins), branch `pi-1-4-host/04-constrained-sampling`, nothing awaiting; next action: build it. Slice 5 (Bash rows show duration) is unblocked too.

## Seams
- `scripts/pi-compat-host.mjs`: host selection and expected version → `tests/pi-compat-host-selection.test.ts`, `tests/pi-host-codemode-host-selection.test.ts`
- Selected-host harnesses `tests/helpers/selected-host-codemode.mjs`, `tests/helpers/pi-host-dist-harness.ts`, `tests/helpers/codemode-recipes.ts` → the `tests/pi-host-*.test.ts` files
- `package.json` devDependencies and `package-lock.json` → `npm ls @earendil-works/pi-coding-agent`
- `.github/workflows/pi-compatibility.yml` → its run on the slice's PR
- Tool definitions captured from `pi.registerTool`, checked by the host's `makeStrictJsonSchema` from `@earendil-works/pi-ai` → `tests/constrained-sampling.test.ts` (new)
- `withRawArgumentGuard`'s `prepareArguments` in `src/raw-argument-guard.ts`, through the host's real validation pipeline → `tests/pi-host-null-pipeline.test.ts`
- `registerBashRendererTool`'s `renderResult` in `src/bash-renderer.ts` → `tests/bash-renderer-wrapper.test.ts`
- Real artifact: Pi 1.4.0's `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p "<prompt>"`, observed in the `tool_execution_end` events

## Slices
1. **Host version in one place** — delivers every test, helper and the CI workflow taking the compatibility host's expected version from `scripts/pi-compat-host.mjs`, with no behavior change (a prefactor) · proof: the Pi 1.2.0 lane passes unchanged when run locally by the AGENTS.md recipe; `git grep -nF '1.2.0' -- tests scripts .github` finds only the constant · blocked-by — · status done
   Tests, helpers, guard messages and the CI pins read `PI_COMPAT_VERSION` (typed by a new `scripts/pi-compat-host.d.mts`) · deviation: the CI temp path became version-neutral (`pi-compat-host`) instead of derived · Pi 1.2.0 lane 30 files / 71 tests passed and `typecheck:pi-host` exit 0 on main and branch; `git grep` finds only the constant; constant set to 9.9.9 turns 8 lane tests red; `npm test` 2594 passed, 65 skipped; typecheck exit 0 · `8018d974`
2. **Locked host moves to Pi 1.4.0** — delivers devDependencies and the lockfile at Pi 1.4.0, the constant at 1.4.0, the 0.84-only code removed (`tests/pi-084-package-contract.test.ts`, the 0.84.2 branch of `tests/pi-host-null-pipeline.test.ts`, the pre-0.99 notes in `src/codemode-integration.ts`), and the codemode host tests running under plain `npm test` · proof: the first done-when command goes red→green; `npm test && npm run typecheck`; a live drive in a fresh Pi 1.4.0 session · blocked-by 1 · status done
   devDependencies and lockfile at exactly Pi 1.4.0 (TypeBox 1.3.27, one Pi graph), `PI_COMPAT_VERSION` 1.4.0, the 0.84 package contract test, legacy loop adapter and pre-0.99 notes gone; the TypeBox baseline test reads the locked Pi's own pin; `tests/edit-batch-execution-order.test.ts` ends its turn by 1.4.0's `finishTurn` (it hung on the ignored `shouldStopAfterTurn`) · deviation: AGENTS.md and README.md had every host version fact, not just two lines, moved to 1.4.0 after review found the documented recipe installing a host the guard rejects · done-when 1 command red on main (0.84.2, 18 of 18 skipped) → green (1.4.0, 18 of 18 passed); `npm test` 2655 passed, 0 failed, 3 skipped (main: 65 skipped); typecheck exit 0; independent lane at 1.4.0 30 files / 71 tests passed, `typecheck:pi-host` 0 diagnostics; live drive `read` returned `1:1df|export function alpha() {` · `2d5bc919`
3. **One host lane** — delivers CI without the separately installed Pi, `PI_COMPAT_HOST` as an optional override whose expected version comes from the selected install, and AGENTS.md, README.md and `docs/` describing one lane · proof: the second and third done-when commands go red→green; selection cases for an unset, a valid and a missing override; a local run with `PI_COMPAT_HOST` pointed at a temporary Pi 1.4.0 install · blocked-by 2 · status done
   `selectCompatHost` in `scripts/pi-compat-host.mjs` picks the locked host or the override and expects the selected install's own version (`PI_COMPAT_VERSION` gone); CI runs `npm test`/typecheck once with `PI_COMPAT_REQUIRE_NU=1`; the declarations test runs without an override; docs describe one lane; the dist-typing measurement re-run on Pi 1.4.0 (all three typings load) · deviation: `pi-compat-dist-wiring.test.ts` deleted, `docs/nu-deprecation.md`'s reference to slice 2's deleted 0.84 contract test removed, and the declarations test's "no locked declaration" check dropped after review (an explicit locked-host override failed it) · done-when 2 and 3 greps 9→0, 1→0 and the workflow's `PI_COMPAT_HOST` line 1→0; host tests 30 files / 71 passed, 0 skipped on the locked host and on a temporary Pi 1.4.0 override, `typecheck:pi-host` 0 diagnostics with declarations from the override; a missing override fails ENOENT; `npm test` 2655 passed, 1 skipped (`startup-performance-doc`); typecheck exit 0; the PR's workflow green on npm 11 and 12 · `65ba75a2`
4. **Constrained sampling on replaced built-ins** — delivers `constrainedSampling: { type: "json_schema", strict: "prefer" }` on `read`, `edit`, `write` and `bash` · proof: `tests/constrained-sampling.test.ts` red→green; a `tests/pi-host-null-pipeline.test.ts` case with every optional field `null` for `read`, `write` and `bash`; a live drive · blocked-by 2 · status active
   Goal: done-when 4 holds: the four registered definitions carry the built-ins' own `constrainedSampling`; the host's `resolveJsonSchemaStrictSampling` sends `read`, `write` and `bash` strict and `edit` non-strict; an all-optional-null call through the real host pipeline runs as the omitted call. Assumptions: Pi 1.4.0's built-ins set `{ type: "json_schema", strict: "prefer" }` and `wrapToolDefinition` forwards it (measured in its dist); `withRawArgumentGuard` already strips optional nulls, so the pipeline case may be green on main (a pin). Reach: `registerReadTool` (`src/read.ts`), `registerEditTool` (`src/edit.ts`), `registerWriteTool` (`src/write.ts`), `registerBashRendererTool` (`src/bash-renderer.ts`); the `not.toHaveProperty("constrainedSampling")` pins for those four in `tests/null-params-{read,edit,write,bash}.test.ts` and `tests/bash-renderer-output-schema.test.ts`; `tests/constrained-sampling.test.ts` (new); `tests/pi-host-null-pipeline.test.ts`. Proof: both tests run on main first; `npm test && npm run typecheck`; a live drive in a fresh Pi 1.4.0 session with a scratch probe extension logging the `before_provider_request` payload's `tools[].strict`, plus a `read` and an `edit` call succeeding.
5. **Bash rows show duration** — delivers `Took <duration>` on a finished bash row from `context.durationMs`, formatted as the built-in formats it · proof: a `tests/bash-renderer-wrapper.test.ts` case red→green · blocked-by 2 · status next
6. **Release 0.18.0** — delivers the version bump, a dated `[0.18.0]` CHANGELOG naming Pi 1.4.0 as the tested host with bullets for slices 4 (Constrained sampling on replaced built-ins) and 5 (Bash rows show duration), and the `pi-compatibility` workflow green on the release commit · proof: that workflow run; `tests/package-version.test.ts` · blocked-by 3, 4, 5 · gate human · status next

## Not yet specified
- `edit` fails the host's strict conversion ("schema-valued or true additionalProperties", measured 2026-10-31), so it stays non-strict under `"prefer"`. Making it convert would change the audited edit schema in `docs/pi-host-api-audit.md`.
- `grep`, `find`, `ls`, `ast_search` and `nu` also pass strict conversion (measured 2026-10-31). Pi's own `grep`, `find` and `ls` don't request constrained sampling, so this arc leaves them alone.
- Whether the npm 11/12 pack matrix still justifies its CI time once one host lane remains.
- From slice 2: `toScriptJson` in `src/codemode-integration.ts` still returns `any`; with only Pi 1.4.0 supported it could return the host's `JsonValue`.
- From slice 3: `supported` and `it.skipIf(!supported)` in about 25 recipe/store tests (`tests/helpers/codemode-recipes.ts`) can no longer skip on the one host, which ships the codemode executor.

## Out of scope
- Context hygiene through `ContextEditEntry` / `appendContextEdit` (Pi 0.87.0) in place of the `context` handler: a redesign, its own arc
- Codemode `@` constraint tags (Pi 1.2.0) in parameter schemas in place of prose like "Positive int": changes the audited schema contract
- Hosts below Pi 1.4.0 (ruling 0005)
- Removing bundled Nu: gated by `docs/nu-deprecation.md`
- `npm publish`: the owner runs it after slice 6 (Release 0.18.0); 0.17.0 stays unpublished, superseded by 0.18.0

## Decisions
- [0003 Host-provided peers keep "*" ranges](../decisions/0003-host-peers-stay-wildcard.md)
- [0005 One tested host](../decisions/0005-one-tested-host.md)
