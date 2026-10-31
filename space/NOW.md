# Now
- [pi-1-4-host](arcs/pi-1-4-host.md) (Pi 1.4.0 is the one tested host): one locked Pi 1.4.0 host, built-in parity, 0.18.0

## Next
- 274, code-graph tools slow and indexing gitignored tmp/: the defect is in pi-codegraph, not here (.megapowers/plans/274-code-graph-tools-20s-per-call-and-index-/diagnosis.md); fix it there, with at most a tmp/ index workaround here
- Freshness event ids: `src/read-freshness.ts` anticipates its event id (`currentEventCount() + 1`) and exempts an own mark at an equal id; tag recorded mutations with their source instead, which also settles whether out-of-order parallel read batches break the anticipation
- Classifier gaps: a `sudo`/`env`/`command`/`exec`/`xargs` prefix hides the mutating command; the parser's known misses sit in the `shortcut:` at `src/bash-command-state.ts:131`; when a miss turns up in use, swap in a real bash grammar (no bash wasm ships today)
- Own-edit gaps: an own `write` shifting lines by more than 20 refuses pre-write anchors instead of remapping them; a cross-file `move_lines` source's earlier read is never marked stale
- Live drives: the model twice refused or dropped the bash a drive asked for; a model-free drive replaying fixed tool calls through the real host would make the Prove step deterministic
- For jidoka's `shape`/`slice` skills: run each planned proof on main and see it red before building; two proofs of the anchor-freshness (Anchor freshness matches what the model sees) arc were already green on main
- Accepted, kept for reference: full-suite load flakes (not root-caused); a batch with `edit` or `write` loses parallelism (per-file ordering out of scope); Pi 1.2.0 scheduling read, not executed; the parser's round-3 fixes went unreviewed; no own mark on a move source (measured unneeded); a nested edit's stale candidate expires at the next `context`, not at a same-turn bash result; no git tag; `docs/context-hygiene.md` line 65 is accurate as written

## Later
- Detect changes another process makes outside any tool call (a hash re-check at `context`); today the per-line edit hashes refuse any changed line, and a re-read on every editor save would cost tokens
- Adopt later Pi APIs: context hygiene through Pi 0.87's `ContextEditEntry` in place of the `context` handler; codemode `@` constraint tags (Pi 1.2.0) in parameter schemas in place of prose like "Positive int"
