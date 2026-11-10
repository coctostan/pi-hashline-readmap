---
status: active
---
# Calls land the first time

Models still lose calls to a few snags in these tools. GLM users' `read` calls, as GitHub issue #290 captured them, fail because they send a line number beside a symbol name. Reading a range of long lines shows only the first 500 characters of each, and getting the rest takes one call per line. `find` prints file paths that only work from the folder it searched. And `edit` keeps an old unused alias that can swallow text. This arc fixes all four and ships them as one release.

## Destination
#290's captured `read` call works as sent; `charLimit` caps every line of a range read; `find` names files from the cwd; `insert_after` takes no `text`; shipped as 0.24.0.

## Done when
- [ ] #290's captured `read` call succeeds as sent: through the locked host's real loader and `runToolCall`, `{ bundle: "null", charLimit: "null", charOffset: "null", errorMode: "throw", limit: "260", map: true, offset: "1", path, strictSymbol: false, symbol }` returns the symbol's lines without error, its text led by a warning that names the ignored `offset`; `read` with `symbol` and any `offset` does the same — verified by `tests/pi-host-null-pipeline.test.ts` (main 2026-11-09, measured: `symbol` with `offset: "1"`, `limit: "260"` → `Cannot combine symbol with offset`, `src/read.ts:386`)
- [ ] `charLimit` without `charOffset` caps each line of the range a read covers, `symbol` reads included: a line longer than N (default 500, max 10,000) ends in a marker naming both `read({offset:L, charOffset:K})` and the range form with `charLimit`; `charOffset` still selects a one-line window; the 50 KB / 2,000-line output budget still bounds the result — verified by a new `tests/read-line-cap.test.ts` (main 2026-11-09, measured: `read({ path, charLimit: 2000 })` → `charOffset/charLimit require a positive offset selecting exactly one line`)
- [ ] `find` names each entry by its path from the cwd, whatever its `path` argument: `path: "pkg"` names `pkg/sub/view.ts` in the text and in `entries[].path`, an entry outside the cwd keeps its absolute path, and `prompts/find.md` and `docs/codemode-recipes.md` say so — verified by a new `tests/find-cwd-paths.test.ts` and the recipe tests (main 2026-11-09, measured: text `sub/view.ts`, `entries[].path` `sub/view.ts`)
- [ ] `insert_after` has no `text` field: the `edit` schema lacks it, and `{ insert_after: { anchor, new_text: "", text: "x" } }` inserts one blank line — verified by `tests/edit-insert-blank-line.test.ts` (main 2026-11-09, measured: inserts `x`, from `new_text || text` at `src/hashline.ts:451`)
- [ ] 0.24.0 is released: the version is 0.24.0, and its `[0.24.0]` CHANGELOG entry has a Fixed bullet naming #290 and entries for the line cap, `find`'s paths and the removed `text` — verified by `tests/package-version.test.ts`, `tests/package-changelog.test.ts` and the `pi-compatibility` workflow on the release commit (main 2026-11-09: 0.23.0)

## Now
Active: slice 1 (Symbol wins over offset), branch `first-call/01-symbol-wins-over-offset`; next action: build.

## Seams
- `read`'s argument combos in its `execute` (`src/read.ts` lines 358–415), warnings rendered ahead of the text by `buildReadOutput` (`src/read-output.ts:196`) → `tests/pi-host-null-pipeline.test.ts`, `tests/read-window-combos.test.ts`, `tests/tool-parameter-metadata-read.test.ts`
- `read`'s window parameters `parseWindowParams` (`src/read-window.ts:77`), the per-line display cap `truncateDisplayLine` and `renderPtcLines` (`src/ptc-value.ts:89`), the source budget `buildReadSourceOutput` (`src/read-output.ts:85`), and the rehydrate descriptor (`src/context-hygiene.ts:253`) → `tests/read-line-cap.test.ts` (new), `tests/read-window-*.test.ts`, `tests/context-hygiene-rehydrate-read-window.test.ts`
- `find`'s entries, built root-relative in `src/find.ts` (line 121 and the fd/rg parsers at lines 198–273), printed by `formatOutput` → `tests/find-cwd-paths.test.ts` (new), `tests/find*.test.ts`, the recipe tests over `docs/codemode-recipes.md`
- `edit`'s `insert_after` schema (`src/edit.ts:94`) and parse (`src/hashline.ts:451`) → `tests/edit-insert-blank-line.test.ts`, the `edit` schema tests
- The version and CHANGELOG → `tests/package-version.test.ts`, `tests/package-content.test.ts`, `tests/package-changelog.test.ts`
- The real artifact: a live drive by AGENTS.md's Prove

## Slices
1. **Symbol wins over offset** — delivers `read` with `symbol` and an `offset` ignoring the `offset` and returning the symbol, with a warning naming the ignored value (`limit` still caps the symbol); `prompts/read.md`'s "`offset` cannot combine with `symbol`" follows; other combo errors unchanged · proof: the #290 case in `tests/pi-host-null-pipeline.test.ts` sent verbatim, red→green; a live drive · blocked-by — · status active
   Goal: done-when 1 holds through the locked host's real loader and `runToolCall`.
   Assumptions: the existing `paramAdjustments` notice (`withParamAdjustments`, `src/read.ts:70`) is the warning, as `ignored offset N with symbol`, leading the text and in `ptcValue.warnings` as `params-adjusted`; an invalid `offset` (negative, non-numeric) still fails as a bad value, since it fails before the combo check; `charOffset`/`charLimit` beside `symbol` still fails (slice 2 (Line cap spans the range) changes it); `symbol@line` selectors are unchanged.
   Reach: the symbol+offset branch in `read`'s `execute` (`src/read.ts:386`) and the `offset` description (`src/read.ts:110`–112); `tests/pi-host-null-pipeline.test.ts` (#290's call verbatim); `tests/tool-parameter-metadata-read.test.ts` (lines 11–12, 23); `tests/helpers/tool-contract-pins.ts` (lines 3, 39–40, 51); `tests/pi-host-recipe-discovery.test.ts:40`; `tests/fixtures/tool-selection-evaluation.json`'s `read-symbol-offset`; `prompts/read.md` (lines 7, 15); `README.md:95`; `docs/tool-metadata.md:15`; `docs/structured-output.md:152`.
   Proof: the #290 case red on main, green after; `npm test && npm run typecheck`; a live drive whose `read` sends `symbol` with an `offset` and returns the symbol led by the notice.
2. **Line cap spans the range** — delivers `charLimit` without `charOffset` as a per-line cap over the range read, `symbol` reads included, through the rehydrate descriptor; the truncation marker names the range form; `prompts/read.md` says so · proof: `tests/read-line-cap.test.ts` red→green, the `tests/read-window-*.test.ts` pins that change named; a live drive reading a file of long lines · blocked-by 1 · status next
3. **Find names files from the cwd** — delivers `find`'s text and `entries[].path` naming each entry from the cwd, or by its absolute path outside it; `prompts/find.md` and `docs/codemode-recipes.md` follow · proof: `tests/find-cwd-paths.test.ts` red→green, the recipe tests green; a live drive running `find` with a `path` · blocked-by — · status next
4. **Insert takes no text alias** — delivers `insert_after` without `text`, in the schema and in `parseHashlineEditItem`, and the stale comment at `src/hashline.ts:450` · proof: a `tests/edit-insert-blank-line.test.ts` case red→green, a schema case · blocked-by — · status next
5. **Release 0.24.0** — delivers the version bump and a dated `[0.24.0]` CHANGELOG entry: Fixed for #290's call, Changed for the line cap and `find`'s paths, Removed for `text` (a PR body that says `Refs #290`, not `Fixes`) · proof: `tests/package-version.test.ts`, `tests/package-changelog.test.ts`; the `pi-compatibility` workflow on the merge commit · blocked-by 1, 2, 3, 4 · status next

## Not yet specified
- Whether other strict-sampling fills hit other combo errors (`charOffset` beside `symbol`, `bundle` without `symbol`); act if a miss turns up in use.

## Out of scope
- `ls`'s basenames, a one-directory listing by its documented contract (`prompts/ls.md:17`); `ast_search`, which already prints `path.relative(ctx.cwd, abs)` (`src/sg.ts:377`), `../` outside the cwd.
- Publishing 0.20.0 through 0.24.0 to npm, and replying on or closing #290: the owner's.
- `scripts/bench/confusion.mjs:62` and `docs/tool-cost.md`'s first-touch rule crediting paths relative to a search's `path`.
- The rest of NOW.md's Next.

## Decisions
- Owner, 2026-11-09 (chat): one arc for the tool-friction (Models stop tripping on the tools) leftovers and #290's remaining clash; `symbol` wins over any `offset`, with a warning; `charLimit` without `charOffset` caps every line of the range read, `symbol` reads included, so `read({offset, charLimit})` without `limit` reads from `offset` on; `find` names entries from the cwd in text and `entries[].path`, `ls` and `ast_search` unchanged; cut `insert_after.text`, with a Removed bullet; one 0.24.0 release whose Fixed bullet names #290.
