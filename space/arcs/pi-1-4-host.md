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
Active: slice 1 (Host version in one place), branch `pi-1-4-host/01-host-version-one-place`, nothing awaiting; next: build it.

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
1. **Host version in one place** — delivers every test, helper and the CI workflow taking the compatibility host's expected version from `scripts/pi-compat-host.mjs`, with no behavior change (a prefactor) · proof: the Pi 1.2.0 lane passes unchanged when run locally by the AGENTS.md recipe; `git grep -nF '1.2.0' -- tests scripts .github` finds only the constant · blocked-by — · status active
   - Goal: `PI_COMPAT_VERSION` in `scripts/pi-compat-host.mjs` is the only `1.2.0` under `tests scripts .github`; the Pi 1.2.0 lane passes before and after.
   - Assumptions: AGENTS.md, README.md and `docs/` keep their 1.2.0 text (slice 3 (One host lane) rewrites them); tests import the `.mjs` through a `.d.mts` declaration, as `scripts/build.d.mts` does; CI reads the constant with `node`.
   - Reach: `scripts/pi-compat-host.mjs` (error messages from the constant), new `scripts/pi-compat-host.d.mts`; `tests/helpers/pi-host-dist-harness.ts` (re-export, drop its copy); `tests/pi-host-null-pipeline.test.ts` (drop its copy); `tests/pi-compat-host-selection.test.ts`, `tests/pi-host-codemode-host-selection.test.ts`, `tests/pi-host-codemode-benchmark.test.ts`, `tests/pi-host-declarations.test.ts`, `tests/pi-host-recipe-program.test.ts`, `tests/pi-host-codemode-boundaries.test.ts` (literals → constant); `tests/helpers/codemode-recipes.ts` (comment); `.github/workflows/pi-compatibility.yml` (install pins and temp path from the constant).
   - Proof: the AGENTS.md Pi 1.2.0 recipe on main and on the branch, both green; the `git grep`; `npm test && npm run typecheck`; the workflow run on the PR.
2. **Locked host moves to Pi 1.4.0** — delivers devDependencies and the lockfile at Pi 1.4.0, the constant at 1.4.0, the 0.84-only code removed (`tests/pi-084-package-contract.test.ts`, the 0.84.2 branch of `tests/pi-host-null-pipeline.test.ts`, the pre-0.99 notes in `src/codemode-integration.ts`), and the codemode host tests running under plain `npm test` · proof: the first done-when command goes red→green; `npm test && npm run typecheck`; a live drive in a fresh Pi 1.4.0 session · blocked-by 1 · status next
3. **One host lane** — delivers CI without the separately installed Pi, `PI_COMPAT_HOST` as an optional override whose expected version comes from the selected install, and AGENTS.md, README.md and `docs/` describing one lane · proof: the second and third done-when commands go red→green; selection cases for an unset, a valid and a missing override; a local run with `PI_COMPAT_HOST` pointed at a temporary Pi 1.4.0 install · blocked-by 2 · status next
4. **Constrained sampling on replaced built-ins** — delivers `constrainedSampling: { type: "json_schema", strict: "prefer" }` on `read`, `edit`, `write` and `bash` · proof: `tests/constrained-sampling.test.ts` red→green; a `tests/pi-host-null-pipeline.test.ts` case with every optional field `null` for `read`, `write` and `bash`; a live drive · blocked-by 2 · status next
5. **Bash rows show duration** — delivers `Took <duration>` on a finished bash row from `context.durationMs`, formatted as the built-in formats it · proof: a `tests/bash-renderer-wrapper.test.ts` case red→green · blocked-by 2 · status next
6. **Release 0.18.0** — delivers the version bump, a dated `[0.18.0]` CHANGELOG naming Pi 1.4.0 as the tested host with bullets for slices 4 (Constrained sampling on replaced built-ins) and 5 (Bash rows show duration), and the `pi-compatibility` workflow green on the release commit · proof: that workflow run; `tests/package-version.test.ts` · blocked-by 3, 4, 5 · gate human · status next

## Not yet specified
- `edit` fails the host's strict conversion ("schema-valued or true additionalProperties", measured 2026-10-31), so it stays non-strict under `"prefer"`. Making it convert would change the audited edit schema in `docs/pi-host-api-audit.md`.
- `grep`, `find`, `ls`, `ast_search` and `nu` also pass strict conversion (measured 2026-10-31). Pi's own `grep`, `find` and `ls` don't request constrained sampling, so this arc leaves them alone.
- Whether the npm 11/12 pack matrix still justifies its CI time once one host lane remains.

## Out of scope
- Context hygiene through `ContextEditEntry` / `appendContextEdit` (Pi 0.87.0) in place of the `context` handler: a redesign, its own arc
- Codemode `@` constraint tags (Pi 1.2.0) in parameter schemas in place of prose like "Positive int": changes the audited schema contract
- Hosts below Pi 1.4.0 (ruling 0005)
- Removing bundled Nu: gated by `docs/nu-deprecation.md`
- `npm publish`: the owner runs it after slice 6 (Release 0.18.0); 0.17.0 stays unpublished, superseded by 0.18.0

## Decisions
- [0003 Host-provided peers keep "*" ranges](../decisions/0003-host-peers-stay-wildcard.md)
- [0005 One tested host](../decisions/0005-one-tested-host.md)
