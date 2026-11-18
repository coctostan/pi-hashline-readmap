---
status: active
---
# Read and edit are measured against the alternatives

This extension replaces Pi's own tools for reading and editing files with versions that mark each line, so an edit can point at the exact line it changes. Nobody has measured whether that helps AI models. This arc measures it: our tools against Pi's own, a mix of the two, and plain shell commands. It reports the results for the owner to decide on; it makes no decision itself.

## Destination
A recorded A/B run of `scripts/bench/tool-ab.mjs` over six arms, which vary only Hashline's `read`, `edit` and `write` against Pi's built-ins and bash, on the Explicit Edit and locate tasks, on gpt-6-luna and Claude Sonnet 5.5. Its numbers and blind trace notes go in `docs/tool-cost.md`, for the owner to rule on later.

## Done when
- [ ] `PI_HASHLINE_BUILTIN` leaves Pi's built-ins in place: at the locked host's real `createAgentSession` boundary, `PI_HASHLINE_BUILTIN=edit,write` declares Pi's own `edit` and `write` beside Hashline's `read`, `read` declares Pi's `read` beside Hashline's `edit` and `write`, and unset or empty declares all three as Hashline's; an unknown name is refused at load with an error naming the accepted ones — verified by a new `tests/hashline-builtin-switch.test.ts` (main: `index.ts:153-166` registers all three unconditionally)
- [ ] `tool-ab.mjs` runs the read-and-edit arms: `stock`; `no-ls-find` (Hashline as configured); `pi-edit` (Hashline `read`, Pi `edit`/`write`); `pi-read` (Pi `read`, Hashline `edit`/`write`); `pi-read-edit` (Pi's three, the rest of Hashline loaded); `bash-read-edit` (Hashline loaded, `read`, `edit` and `write` excluded). Each run's system message declares exactly its arm's tools, and `extension` declares the pilot's set again (`ls` and `find` active) — verified by `tests/bench-tool-ab.test.ts` and a one-task live drive over all six on gpt-6-luna, its traces' tool sets read (main: four arms, `extension` declaring what `no-ls-find` does)
- [ ] The summary breaks down edit failures: per model and arm, the mean and spread of edit calls refused by class (stale or unknown anchor, text not found or not unique, rejected arguments, other), calls per landed edit, and `read` calls before a file's first edit, scored the same way for Pi's `edit` and Hashline's — verified by `tests/bench-confusion.test.ts` and `tests/bench-tool-ab.test.ts` on fixture traces of both tools with known counts (main: errors by tool only)
- [ ] The run is recorded, outside the code: six arms × 31 tasks (the 10 locate tasks and the Explicit Edit sample of one per family, 21) × 2 models × 2 repeats, at most $20 by its `run.json`. `docs/tool-cost.md` holds a section with the command, host, commit, the per-model, per-arm means and spreads of pass rate, input and output tokens, cost, wall time, calls before the first touch, errors by tool and the edit-failure breakdown, and the blind review notes of 5 traces per arm. The artifacts are in `docs/tool-ab-read-edit/`, and `NOW.md` § Next points the owner at the section for a decision — verified by that `run.json` and live observation of the section, dated
- [ ] The npm tarball ships no bench artifacts: `npm pack --dry-run --ignore-scripts` lists no file under `docs/tool-ab-*/` — verified by `tests/package-tarball-dist.test.ts` (main: `docs/tool-ab-pilot/` and `docs/tool-ab-fifth-arm/`, 284 KB on disk, packed)
- [ ] Nothing else changes: `npm test && npm run typecheck && npm run typecheck:pi-host` pass with no existing assertion edited beyond those a slice's plan names — verified by that command

## Now
Active: slice 1 (Tarball leaves bench artifacts out), branch `read-edit-ab/01-tarball-no-bench`; next: build it.

## Design
- **Chosen:** `PI_HASHLINE_BUILTIN`, read once in `src/hashline-settings.ts`, makes `index.ts` skip registering the named ones of `read`, `edit` and `write`, so Pi's built-in of that name stays. Each arm in `tool-ab.mjs`'s `ARMS` table names its `exclude`, its `tools` and its `env`, which `runPi` passes to the child. The edit-failure classes are scored in `confusion.mjs`'s `scoreSession`, beside its existing signals.
- **Other:** a bench-only wrapper extension, `scripts/bench/builtin-arm.ts`, that loads `index.ts` with a proxied `ExtensionAPI` whose `registerTool` drops the named tools, so shipped code holds no switch.
- **Simpler by reader load:** the chosen one. The switch is three guarded calls a reader of `index.ts` sees where the tools register. The proxy hides a filter in a file `index.ts` never names, sits outside `withCodemodeIntegration(withRawArgumentGuard(pi))`, so a reader must check that the wrappers still see every call, and adds a layer the arms' table can't show. The owner chose the switch, kept after the run so a later host can rerun it (2026-11-18, chat).

## Seams
- The switch: `PI_HASHLINE_BUILTIN` in `src/hashline-settings.ts` → `tests/hashline-settings.test.ts`; registration in `index.ts` at the locked host's `createAgentSession` boundary → `tests/hashline-builtin-switch.test.ts` (new)
- `ARMS`, `planJobs` and `formatSummary` in `scripts/bench/tool-ab.mjs` → `tests/bench-tool-ab.test.ts`; `runPi`'s `env` and `tools` in `scripts/bench/lib.mjs` → `tests/bench-lib.test.ts`
- `scoreSession` in `scripts/bench/confusion.mjs` → `tests/bench-confusion.test.ts`, fixtures under `tests/fixtures/bench/`
- `package.json` `files` → `tests/package-tarball-dist.test.ts`
- Real artifact: in a scratch directory, `pi --no-extensions --no-session -e <repo>/index.ts --model openai-codex/gpt-6-luna --mode json -p "<prompt>"` with the arm's env and `--exclude-tools`, observing the system message's tool set and `tool_execution_end` events; the bench run itself, through `tool-ab.mjs`

## Slices
1. **Tarball leaves bench artifacts out** — delivers `package.json` `files` excluding `docs/tool-ab-*/`, with links into them from shipped docs pointing at the repository; its reach is `git grep -n "tool-ab-" -- docs README.md CHANGELOG.md prompts` · proof: the tarball case red on main, green after · blocked-by — · status active
   - Goal: the done-when check "The npm tarball ships no bench artifacts": `npm pack --dry-run --ignore-scripts` lists no file under `docs/tool-ab-*/` (main: 26 files, `docs/tool-ab-pilot/` and `docs/tool-ab-fifth-arm/`).
   - Assumptions: npm honors a `!` entry in `files` (measured 2026-11-18 in a scratch package: `["docs/","!docs/tool-ab-*/"]` drops `docs/tool-ab-x/b.md` and keeps `docs/sub/c.md` on npm 11.20.0 and 12.2.3, CI's two). The artifacts' own links to `../tool-cost.md` stay: they are no longer shipped and still resolve in the repo.
   - Reach (from the shape's `git grep`: hits only in `docs/tool-ab-*/` itself and `docs/tool-cost.md`; none in `README.md`, `CHANGELOG.md`, `prompts/`): `package.json` `files` gains `"!docs/tool-ab-*/"`; `docs/tool-cost.md:137,158,204`'s three links into `tool-ab-fifth-arm/README.md` and `tool-ab-pilot/README.md` become `https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/…/README.md`, as `README.md:33` links `AGENTS.md`; `tests/package-tarball-dist.test.ts` gains a case, and its staging loop skips a `!` entry, which `cpSync` can't copy (no assertion edited); `CHANGELOG.md` `[Unreleased]` gains a `Changed` line.
   - Behaviors, each seen red on main in the new case of `tests/package-tarball-dist.test.ts`, which runs `npm pack --dry-run --ignore-scripts --json` at the repo root: no packed path starts `docs/tool-ab-` (source: the done-when check); `docs/tool-cost.md` is still packed, so the exclusion is not all of `docs/` (source: `README.md` links it); no packed `docs/*.md` holds a relative link `](tool-ab-` (source: the slice's "links … pointing at the repository").
   - Proof: that case red on main, green after; `npm test && npm run typecheck`; the real artifact is the packed file list itself, `npm pack --dry-run --ignore-scripts`, read for `docs/`; no Pi drive, since no tool's behavior changes.
2. **Built-in tools stay on request** — delivers `PI_HASHLINE_BUILTIN` naming any of `read`, `edit`, `write`, whose named tools Hashline leaves unregistered, refusing an unknown name at load; documented in `docs/tool-cost.md` only · proof: `tests/hashline-builtin-switch.test.ts` and the settings cases red on main; a live drive with `PI_HASHLINE_BUILTIN=edit,write` whose `edit` result is Pi's own format · blocked-by — · status next
3. **Arms cover read and edit** — delivers the four new arms in `ARMS`, `runPi` passing an arm's `env` and `tools`, `extension` redefined with `--tools +ls,+find`, and the Explicit Edit sample of one task per family selectable by name · proof: `tests/bench-tool-ab.test.ts` and `tests/bench-lib.test.ts` red first; a one-task live drive over all six arms on gpt-6-luna, each trace's tool set read · blocked-by 2 · status next
4. **Edit failures are classified** — delivers `scoreSession` counting refused edits by class, calls per landed edit and reads before a file's first edit, for Pi's `edit` error texts and Hashline's, and the summary's columns for them · proof: `tests/bench-confusion.test.ts` on fixture traces of both tools with known counts, red first; `tests/bench-tool-ab.test.ts` for the columns · blocked-by — · status next
5. **Read and edit run is recorded** — delivers the run (six arms × 31 tasks × 2 models × 2 repeats, `--max-cost 20`), the blind review of 5 traces per arm, `docs/tool-cost.md`'s section, `docs/tool-ab-read-edit/`, and `NOW.md`'s pointer for the owner · proof: the run's `run.json` at most $20; the section read against `summary.md` · blocked-by 1, 3, 4 · status next

## Not yet specified
- Whether a run with thinking on, or on a model the owner uses day to day (Claude Opus 5.5), follows: the owner's call after reading this one.

## Out of scope
- A ruling, any change to which tools register by default, and a release: the owner decides from the results (2026-11-18, chat).
- Claims about models beyond the two run, or about model quality.
- `scripts/bench/explicit-edit.mjs`'s own arms.

## Decisions
- Ruling 0005 (`space/decisions/0005-one-tested-host.md`): the run uses the locked host, through the bench-host cache.
- Rulings 0008 and 0009 (`space/decisions/0008-ls-find-deferred-grep-kept.md`, `space/decisions/0009-grep-kept-bash-grep-anchors-dropped.md`): their spread rule is how this run's gaps are reported, not a verdict.
