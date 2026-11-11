---
status: active
---
# Codemode scripts know what read returns

A codemode script calls our tools as functions, and Pi tells the model what each call returns: "resolves to `{ text, path, … }`". For `read`, the tool models call most, it only says "a value; ask `describeTool`", so models guess, treat the result as a string, and parse anchored text by hand. This arc makes Pi list `read`'s fields like it does for every other tool, and pins that every tool keeps listing them.

## Destination
On the locked Pi 1.5.2 host, `read`'s `Codemode:` line in its tool description names each result variant's fields, a selected-host test pins a field-listing line for every Hashline tool with an output schema, and a fresh model writes a `read` script that returns a line's text on the first try.

## Done when
- [ ] On the locked host, `read`'s `Codemode:` line reads `{ text, path, range, lines, continuation, warnings } | { text, type: "image", data, mimeType, note } | { text, path, ambiguity } | { text, kind: "notice", warnings } | { text, tool, ok: false, error }`, and none of the 8 Hashline tools with an output schema (`read`, `edit`, `grep`, `ast_search`, `write`, `ls`, `find`, `bash`) gets the `describeTool` pointer — verified by a new `tests/pi-host-codemode-descriptions.test.ts` (main 2026-11-11, a throwaway probe loading `index.ts` through the host's real loader and the codemode tool's `prepareLoadout`: `read` → ``a value; `await describeTool("read")` shows its type``, the other 7 list fields)
- [ ] The values scripts receive are unchanged: the existing codemode and recipe tests pass with no assertion edited — verified by `npm test && npm run typecheck` (`tests/pi-host-codemode*.test.ts`, `tests/pi-host-recipe-*.test.ts` among them)
- [ ] In a fresh drive, `pi --no-extensions -e builtin:codemode -e <repo>/index.ts --tools +codemode --no-session --model openai-codex/gpt-6-luna --mode json -p "Use one codemode script: call tools.read on notes.txt and return the anchor-free text of line 2 (just the word). Call no other tool outside that script."` over a `notes.txt` of `alpha`/`beta`/`gamma`, the `codemode` call's `tool_execution_end` output is exactly `beta`, and its script calls no `describeTool` — verified by live observation + date, not a check script: jidoka's runner starts `pi` without `--no-extensions` and takes no pi arguments per cell, so a cell would load the owner's global extensions and measure `pi-prompt-assembler`'s override (Out of scope) instead of this checkout (main 2026-11-11: the script guarded `typeof result === "string"`, regex-parsed `result.text`, and output `2:589|beta`)
- [ ] Docs no longer say `read`'s union needs `describeTool`: `docs/structured-output.md:125`'s "Compact output unions remain discoverable through `describeTool`" names the field-listing line instead — verified by `git grep -n "remain discoverable through" -- docs` (main 2026-11-11: one hit, line 125; no `tests/documentation-*.test.ts` pins the phrase)

## Now
slice 1 (Read's result union is flat) is next: `slice` plans it and cuts its branch.

## Seams
- `HASHLINE_SUCCESS_OUTPUT_SCHEMAS` and the failure wrap at `src/codemode-integration.ts:157` → the host's `describeOutput` through `createCodemodeToolDefinition(...).prepareLoadout`, loaded from the selected host as `tests/helpers/selected-host-codemode.mjs` does → `tests/pi-host-codemode-descriptions.test.ts` (new)
- Script-facing values → the existing `tests/pi-host-codemode*.test.ts` and `tests/pi-host-recipe-*.test.ts`
- `docs/structured-output.md` → its phrase pins in `tests/documentation-*.test.ts`, if any name the changed line
- Real artifact: the installed `pi` (1.5.2) with `--no-extensions -e builtin:codemode -e <repo>/index.ts --tools +codemode`, observed in the `codemode` call's `tool_execution_start` script and `tool_execution_end` output

## Slices
1. **Read's result union is flat** — delivers `read`'s output schema as one top-level union of its 4 success variants plus the failure value, so the host lists each variant's fields; `tests/pi-host-codemode-descriptions.test.ts` pinning every Hashline tool's `Codemode:` line on the selected host; `docs/structured-output.md:125` reworded · proof: the new test red on main for `read` alone, green after; `npm test && npm run typecheck` with no existing assertion edited · blocked-by — · status next
2. **Scripts read line text first try** — delivers the done-when drive green on gpt-6-luna; if the model still misreads `lines` (the host lists `lines` but not its items' `line`, `anchor`, `raw`), `read`'s description names `lines[i].raw` as a line's text, and the drive runs again · proof: the drive's `codemode` output exactly `beta` with no `describeTool` call, run on main first (red: `2:589|beta`) · blocked-by 1 · status next

## Not yet specified
- Whether the host's field list, which does not open arrays, is enough for `lines[i].raw`; slice 2 (Scripts read line text first try)'s drive settles it

## Out of scope
- `pi-prompt-assembler` replacing the provider descriptions of `bash`, `read`, `edit` and `grep` (`DEFAULT_PROVIDER_DESCRIPTION_OVERRIDES`, its `extensions/prompt-assembler/registry.ts:44`), which drops the host's `Codemode:` line for those four in the owner's sessions; routed to NOW.md, to shape in that repo
- A release: the fix ships in the next release the owner publishes

## Decisions
- none yet
