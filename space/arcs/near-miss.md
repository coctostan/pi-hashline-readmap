---
status: active
---
# Near-miss calls recover in one step

When an agent calls these tools slightly wrong, it gets an error and tries again, sometimes after reading the file a second time. Fourteen days of the owner's sessions show three such slips still happening on today's code. This arc makes each one either work or tell the agent exactly what to send next, and never lets an edit land on a line the agent didn't mean.

## Destination
On the locked Pi 1.5.2 host, an `edit` whose `edits` arrives as a JSON string applies, an anchor of digits alone is refused with that line's current `LINE:HASH|text`, and a ripgrep regex error points at `literal: true`; no safety refusal loosens; 0.27.0 ships it.

## Done when
- [ ] An `edit` anchor of digits alone, with or without a trailing colon (`"49"`, `"123"`, `"37:"`), in any anchor field (`anchor`, `start_anchor`, `end_anchor`, `after_anchor`), writes nothing and returns an error showing that line's current `LINE:HASH|text`, or saying the line doesn't exist; an all-digit anchor never resolves as a hash — verified by `tests/edit-digit-anchor.test.ts` (new) (main 2026-11-12, a throwaway probe: `"49"` and `"37:"` fail with `Invalid line reference` and no row; `parseLineRef("123")` returns `{"line":0,"hash":"123"}`, and `"348"` resolved by hash, refused only because 2 lines carried it)
- [ ] Through Pi 1.5.2's real `runToolCall` pipeline, which codemode's nested calls also take, an `edit` whose `edits` is a string holding a JSON array of edits writes what the array would; a string that is not a JSON array fails Pi's validation as it does today — verified by `tests/pi-host-string-edits.test.ts` (new) (main: 8 session errors in 14 days, 5 on 2026-11-11, `edits.0: expected object, got string`)
- [ ] A `grep` whose pattern ripgrep cannot parse fails with ripgrep's error text whole, followed by a hint naming `literal: true`; a pattern containing `(?=`, `(?!`, `(?<=` or `(?<!` also gets told ripgrep has no look-around — verified by `tests/grep-regex-error-hint.test.ts` (new), through Pi's built-in grep and the real `rg` (main: 7 session errors in 14 days, ripgrep's text alone)
- [ ] Nothing else changes: `npm test && npm run typecheck && npm run typecheck:pi-host` pass with no existing assertion edited beyond those a slice's plan names — verified by that command
- [ ] 0.27.0 carries it: `package.json` reads 0.27.0 with a dated `[0.27.0]` CHANGELOG entry naming the three changes, and the `pi-compatibility` workflow passes on the release's merge commit, verified on the release, outside the code — verified by `tests/package-version.test.ts`, `tests/package-changelog.test.ts` and that workflow run

## Now
slice 1 (Digit-only anchors name their line) is next, not started. Next action: `slice` in a fresh session.

## Design
- **Chosen:** each recovery sits in the module that owns its knowledge. `normalizeToolParameters` (`src/normalize-tool-params.ts`), already the one place argument slips such as `"null"` are undone, turns a string into the array its schema asks for when the string parses to a JSON array; only `edit.edits` is array-typed today. `parseLineRef` (`src/hashline.ts`) reads digits alone as a line number missing its hash, and `createAnchorResolver`, which holds the file lines, words the refusal with that line's row. `src/grep.ts`'s wrapper appends the hint to the built-in grep's rejection.
- **Other:** one near-miss module, `src/near-miss.ts`, holding all three recoveries, called from the raw-argument guard before execution and from each tool's error path after it.
- **Simpler by reader load:** the chosen one. The other splits by when a slip is caught rather than by what it is about (temporal decomposition), and needs file lines and ripgrep errors passed into it; the chosen one leaves each fix where a reader of anchors, arguments or grep already looks.

## Seams
- `normalizeToolParameters` (`src/normalize-tool-params.ts`) → `tests/normalize-tool-params-recursive.test.ts`; the real host pipeline → `tests/pi-host-string-edits.test.ts` (new), driving `runToolCall` from the selected host's agent-core as `tests/pi-host-null-pipeline.test.ts` does
- `parseLineRef` and `applyHashlineEdits` (`src/hashline.ts`), through the `edit` tool → `tests/edit-digit-anchor.test.ts` (new)
- The `grep` tool's execute (`src/grep.ts`), over Pi's `createGrepTool` and the real `rg` → `tests/grep-regex-error-hint.test.ts` (new)
- Release → `tests/package-version.test.ts`, `tests/package-changelog.test.ts`, the `pi-compatibility` workflow
- Real artifact: `pi --no-extensions --no-session -e <repo>/index.ts --mode json -p`, by `AGENTS.md` § Prove, reading `tool_execution_end` events

## Slices
1. **Digit-only anchors name their line** — delivers `parseLineRef` reading `"49"`, `"123"` and `"37:"` as a line missing its hash, and the resolver's refusal showing that line's `LINE:HASH|text`; its reach is `git grep -n -E "no line number|without (a |its )?line number|HASH\|content|Invalid line reference" -- src prompts docs tests README.md`, each hit listed or excluded by name · proof: `tests/edit-digit-anchor.test.ts` red on main, green after; a live drive by `AGENTS.md` § Prove asking for an `edit` at anchor `"2"` of a 3-line scratch file, its `tool_execution_end` showing the row · blocked-by — · status next
2. **Stringified edits parse into an array** — delivers `normalizeToolParameters` turning a string into the array an array-typed field asks for when it parses to a JSON array; its reach is `git grep -n -E "normalizeToolParameters|expected object, got string" -- src prompts docs tests` · proof: the unit case in `tests/normalize-tool-params-recursive.test.ts` and `tests/pi-host-string-edits.test.ts` red on main, green after · blocked-by — · status next
3. **Regex errors point at literal mode** — delivers the hint `src/grep.ts` appends to a ripgrep regex parse error, naming look-around when the pattern uses it; its reach is `git grep -n -E "regex parse error|literal" -- src/grep.ts prompts/grep.md docs tests` · proof: `tests/grep-regex-error-hint.test.ts` red on main, green after; a live drive asking for a look-ahead `grep`, its `tool_execution_end` showing the hint · blocked-by — · status next
4. **Release 0.27.0** — delivers the version bump and a dated `[0.27.0]` CHANGELOG entry naming the three changes; `npm publish` stays the owner's · proof: `tests/package-version.test.ts`, `tests/package-changelog.test.ts`; the `pi-compatibility` workflow on the merge commit · blocked-by 1, 2, 3 · status next

## Not yet specified
- Whether to remove line-free anchor resolution (`HASH`, `HASH|content`, `src/hashline.ts:626`): in 2,722 session files it never landed an edit and no model sent a bare hash, but refusals of the `HASH|content` form were not counted

## Out of scope
- Malformed tool-call JSON (52 `edit` errors in 14 days, all Claude Opus 5.5): pi-ai's parse fails first and leaves the arguments `{}`, so the extension's `prepareArguments` never sees the text, and validation then throws on `argumentsError` (`pi-ai/dist/utils/json-parse.js:104`, `pi-agent-core/dist/agent-loop.js:478`, `pi-ai/dist/utils/validation.js:50`); routed to `NOW.md` § Next for the owner to report upstream
- The `charOffset`-past-end message, the numeric and enum schema cleanup (left in `NOW.md` § Next's Pi 1.5 host follow-ups), and a GPT or GLM probe for their own slips

## Decisions
