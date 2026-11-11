---
status: active
---
# Pi says when its Hashline code is stale

A pi process keeps the Hashline code it loaded at startup: a new, resumed or forked session reuses it, so edits and updates on disk stay unseen until `/reload` or a restart, and three sessions lost time to an error the code on disk had already removed. This arc makes Hashline warn the person at the keyboard, once per session start, that the code pi is running is older than its files, and corrects the docs that say a new session picks up edits.

## Destination
On the locked Pi 1.5.2 host, a `new`, `resume` or `fork` session start in a pi process whose loaded Hashline files changed on disk shows the user one warning naming `/reload`; the docs say the same; 0.26.0 ships it.

## Done when
- [ ] Source layout: in a running pi loading a checkout's `index.ts`, after a file under its `src/` or `prompts/` changes, a `new_session` draws exactly one `warning` notice naming the changed-file count, the newest file and `/reload`; a `new_session` with nothing changed, and startup, draw none — verified by `tests/pi-host-stale-code.test.ts` (new), driving the selected host's `dist/cli.js --mode rpc` model-free on a temp copy of the checkout (main 2026-11-11: no `session_start` handler, so no notice; a throwaway RPC probe showed one `new_session` delivers `session_start` twice to the same handlers)
- [ ] Bundle layout: in a running pi loading a built `dist/index.js`, a changed `dist/index.js` or `prompts/` file draws the warning at `new_session` and a changed `src/` file draws none — verified by `tests/pi-host-stale-code.test.ts`
- [ ] Only the files the running code came from count, only `new`, `resume` and `fork` check, and a session warns at most once: a changed file under `tests/`, `docs/` or `scripts/` draws no warning, `startup` and `reload` draw none, `resume` and `fork` warn — verified by `tests/stale-code.test.ts` (new)
- [ ] No doc says a new session picks up edits, and each place that tells the user to restart also names `/reload`: `git grep -n -i -E "new (agent |pi )?sessions\*{0,2} pick up|start a new pi session|restart the pi session" -- AGENTS.md README.md docs` prints nothing and `git grep -l "/reload" -- AGENTS.md README.md docs/integrations.md docs/context-hygiene.md` lists all four — verified by those commands (main 2026-11-11: 4 hits, `AGENTS.md:33`, `README.md:19`, `docs/context-hygiene.md:171`, `docs/integrations.md:35`; the second lists none)
- [ ] Nothing else changes: `npm test && npm run typecheck && npm run typecheck:pi-host` pass with no existing assertion edited — verified by that command
- [ ] 0.26.0 carries it: `package.json` reads 0.26.0 with a dated `[0.26.0]` CHANGELOG entry whose Added names the warning — verified by `tests/package-version.test.ts`, `tests/package-changelog.test.ts`

## Now
Slice 1 (Source checkout warns at session start) is next: plan it on a branch `feat/stale-code-warning`.

## Seams
- `src/stale-code.ts` (new): the load stamp, the watched-file set for the module's layout (`index.ts`, `src/**`, `prompts/**`; or `dist/index.js`, `prompts/**`) and the newest-mtime compare, called with an explicit root, entry and load time → `tests/stale-code.test.ts` over temp directories
- `index.ts`'s `session_start` handler, deduplicated by session id → `tests/pi-host-stale-code.test.ts`: the selected host's `dist/cli.js` (`selectCompatHost`, `scripts/pi-compat-host.mjs`) in `--mode rpc` with `PI_CODING_AGENT_DIR` a temp dir, on a temp copy of the checkout with `node_modules` linked, reading `extension_ui_request` `notify` events after `{"type":"new_session"}`
- Docs → the two `git grep` commands in Done when
- Release → `tests/package-version.test.ts`, `tests/package-changelog.test.ts`
- Real artifact: the locked `pi` 1.5.2 CLI in RPC mode, as the host test drives it; no model or credentials

## Slices
1. **Source checkout warns at session start** — delivers `src/stale-code.ts`, the `session_start` handler warning once per session for `new`, `resume` and `fork`, and the RPC host harness, for the source layout · proof: `tests/stale-code.test.ts` and `tests/pi-host-stale-code.test.ts`'s source cases red on main (no notice), green after; `npm test && npm run typecheck && npm run typecheck:pi-host` · blocked-by — · status next
2. **Built bundle warns too** — delivers the `dist/index.js` layout's watched set and its host-test case, building into a temp copy as `tests/helpers/pi-host-dist-harness.ts` does · proof: the bundle case red before, green after · blocked-by 1 · status next
3. **Docs name /reload** — delivers `AGENTS.md:33`, `README.md:19`, `README.md:195`, `docs/integrations.md:35` and `docs/context-hygiene.md:171` saying a running pi keeps its loaded code until `/reload` or a restart, and that Hashline warns when it is stale; its reach is the first Done-when `git grep` plus `git grep -n -i "hot.reload\|restart" -- '*.md' ':!space' ':!CHANGELOG.md'`, each hit listed or excluded by name · proof: the Done-when commands red on main, green after · blocked-by 1 · status next
4. **Release 0.26.0** — delivers the version bump and a dated `[0.26.0]` CHANGELOG entry, Added for the warning, which also takes the 0.25.0 backfill to npm · proof: `tests/package-version.test.ts`, `tests/package-changelog.test.ts`; the `pi-compatibility` workflow on the merge commit · blocked-by 1, 2, 3 · status next

## Not yet specified
- Whether the TUI, like RPC, delivers `session_start` twice per `new_session`; the per-session dedupe covers both, and slice 1 (Source checkout warns at session start) may observe it in a live TUI `/new`
- Whether `pi install`/`pi update` reload a running process themselves, which decides whether npm users ever see the warning

## Out of scope
- Reloading automatically; a notice the model sees; comparing contents rather than modified times (switching branches away and back draws a harmless warning)
- `npm publish`: the owner runs it after slice 4 (Release 0.26.0)

## Decisions
- none yet
