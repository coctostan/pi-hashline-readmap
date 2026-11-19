# Tool cost

What each tool this extension registers costs in context, measured for the tools-vs-bash (Each search tool earns its place over bash) arc, which rules whether `find`, `ls` and `grep` earn their place over bash.

[Back to Benchmarking edits](benchmarking.md)

## Declarations

```sh
node scripts/bench/tool-cost.mjs            # table and cross-references
node scripts/bench/tool-cost.mjs --json     # the same as data
```

`--declarations`, the default, loads this checkout's `index.ts` alone into the selected host (`PI_COMPAT_HOST`, else the locked Pi) through `createAgentSession`, in a scratch working directory and agent directory, as `pi --no-extensions -e index.ts` would on a fresh install with no user settings. It sends one prompt to a stub provider and measures what that provider receives: the rendered system prompt and the tool declarations. Every tool the extension registers is activated, so one off by default is measured too; the report's second line names those.

Each tool is charged:

- its declaration: `{name, description, parameters}` as JSON;
- its snippet: the `- name: snippet` line in the system prompt's tool list;
- its guidelines: its `- guideline` lines in the system prompt. A guideline two tools share is rendered once and charged to the first.

The rest of the system prompt (Pi's preamble, its docs paths, the working directory, Pi's own guidelines) is shared.

Bounds:

- Bytes are UTF-8 of the text above. A provider wraps declarations in its own envelope (an OpenAI function object, an Anthropic `input_schema`) and may add strict-mode fields from `constrainedSampling`, which is left out; those bytes are not counted.
- Tokens are characters / 4, as `scripts/benchmark-codemode.mjs` estimates them, not a provider tokenizer. JSON schemas tokenize less efficiently than prose, so the real count for a declaration is likely higher (inferred, unmeasured).
- The shared prompt includes the host's install path and the scratch directory's path, so its size varies by machine; the per-tool figures do not.
- `nu` registers only when the `nu` binary is installed, and `grep`'s `ast_search` guideline changes when `ast-grep` is missing.

### Recorded run, 2026-11-04

Pi 1.5.0, locked on 2026-11-04, Node v26.13.0, macOS, nu 0.116.1 and ast-grep 0.51.0 installed, at `eee27fee` with the script from slice 3 (Declaration cost is measured).

| tool | declaration | snippet | guidelines | bytes | ~tokens |
|---|---:|---:|---:|---:|---:|
| read | 1779 | 103 | 170 | 2052 | 513 |
| bash | 659 | 204 | 210 | 1073 | 268 |
| edit | 3793 | 79 | 169 | 4041 | 1010 |
| write | 573 | 69 | 100 | 742 | 186 |
| grep | 1561 | 68 | 183 | 1812 | 453 |
| ast_search | 726 | 83 | 35 | 844 | 211 |
| nu | 266 | 96 | 88 | 450 | 113 |
| ls | 579 | 70 | 95 | 744 | 186 |
| find | 1402 | 61 | 127 | 1590 | 398 |
| shared system prompt | | | | 1712 | 428 |
| total | | | | 15060 | 3765 |

The three tools under ruling, `grep`, `find` and `ls`, together cost 4146 bytes, about 1037 tokens, 28% of the total bytes. That excludes the text in other tools that names them, below.

Text in one tool naming another, matched as a whole case-sensitive word, a hyphen counting as a word break. Some hits use the name as a plain word ("after write", "edit anchors") or inside another name ("ast-grep", the CLI); the list keeps them for a reader to judge:

| tool | where | names | text |
|---|---|---|---|
| read | guideline | edit | Read files/images, ranges, symbols, edit anchors. |
| bash | description | read, edit, write, grep, ls, find | Run tests, builds, git, package managers, and external CLIs; do not use for repo file reading/searching/listing/editing (use read, grep, find, ls, edit, or write). Scripts receive native raw output, exit_code, and native truncation/full_output_path; the model reads Pi's output with ANSI codes stripped plus any hint. Nonzero exits remain native values on structured-output hosts. |
| bash | `$.properties.command` | read, edit | Test/build/git/pkg/external command; not repo file read/search/list/edit. |
| bash | snippet | read, edit, write, grep, ls, find | Bash only for tests/builds/git/pkg/external CLIs. Don't use cat/head/tail, grep/rg, find/ls/tree, sed/awk/perl/python rewrites, or > heredocs/tee for repo files; use read/grep/find/ls/edit/write. |
| bash | guideline | grep, ls, find | Do not use bash cat/head/tail/grep/rg/find/ls/tree/sed/awk for repo files. |
| bash | guideline | read, edit, write, grep, ls, find | Use read/grep/find/ls/edit/write for repo file operations. |
| edit | `$.properties.postEditVerify` | write | Verify persisted content after write |
| edit | snippet | read, write, grep, ast_search | Edit files using hash-verified anchors from read/grep/ast_search/write |
| write | snippet | edit | Create or overwrite a complete file and return edit anchors |
| write | guideline | edit | Use edit, not write, for small changes. |
| grep | `$.properties.summary` | edit | Per-file counts only; no edit anchors |
| grep | snippet | edit | Search file contents and return edit-ready hashline anchors |
| grep | guideline | edit | Grep text for edit-ready anchors. |
| grep | guideline | ast_search | Use grep summary for counts; use ast_search for structural code patterns. |
| ast_search | description | grep | ast-grep search; return anchors. |
| ast_search | `$.properties.pattern` | grep | ast-grep structural pattern |
| ast_search | snippet | edit, grep | Search code structurally with ast-grep and return edit-ready anchors |
| nu | guideline | read, bash, grep, ast_search, ls, find | Deprecated nu: prefer read/grep/ast_search, find/ls, and codemode; use bash for CLIs. |
| ls | guideline | read, edit | Join ls result.path with entries[].name before read/edit. |
| find | guideline | read, edit | Join find entries to resolved path (default cwd) before read/edit; relative roots use cwd. |

The texts are static, so with `grep`, `find` or `ls` excluded, bash's description, snippet and both its guidelines, `edit`'s snippet and `nu`'s guideline still name the excluded tools (inferred from the texts above, not measured with `--exclude-tools`).

### After rulings 0008 and 0009, 2026-11-09

Slice 11 (Tools register as ruled) defers `ls` and `find` (Pi's `deferred` exposure: undeclared until named in `--tools` or loaded by `tool_search`, callable from codemode scripts throughout), so the script now activates every tool the extension registers and names the ones off by default on its second line: `find, ls`. Bash's description, snippet, `command` description and guidelines stop naming them, and so does `nu`'s guideline; the cross-reference list above no longer shows `ls` or `find` outside their own rows. Pi 1.5.0, locked on 2026-11-09, same machine: every tool active, 15067 bytes, ~3766 tokens (bash 1073 bytes, unchanged in sum; `nu` 457); a default session leaves out `find` (1590) and `ls` (744), so it declares 12733 bytes, ~3182 tokens, 2327 bytes fewer than the 2026-11-04 run.

## Sessions

```sh
node scripts/bench/tool-cost.mjs --sessions ~/.pi/agent/sessions          # the corpus alone
node scripts/bench/tool-cost.mjs --declarations --sessions <dir> --json   # both, as data
```

`--sessions <dir>` scores every `.jsonl` file under the directory with `scripts/bench/confusion.mjs`, which reads a Pi session file or a `pi --mode json` event stream alike: both carry the same messages, as `message` entries or `message_end` events. Per tool it reports calls, result bytes (UTF-8 of the result's text blocks; images are left out) at p50, p90 and p99 by nearest rank, and the confusion signals:

- **errors**: results marked `isError`; **rejected** is the subset Pi refused before the tool ran, invalid arguments or an unknown tool name (`Invalid arguments for tool`, `Validation failed for tool`, `Tool … not found`).
- **redundant**: a search, a `grep`, `find`, `ls` or `ast_search` call or a bash command whose pipeline heads run `grep`, `rg`, `find`, `fd`, `ls` or `tree`, that repeats an earlier call's tool and arguments in the same file (keys in any order, nulls dropped) with no `edit` or `write` between.
- **wrong-tool**: a bash call that `getBashAntiPatternHint` (`src/bash-anti-pattern-hints.ts`) would hint toward a tool active at that point, judged on each pipeline's first command, so `npm test | grep x` is no content search. The active set is the replay of the system messages' `toolsRemoved` then `toolsAdded`, as Pi replays them, a compaction's `systemMessage` replacing it whole; a call before any is unscored.
- **calls before the first touch**: per task (a user message to the next) with an `edit`, the tool calls before the first one whose arguments or result name the first edited file: as the edit gives it, absolute, or relative to the session's cwd with or without `./`, as a whole path (`src/a.ts.bak` and `lib/src/a.ts` are other files). A `grep`, `find`, `ls` or `ast_search` result also names it relative to the call's `path` argument, as those tools print it (`grep` in `src` prints `src/a.ts` as `a.ts`). The edit itself counts as a touch. It also reports which tool made that first touch.

A forked session copies its parent's history; the copies carry the parent's tool-call ids, so a call whose id an earlier file (by file name, oldest first) already holds counts once.

Bounds:

- Redundancy is exact repetition: the same search with a different path or one changed flag is not counted, so it undercounts near-duplicates. Only `edit` and `write` end a repetition; a bash command that changes files does not.
- Wrong-tool picks are as broad as the hint table: `git grep` counts as a grep pick, `cat` anywhere in a pipeline head as a read pick. Splitting a command into pipelines ignores quoting. A call inside a codemode script is not seen at all: only `codemode` is.
- A touch is a path match in text. A file named another way (`cd src && cat a.ts`, a glob) is missed, which pushes the count toward the edit itself; a file named in passing, in a long listing, counts as found.
- The corpus is one owner's sessions across many projects, extensions and models, most with this extension's tools active (inferred from the `read`, `grep` and `edit` counts); it is a baseline for what the A/B arms change, not a measure of any one tool in isolation.
- A session file is read in file order, not along its `/tree` branches, so a tool-set change or a search on an abandoned branch carries into the next one. 2 of 2524 corpus files branch, and replaying along each call's ancestry changed none of their 109 bash calls' wrong-tool scores (measured 2026-11-04). `--mode json` streams never branch.

### Recorded baseline, 2026-11-04

`~/.pi/agent/sessions` on the owner's machine, Node v26.13.0, with the script at `6a50a370` from slice 4 (Session corpus is scored); 13.5 s, 0.98 GB peak memory. The corpus is live, so a rerun differs.

2507 session files, 128,739 tool calls across 66 tool names, 370 more copied from a forked parent and counted once. 58,038 calls (45%) come before any recorded tool set, from Pi versions that did not record system messages, so they have no wrong-tool score.

| tool | calls | errors | rejected | redundant | wrong-tool | bytes p50 | p90 | p99 | total bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| read | 35946 | 316 | 1 | 0 | 0 | 3349 | 14391 | 39865 | 209859233 |
| bash | 31572 | 2711 | 0 | 2 | 5070 | 487 | 3833 | 28106 | 56717299 |
| edit | 15764 | 452 | 67 | 0 | 0 | 529 | 986 | 1591 | 8158618 |
| grep | 13323 | 150 | 10 | 13 | 0 | 1060 | 6106 | 27949 | 34902639 |
| codemode | 8056 | 582 | 1 | 0 | 0 | 6845 | 37646 | 40804 | 97622983 |
| write | 5310 | 71 | 0 | 0 | 0 | 4412 | 16560 | 36254 | 37243025 |
| find | 3179 | 11 | 3 | 10 | 0 | 46 | 534 | 5494 | 1235688 |
| ls | 1801 | 13 | 0 | 6 | 0 | 92 | 627 | 4779 | 595093 |
| nu | 1772 | 14 | 0 | 0 | 0 | 590 | 4193 | 20483 | 3439701 |
| ast_search | 515 | 1 | 0 | 1 | 0 | 259 | 2567 | 26473 | 878534 |

The other 56 tool names, from other extensions and MCP servers, make up the remaining 11,501 calls; the script prints them all.

Wrong-tool picks by hint: 3130 toward `grep`, 1565 toward `read` (`cat`), 353 toward `read` and `edit` (`sed -n`), 22 toward `find`. Scored on whole commands instead of pipeline heads, a separate pass a minute later (2511 files) gives 6964 `grep` picks against 3131 on heads: 3881 of them (56%) run `grep` or `rg` only after a pipe, as in `npm test | grep x`, and the live hint still fires on those. 48 picks count only on heads, where a `cat` in the dropped pipe tail had taken the hint's priority.

Tasks with an edit: 3196. Tool calls before the first touch of the edited file: p50 2, p90 10, p99 46. First touch by `read` 1475, `write` 508, `grep` 373, `edit` 367, `codemode` 258, `bash` 177, `find` 2, others 36.

On this corpus the three tools under ruling look quiet: `grep`, `find` and `ls` together had 174 errors (13 rejected) and 29 redundant repeats in 18,303 calls. `grep` returned 34.9 MB in all, its p99 result 27.9 KB, against 1.2 MB for `find` and 0.6 MB for `ls`.

The first-touch count above missed a search tool's results printed relative to its `path` argument, found in slice 6 (A/B harness compares tool arms)'s live drive. On the corpus of 2026-11-05 (2532 files, 129,522 calls), the rule above against the old one leaves every other figure unchanged and moves calls before the first touch from p50 2, p90 10, p99 45 to p50 2, p90 10, p99 44, and first touches from `read` 1483, `grep` 374, `edit` 368, `find` 2, `ls` 0 to `read` 1348, `grep` 419, `edit` 340, `find` 41, `ls` 92.

## A/B arms

`node scripts/bench/tool-ab.mjs --models <list> --max-cost <usd>` runs each task in a fresh workspace through the selected host's own Pi CLI (`PI_COMPAT_HOST`, else the locked Pi, never the global `pi`), in eight arms. The system prompt names the host's docs, so a selected host inside this checkout, as the locked one in `node_modules` is, runs instead as its version installed once under `~/.cache/pi-hashline-readmap/bench-hosts/<version>` (the whole Pi graph pinned, as in AGENTS.md's Host compatibility), and a host still inside is refused. The arms: `stock` (Pi's `read`, `bash`, `edit`, `write`), `extension` (this checkout's `index.ts`, its default tools plus `--tools +ls,+find`), `no-ls-find` (`--exclude-tools ls,find`) and `no-ls-find-grep` (`--exclude-tools ls,find,grep`); then, each as `no-ls-find` but for `read`, `edit` and `write`, `pi-edit` (`PI_HASHLINE_BUILTIN=edit,write`), `pi-read` (`PI_HASHLINE_BUILTIN=read`), `pi-read-edit` (`PI_HASHLINE_BUILTIN=read,edit,write`) and `bash-read-edit` (`--exclude-tools ls,find,read,edit,write`, so bash reads and edits). Since ruling 0008 the extension's defaults leave `ls` and `find` undeclared, so `extension` adds them back with `--tools`, declaring the set the pilot ran. Every arm runs with `PI_HASHLINE_BUILTIN` empty unless it names it, so the harness's own environment changes none. The fifth arm, `bash-grep-anchors`, went with the anchoring code after ruling 0009; its record stays in [`docs/tool-ab-fifth-arm/`](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/tool-ab-fifth-arm/README.md). The tasks are the 10 locate-first tasks (`scripts/bench/locate-tasks/`), each on the pinned snapshot committed into a fresh git repo and scored by its checker in a child process with a 60 s timeout, and an Explicit Edit control of three tasks (`unique-1000-plain`, `multi-file-1-unicode`, `replace-block-10-unicode`), scored byte-exact without a `.git`. `--tasks` also takes the names `locate`, every locate task, and `edit-sample`, one Explicit Edit task per family as `explicit-edit.mjs --sample 1` picks them (21). Each task and model runs its arms back to back, the arm order rotating, and every first repeat before any second. A run is launched only while the spent cost plus, for it and each run in flight, the most any run has cost stays within the cap; until one finishes, one runs alone. `summary.md` gives, per task set, model and arm, the mean per run of the pass rate, input tokens (input plus cache reads and writes), cost, tool calls and the confusion signals above, each with Δ, its spread between the repeats' means; a second table, `## Edit failures`, gives the same for `edit` calls, Pi's or Hashline's: their number, those refused by class, the calls per landed edit (runs where one landed) and the `read` calls of a file before its first edit, averaged over the run's edited files (runs with an `edit` call). A refusal's class is `anchor` (a stale or unknown anchor: Hashline's `hash-mismatch`, `Invalid line reference`, `Line N does not exist`), `text` (old text not found or not unique: Hashline's `text-not-found` and `ambiguous-match`, Pi's `Could not find the exact text`, `Found N occurrences`), `arguments` (Pi's refusal before the tool ran, Hashline's `invalid-edit-variant` and `invalid-null`, Pi's `Edit tool input is invalid` and empty `oldText`) or `other`; Hashline's are read from the error code its result carries, the rest from the text at the start of any of the result's lines, since a context-hygiene notice can precede it. `run.json` records the host, the extension's commit and the total spent.

An arm is what it declares: text in another tool naming an excluded one (listed above) and bash's grep hint on pipe filters stay, since a ruling that excludes a tool would ship them so.

`PI_HASHLINE_BUILTIN`, a comma list of any of `read`, `edit` and `write`, makes the extension leave those tools unregistered, so Pi's built-in of each name stays and the rest of Hashline loads: `PI_HASHLINE_BUILTIN=edit,write` pairs Hashline's `read` with Pi's `edit` and `write`. Unset or empty, all three are Hashline's. Any other name refuses the whole extension at load, with an error naming the accepted ones. It exists for these arms; which tools register by default is unchanged.

Bounds:

- The workspaces have no `node_modules`, so a model's `npm test` fails in every arm and adds an error; in the live drive below, 7 of 8 runs tried, and one `stock` run's `npx vitest` fetched vitest from the registry.
- A timeout is a failed run whatever its cause, a provider stall included.
- Edit failures see only `edit` calls: a `write` that replaces a file and an edit through bash or codemode are not counted, and Hashline's `replace_symbol` naming a missing symbol counts as `arguments`, since it shares `invalid-edit-variant`. A read counts toward a file when its `path` names it, whatever range it read; an edit call with no result, as at a timeout, counts as neither landed nor refused.
- A run can cost more than any before it, so the total can pass the cap by that excess per run in flight.
- A model can still reach this checkout by a path it guesses or finds outside the prompt; the pilot's escape (below) came through the host's docs path, before the host moved out. A run after which the checkout's tree differs (what git tracks or would add, `--out` excluded) is recorded failed as `checkout-changed`, and no run launches after it; runs in flight finish and are compared too. Ignored paths, such as `node_modules` and `tmp`, are not compared.

### Live drive, 2026-11-05

`--models openai-codex/gpt-6-luna --tasks ansi-cursor-codes --repeat 2 --max-cost 0.5` on Pi 1.5.0, 2026-11-05: 8 runs, $0.0176 in all, 7 passed. Each trace's system message declared its arm's tools: `stock` `read,bash,edit,write`; `extension` adding `grep,ast_search,nu,ls,find`; `no-ls-find` without `ls,find`; `no-ls-find-grep` without `grep` too. The failure, `no-ls-find` repeat 2, is a provider stall: its last event, a tool-call delta 6 s in, was followed by nothing until the 300 s timeout. Its summary scored `no-ls-find` repeat 1 at 2 calls before the touch where its second `grep`, in `src`, had printed `ansi.ts`; the rule above, fixed after the drive, rescores it 1 and leaves every other figure of the 8 runs unchanged. Each `no-ls-find-grep` run counts one error from `read` on the workspace directory, whose message answers `Use ls to inspect directories` with `ls` excluded.

The same command on the final harness, extension at `b4415881` with no uncommitted changes: 8 runs, $0.0185 in all, 8 passed. Every error the summary counts is in the traces: 8 `npm test` or `npx vitest` calls failing without `node_modules`, one in each run; 4 `read` calls in `extension` refused for pairing `charLimit` with a multi-line `limit`; and in `no-ls-find-grep` an `edit` missing `new_text` (rejected) and an `edit` on a stale anchor. The same command again without `--resume` refused the directory, and with `--resume` found 0 runs left.

Both drives are one task at 2 repeats, run to prove the harness; they carry no ruling.

## Pilot, 2026-11-05

The run behind [ruling 0008](../space/decisions/0008-ls-find-deferred-grep-kept.md), with its artifacts, the rule's tables and the blind review notes in [`docs/tool-ab-pilot/`](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/tool-ab-pilot/README.md):

```sh
node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --max-cost 18 --concurrency 3 --out tmp/bench-results/tool-ab-pilot
```

Pi 1.5.0 on 2026-11-05, extension at `7c139d36` with no uncommitted changes, thinking off, 300 s timeout: 13 tasks × 2 models × 4 arms × 2 repeats, 208 runs in 17 minutes, $3.4812 by its `run.json`. Two probes before it, outside the run: `anthropic/claude-sonnet-5-5` failed its OAuth refresh (`invalid_grant`) at $0, and `anthropic-cc/claude-sonnet-5-5`, the provider used, ran 2 runs for $0.0775. No run timed out or failed for the provider, so none was rerun.

Decided before the run: workspaces stay without `node_modules`, so tests fail in every arm, and errors are also split by tool so a failing `npm test` cannot hide a search tool's (`errors-by-tool.md`); a run failing for the provider would have been rerun once; failing runs were read for a checker refusing a valid answer, and none did (the stock `ls-default-limit#1` failure left `prompts/ls.md` at 500).

### The leak

On `ls-default-limit`, whose prompt names "the ls tool", gpt-6-luna took the task to mean the extension it was running and went looking for its source at the host path the system prompt names. In `extension` repeat 1 it edited this checkout's `src/ls.ts` and `prompts/ls.md` instead of its workspace, and failed its check; repeat 2 spent 12 calls in the checkout before `pwd` brought it back; `no-ls-find` repeat 2 tried the path and failed harmlessly. The edit was found after the run and reverted; from run 28 on, `extension` arms loaded `ls` with a default of 1000, which changed no result (the pilot's 4 later `ls` calls listed at most 19 entries).

The ruling's tables leave `ls-default-limit` out of every arm and model, keeping the arms paired. With it, gpt-6-luna's `extension` locate runs average 72,509 input tokens against `no-ls-find`'s 64,717, a loss for `ls` and `find` beyond the spread; without it, 62,465 against 60,289, a tie. Both tables are kept.

### Results

Locate tasks without `ls-default-limit` (9 tasks, 18 runs per cell), mean per run; every run passed:

| model | arm | input tokens (Δ) | cost (Δ) | calls before touch (Δ) | errors (Δ) |
|---|---|---:|---:|---:|---:|
| gpt-6-luna | stock | 84,418 (28,563) | $0.00296 (0.00074) | 0.67 (0.67) | 0.67 (0.22) |
| gpt-6-luna | extension | 62,465 (6,395) | $0.00229 (0.00010) | 0.94 (0.11) | 0.89 (0.00) |
| gpt-6-luna | no-ls-find | 60,289 (6,862) | $0.00250 (0.00041) | 1.28 (0.11) | 1.06 (0.33) |
| gpt-6-luna | no-ls-find-grep | 95,591 (21,440) | $0.00319 (0.00052) | 1.89 (0.00) | 1.33 (0.00) |
| claude-sonnet-5-5 | stock | 20,307 (1,671) | $0.02424 (0.00235) | 0.33 (0.11) | 0.33 (0.22) |
| claude-sonnet-5-5 | extension | 43,287 (2,425) | $0.03722 (0.00607) | 0.39 (0.11) | 0.17 (0.11) |
| claude-sonnet-5-5 | no-ls-find | 36,801 (3,023) | $0.03660 (0.00660) | 0.44 (0.02) | 0.06 (0.11) |
| claude-sonnet-5-5 | no-ls-find-grep | 34,820 (6,782) | $0.02978 (0.00640) | 1.08 (0.50) | 0.11 (0.00) |

The rule, per model, a gap counting only beyond both arms' spreads (`verdict.md`):

- `ls` and `find` (`extension` against `no-ls-find`): on gpt-6-luna they win calls before the first touch (0.94 against 1.28) and tie the rest; on Sonnet they lose 6,486 input tokens a run (spread 3,023) and win nothing but wrong-tool picks. Not kept.
- `grep` (`no-ls-find` against `no-ls-find-grep`): on gpt-6-luna it wins input tokens (35,302 fewer a run, spread 21,440), cost and calls before the touch (1.28 against 1.89); on Sonnet it wins calls before the touch (0.44 against 1.08, spread 0.50) and loses cost by $0.00682 against a spread of $0.00660, 3% past it. With `ls-default-limit` kept (`verdict-all-runs.md`) the Sonnet cost gap is a tie, and on the locate tasks `grep` then wins and loses nothing on either model.
- The Explicit Edit control, where the prompt names every file, shows no loss beyond spread for either tool, wrong-tool picks aside. Its one pass-rate gap counts for `grep`: gpt-6-luna's `no-ls-find-grep` failed `multi-file-1-unicode` in both repeats (4/6) where `no-ls-find` passed all 6, a spread of 0 on each side; the same task also failed once each in `stock` and `extension`, so it is a hard task for that model more than a `grep` effect (inferred).

Wrong-tool picks are not judged between arms: a bash `grep` counts as one only while the `grep` tool is active, so the signal can only count against the arm that has the tool (Sonnet: 0.22 a run in `no-ls-find` against 0.06 without `grep`).

The blind review of 5 traces per arm (`review-notes.md`): the `grep` tool's edge is an anchor that lets an edit skip the read (2 calls against 6 for bash search on the same task); its recurring confusion is printing paths relative to its `path` argument, which models then used from the workspace root (5 errors in 4 runs across the pilot); `ls` and `find` did no work that `grep` or a read had not; without `ls`, gpt-6-luna `read` a directory 12 times across the two arms lacking it and was told to use `ls`, a tool it did not have (`errors-by-tool.md`: its `read` errors rise from 3 in `extension` to 8 and 14).

Bounds: two repeats give each spread from two means, so a gap a few percent past it, as `grep`'s Sonnet cost, is weak evidence; every locate run but the two on `ls-default-limit` passed, so pass rate separates arms only on the edit control above; the tasks are this repo's and small, the models two, thinking off; the stock arm's numbers are reported, not ruled on.

## Fifth arm, 2026-11-09

The run behind [ruling 0009](../space/decisions/0009-grep-kept-bash-grep-anchors-dropped.md), which ruling 0008 triggered: can anchored bash grep stand in for the `grep` tool? Its artifacts, the rule's table and the blind review notes are in [`docs/tool-ab-fifth-arm/`](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/tool-ab-fifth-arm/README.md):

```sh
node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --arms no-ls-find,no-ls-find-grep,bash-grep-anchors --max-cost 10 --concurrency 3 \
  --out tmp/bench-results/tool-ab-fifth-arm
```

Pi 1.5.0 from the bench-host cache on 2026-11-09, extension at `3091b73b` with no uncommitted changes, thinking off, 300 s timeout: 13 tasks × 2 models × 3 arms × 2 repeats, 156 runs in 16 minutes, $2.6147 by its `run.json`. An attempt before it stopped after 4 runs ($0.0538) when files were added to this checkout mid-run and the checkout guard failed the runs in flight as `checkout-changed`; its results were set aside and the run started again from a clean tree. No run escaped into the checkout. `ls-default-limit` stays in every table, the host now outside the checkout (the two runs naming this checkout's path printed it from the snapshot's own `docs/codemode-benchmarks.md`). The one timeout, gpt-6-luna `no-ls-find` `markdown-extension#1`, is the model emitting `000` tool-call deltas until the limit, not a provider stall, so it stands as a failure.

### Results

Locate tasks (10 tasks, 20 runs per cell), mean per run (Δ, the spread between repeats):

| model | arm | pass | input tokens (Δ) | cost (Δ) | calls before touch (Δ) | errors (Δ) |
|---|---|---:|---:|---:|---:|---:|
| gpt-6-luna | no-ls-find | 19/20 | 59,199 (23,719) | $0.0025 (0.0002) | 0.9 (0.5) | 0.85 (0.10) |
| gpt-6-luna | no-ls-find-grep | 19/20 | 121,367 (67,768) | $0.0039 (0.0016) | 1.6 (1.5) | 1.30 (0.80) |
| gpt-6-luna | bash-grep-anchors | 19/20 | 103,688 (32,488) | $0.0035 (0.0005) | 0.8 (0.2) | 1.10 (0.20) |
| claude-sonnet-5-5 | no-ls-find | 20/20 | 43,146 (1,762) | $0.0411 (0.0012) | 0.3 (0.0) | 0.15 (0.30) |
| claude-sonnet-5-5 | no-ls-find-grep | 20/20 | 35,317 (5,392) | $0.0304 (0.0040) | 1.0 (0.0) | 0.30 (0.20) |
| claude-sonnet-5-5 | bash-grep-anchors | 20/20 | 38,973 (5,046) | $0.0329 (0.0001) | 1.1 (0.1) | 0.30 (0.20) |

The rule, per model, a gap counting only beyond both arms' spreads (`verdict.md`):

- The `grep` tool against anchored bash grep (`no-ls-find` against `bash-grep-anchors`), the ruled pair: on gpt-6-luna `grep` wins input tokens (44,490 fewer a run, spread 32,488), cost and errors on the locate tasks, and errors on the edit control (0.17 against 0.67, spread 0.33), and loses nothing. On Sonnet it wins calls before the first touch (0.32 against 1.07, spread 0.14) and loses cost ($0.0411 against $0.0329, a gap of $0.0082 against a spread of $0.0012); the rest tie.
- Anchored bash grep against plain bash grep (`bash-grep-anchors` against `no-ls-find-grep`): every judged metric ties on both models and both task sets.
- The `grep` tool against plain bash grep, the pilot's pair rerun: on gpt-6-luna every metric ties this time, plain bash's input tokens spreading 67,768 between repeats (the pilot's 21,440); on Sonnet `grep` wins calls before the touch and loses input tokens (7,829 a run, spread 5,392) and cost ($0.0107, spread $0.0040), where in the pilot its tokens tied and its cost lost 3% past the spread.

Whether the anchors were used (`anchor-use.md`, from the traces): 33 of gpt-6-luna's and 46 of Sonnet's bash grep results carried anchors. gpt-6-luna edited by none of them, reading every file first; Sonnet edited by an anchor only a bash grep had shown 5 times, in 23 edits.

The blind review of 5 traces per arm (`review-notes.md`, the same 5 draws as the pilot's by its seed): an edit by a search anchor without a read happened once with the `grep` tool (2 calls in all) and once with anchored bash grep (3 calls); in 4 of the 5 anchored traces the anchors were on screen and the model read the file anyway. Unscoped bash `rg` over `.` returned 20 to 51 KB, with or without anchors. The `grep` tool's paths relative to its `path` argument misled twice, as in the pilot, once with the misleading "fresh anchors" answer for a missing file.

Bounds: as the pilot's, two repeats give each spread from two means, the tasks are this repo's and small, the models two, thinking off; the arms ran at one commit in one session, but not beside the pilot's, so the pilot's numbers compare only loosely; why the `grep` tool costs Sonnet more at equal input tokens is not established (output or cache-write tokens are candidates, unmeasured); `anchor-use.md` matches anchors by `N:HASH` text, so an anchor a read also printed is not counted as from bash.

## Read and edit, 2026-11-19

The run of read-edit-ab (Read and edit are measured against the alternatives), for the owner to decide on: Hashline's `read`, `edit` and `write` against Pi's built-ins and bash. It rules on nothing. Its artifacts, the tables, the spread rule's gaps and the blind review notes are in [`docs/tool-ab-read-edit/`](https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/tool-ab-read-edit/README.md):

```sh
caffeinate -i node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --arms stock,no-ls-find,pi-edit,pi-read,pi-read-edit,bash-read-edit --tasks locate,edit-sample \
  --repeat 2 --max-cost 20 --concurrency 3 --out tmp/bench-results/tool-ab-read-edit
```

Pi 1.5.2 from the bench-host cache on 2026-11-19, extension at `f5f8b7a4` with no uncommitted changes, Node v26.13.0 on macOS, thinking off, 300 s timeout, the Explicit Edit checkout at `4e11e95c`: 31 tasks (the 10 locate tasks and the 21 of `edit-sample`) × 2 models × 6 arms × 2 repeats, 744 runs in 76 minutes, $11.1573 by its `run.json`, none skipped at the cap. A probe before it, outside the run, ran `stock` on `ansi-cursor-codes` once per model ($0.0298). No run changed the checkout and no assistant message carried a provider error. The 8 timeouts, all gpt-6-luna on `insert-payload-1000-unicode` (4) and `move-between-1000-unicode` (4), are the model streaming tool-call arguments until the limit, so they stand as failures. Failed runs read by hand were the model's errors, not a checker refusing a valid answer (a BSD `sed` range, a lost non-breaking space, a blank line added before a copied block).

The arms, by § A/B arms above: `stock` is Pi alone; `no-ls-find` is Hashline as configured; `pi-edit` pairs Hashline's `read` with Pi's `edit` and `write`; `pi-read` pairs Pi's `read` with Hashline's `edit` and `write`; `pi-read-edit` has Pi's three; `bash-read-edit` has none of the three, so bash reads and edits. Every arm but `stock` keeps Hashline's `grep`, `ast_search`, `nu` and bash hints.

### Results

Mean per run (Δ, the spread between the two repeats' means), from `table.md`; output tokens are the run's tokens less its input tokens:

| set | model | arm | runs | pass | input tokens | output tokens | cost | wall s | calls before touch |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| locate | gpt-6-luna | stock | 20 | 95% (10%) | 133,796 (21,082) | 564 (112) | $0.0037 ($0.0004) | 23.2 (4.4) | 0.65 (0.10) |
| locate | gpt-6-luna | no-ls-find | 20 | 100% (0%) | 65,448 (37,300) | 423 (154) | $0.0023 ($0.0006) | 20.3 (6.9) | 1.20 (1.00) |
| locate | gpt-6-luna | pi-edit | 20 | 95% (10%) | 50,873 (19,217) | 413 (59) | $0.0019 ($0.0001) | 18.4 (1.9) | 1.10 (0.20) |
| locate | gpt-6-luna | pi-read | 20 | 100% (0%) | 101,780 (3,327) | 482 (66) | $0.0029 ($0.0000) | 23.5 (0.2) | 1.10 (0.40) |
| locate | gpt-6-luna | pi-read-edit | 20 | 100% (0%) | 75,177 (16,074) | 452 (8) | $0.0026 ($0.0002) | 22.0 (0.7) | 0.70 (1.00) |
| locate | gpt-6-luna | bash-read-edit | 20 | 40% (40%) | 286,548 (125,646) | 965 (122) | $0.0066 ($0.0018) | 48.8 (6.1) | - |
| locate | claude-sonnet-5-5 | stock | 20 | 95% (10%) | 23,486 (2,749) | 751 (61) | $0.0289 ($0.0030) | 8.5 (0.7) | 0.58 (1.06) |
| locate | claude-sonnet-5-5 | no-ls-find | 20 | 100% (0%) | 43,002 (9,599) | 801 (137) | $0.0388 ($0.0047) | 13.1 (1.5) | 0.35 (0.04) |
| locate | claude-sonnet-5-5 | pi-edit | 20 | 100% (0%) | 36,801 (3,824) | 715 (78) | $0.0380 ($0.0011) | 9.2 (1.0) | 0.79 (0.66) |
| locate | claude-sonnet-5-5 | pi-read | 20 | 100% (0%) | 36,120 (6,052) | 698 (82) | $0.0347 ($0.0031) | 8.7 (1.8) | 0.33 (0.22) |
| locate | claude-sonnet-5-5 | pi-read-edit | 20 | 100% (0%) | 33,848 (2,363) | 687 (62) | $0.0370 ($0.0031) | 11.0 (0.8) | 0.39 (0.20) |
| locate | claude-sonnet-5-5 | bash-read-edit | 20 | 100% (0%) | 24,148 (1,182) | 701 (5) | $0.0301 ($0.0011) | 11.1 (1.6) | - |
| edit | gpt-6-luna | stock | 42 | 76% (0%) | 23,124 (2,651) | 326 (113) | $0.0012 ($0.0001) | 12.5 (1.5) | 0.03 (0.06) |
| edit | gpt-6-luna | no-ls-find | 42 | 76% (10%) | 45,318 (255) | 421 (12) | $0.0019 ($0.0001) | 36.1 (15.6) | 0.10 (0.01) |
| edit | gpt-6-luna | pi-edit | 42 | 71% (10%) | 32,992 (15,409) | 571 (134) | $0.0016 ($0.0003) | 25.5 (10.8) | 0.08 (0.03) |
| edit | gpt-6-luna | pi-read | 42 | 81% (10%) | 37,463 (7,111) | 435 (327) | $0.0016 ($0.0000) | 37.4 (20.4) | 0.10 (0.00) |
| edit | gpt-6-luna | pi-read-edit | 42 | 69% (5%) | 34,830 (15,731) | 678 (202) | $0.0016 ($0.0002) | 27.6 (17.8) | 0.11 (0.00) |
| edit | gpt-6-luna | bash-read-edit | 42 | 57% (10%) | 37,786 (1,951) | 460 (203) | $0.0016 ($0.0001) | 21.2 (4.2) | - |
| edit | claude-sonnet-5-5 | stock | 42 | 100% (0%) | 15,267 (793) | 529 (16) | $0.0212 ($0.0006) | 6.9 (0.1) | 0.00 (0.00) |
| edit | claude-sonnet-5-5 | no-ls-find | 42 | 98% (5%) | 27,830 (53) | 531 (3) | $0.0256 ($0.0000) | 10.5 (0.0) | 0.03 (0.07) |
| edit | claude-sonnet-5-5 | pi-edit | 42 | 93% (5%) | 23,864 (1,308) | 564 (4) | $0.0262 ($0.0008) | 8.1 (0.1) | 0.00 (0.00) |
| edit | claude-sonnet-5-5 | pi-read | 42 | 98% (5%) | 26,437 (19) | 501 (2) | $0.0254 ($0.0004) | 7.5 (0.1) | 0.07 (0.00) |
| edit | claude-sonnet-5-5 | pi-read-edit | 42 | 90% (0%) | 20,611 (1,494) | 532 (108) | $0.0251 ($0.0017) | 9.2 (1.0) | 0.00 (0.00) |
| edit | claude-sonnet-5-5 | bash-read-edit | 42 | 100% (0%) | 18,334 (239) | 568 (1) | $0.0242 ($0.0003) | 10.4 (0.4) | - |

Errors by tool, mean per run (Δ), from `errors-table.md` (whole-run counts of calls and errors in `errors-by-tool.md`); `bash (tests)` is bash running tests, which fail in every arm without `node_modules`; a run that never called a tool counts 0, and `-` marks a cell where no run called it:

| set | model | arm | read | edit | write | grep | bash | bash (tests) | other |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| locate | gpt-6-luna | stock | 0.00 (0.00) | 0.65 (1.10) | 0.00 (0.00) | - | 0.00 (0.00) | 0.75 (0.10) | - |
| locate | gpt-6-luna | no-ls-find | 0.20 (0.20) | 0.10 (0.20) | - | 0.00 (0.00) | 0.00 (0.00) | 0.60 (0.20) | - |
| locate | gpt-6-luna | pi-edit | 0.05 (0.10) | 0.05 (0.10) | - | 0.05 (0.10) | 0.00 (0.00) | 0.55 (0.10) | - |
| locate | gpt-6-luna | pi-read | 0.00 (0.00) | 0.50 (0.20) | 0.00 (0.00) | 0.05 (0.10) | 0.00 (0.00) | 0.65 (0.10) | ast_search 0.00 (0.00) |
| locate | gpt-6-luna | pi-read-edit | 0.00 (0.00) | 0.05 (0.10) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.55 (0.10) | - |
| locate | gpt-6-luna | bash-read-edit | - | - | - | 0.15 (0.30) | 0.25 (0.10) | 0.65 (0.10) | ast_search 0.15 (0.10), nu 0.60 (0.00) |
| locate | claude-sonnet-5-5 | stock | 0.00 (0.00) | 0.00 (0.00) | - | - | 0.20 (0.00) | 0.05 (0.10) | - |
| locate | claude-sonnet-5-5 | no-ls-find | 0.05 (0.10) | 0.25 (0.10) | - | 0.00 (0.00) | 0.05 (0.10) | - | - |
| locate | claude-sonnet-5-5 | pi-edit | 0.00 (0.00) | 0.00 (0.00) | - | 0.00 (0.00) | 0.00 (0.00) | - | - |
| locate | claude-sonnet-5-5 | pi-read | 0.00 (0.00) | 0.10 (0.20) | - | 0.00 (0.00) | 0.10 (0.20) | - | - |
| locate | claude-sonnet-5-5 | pi-read-edit | 0.00 (0.00) | 0.00 (0.00) | - | 0.00 (0.00) | 0.00 (0.00) | - | - |
| locate | claude-sonnet-5-5 | bash-read-edit | - | - | - | 0.00 (0.00) | 0.45 (0.10) | - | nu 0.00 (0.00) |
| edit | gpt-6-luna | stock | 0.02 (0.05) | 0.00 (0.00) | - | - | 0.00 (0.00) | - | - |
| edit | gpt-6-luna | no-ls-find | 0.05 (0.00) | 0.12 (0.24) | 0.00 (0.00) | 0.00 (0.00) | 0.02 (0.05) | - | - |
| edit | gpt-6-luna | pi-edit | 0.05 (0.00) | 0.14 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | - | - |
| edit | gpt-6-luna | pi-read | 0.02 (0.05) | 0.36 (0.14) | - | 0.00 (0.00) | 0.00 (0.00) | - | ast_search 0.00 (0.00) |
| edit | gpt-6-luna | pi-read-edit | 0.05 (0.00) | 0.14 (0.00) | - | 0.00 (0.00) | 0.02 (0.05) | - | - |
| edit | gpt-6-luna | bash-read-edit | - | - | - | 0.05 (0.00) | 0.19 (0.00) | - | ast_search 0.00 (0.00), nu 0.21 (0.05) |
| edit | claude-sonnet-5-5 | stock | 0.00 (0.00) | 0.00 (0.00) | - | - | 0.24 (0.10) | - | - |
| edit | claude-sonnet-5-5 | no-ls-find | 0.00 (0.00) | 0.05 (0.00) | - | 0.00 (0.00) | 0.05 (0.00) | - | - |
| edit | claude-sonnet-5-5 | pi-edit | 0.00 (0.00) | 0.00 (0.00) | - | 0.00 (0.00) | 0.05 (0.00) | - | - |
| edit | claude-sonnet-5-5 | pi-read | 0.00 (0.00) | 0.14 (0.10) | - | 0.00 (0.00) | 0.05 (0.10) | - | - |
| edit | claude-sonnet-5-5 | pi-read-edit | 0.00 (0.00) | 0.00 (0.00) | - | 0.00 (0.00) | 0.02 (0.05) | - | - |
| edit | claude-sonnet-5-5 | bash-read-edit | - | - | - | 0.00 (0.00) | 0.10 (0.00) | - | nu 0.00 (0.00) |

Edit failures, mean per run (Δ), from `summary.md`'s `## Edit failures`: `edit` calls, those refused by class, calls per landed edit (runs where one landed) and `read` calls of a file before its first edit (runs with an `edit` call). `bash-read-edit` has no `edit` tool, so its rows are 0 and `-`:

| set | model | arm | edit calls | anchor | text | arguments | other | calls per landed edit | reads before edit |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| locate | gpt-6-luna | stock | 2.8 (1.0) | 0.00 (0.00) | 0.60 (1.20) | 0.00 (0.00) | 0.05 (0.10) | 1.3 (0.5) | 0.8 (0.0) |
| locate | gpt-6-luna | no-ls-find | 1.8 (0.4) | 0.10 (0.20) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.1 (0.1) | 0.9 (0.2) |
| locate | gpt-6-luna | pi-edit | 1.8 (0.1) | 0.00 (0.00) | 0.05 (0.10) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.1) | 0.8 (0.3) |
| locate | gpt-6-luna | pi-read | 2.5 (0.5) | 0.30 (0.60) | 0.00 (0.00) | 0.05 (0.10) | 0.15 (0.30) | 1.3 (0.2) | 1.0 (0.0) |
| locate | gpt-6-luna | pi-read-edit | 2.0 (0.0) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.05 (0.10) | 1.1 (0.1) | 0.9 (0.0) |
| locate | claude-sonnet-5-5 | stock | 0.7 (0.3) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.2 (0.3) |
| locate | claude-sonnet-5-5 | no-ls-find | 1.4 (0.1) | 0.25 (0.10) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.2 (0.0) | 0.4 (0.3) |
| locate | claude-sonnet-5-5 | pi-edit | 1.4 (0.3) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.3 (0.1) |
| locate | claude-sonnet-5-5 | pi-read | 1.4 (0.1) | 0.10 (0.20) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.1 (0.2) | 0.3 (0.0) |
| locate | claude-sonnet-5-5 | pi-read-edit | 1.4 (0.6) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.4 (0.1) |
| edit | gpt-6-luna | stock | 1.1 (0.1) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.9 (0.1) |
| edit | gpt-6-luna | no-ls-find | 1.6 (0.4) | 0.07 (0.14) | 0.02 (0.05) | 0.02 (0.05) | 0.00 (0.00) | 1.1 (0.2) | 1.2 (0.3) |
| edit | gpt-6-luna | pi-edit | 1.4 (0.3) | 0.00 (0.00) | 0.10 (0.10) | 0.00 (0.00) | 0.05 (0.10) | 1.1 (0.0) | 1.2 (0.3) |
| edit | gpt-6-luna | pi-read | 1.8 (0.1) | 0.21 (0.24) | 0.00 (0.00) | 0.00 (0.00) | 0.14 (0.10) | 1.3 (0.2) | 1.0 (0.3) |
| edit | gpt-6-luna | pi-read-edit | 1.4 (0.0) | 0.00 (0.00) | 0.14 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.1 (0.0) | 1.2 (0.2) |
| edit | claude-sonnet-5-5 | stock | 0.2 (0.0) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.1 (0.3) |
| edit | claude-sonnet-5-5 | no-ls-find | 0.8 (0.0) | 0.02 (0.05) | 0.02 (0.05) | 0.00 (0.00) | 0.00 (0.00) | 1.1 (0.0) | 0.3 (0.1) |
| edit | claude-sonnet-5-5 | pi-edit | 0.4 (0.0) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.1 (0.1) |
| edit | claude-sonnet-5-5 | pi-read | 0.9 (0.1) | 0.12 (0.05) | 0.02 (0.05) | 0.00 (0.00) | 0.00 (0.00) | 1.2 (0.1) | 0.2 (0.0) |
| edit | claude-sonnet-5-5 | pi-read-edit | 0.6 (0.5) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 0.00 (0.00) | 1.0 (0.0) | 0.2 (0.1) |

The spread rule of rulings 0008 and 0009, applied as a report, not a ruling (`gaps.md`): `no-ls-find` against each other arm, per set and model, a gap counting only beyond the larger of the two arms' spreads.

- Against `bash-read-edit`: on gpt-6-luna's locate tasks Hashline's tools pass 20/20 against 8/20 (spread 40%), with 221,101 fewer input tokens a run (spread 125,646), lower cost and fewer errors; on its edit control they pass 76% against 57% (spread 10%) and cost 7,531 more input tokens. On Sonnet every pass rate ties, and bash costs less: 18,854 fewer input tokens a run on the locate tasks (spread 9,599) and 9,496 fewer on the edit control (spread 239).
- Against `pi-edit` (Pi's `edit` and `write`): on gpt-6-luna nothing is beyond the spread on either set. On Sonnet, Hashline's `edit` draws 0.25 anchor refusals a locate run against none and 1.24 calls per landed edit against 1.0, and on the edit control 3,966 more input tokens (spread 1,308) and 0.33 reads before the first edit against 0.06; pass rates tie.
- Against `pi-read` (Pi's `read`): on gpt-6-luna Hashline's `read` costs less on the locate tasks ($0.0023 against $0.0029) with fewer calls per landed edit (1.07 against 1.28), and on the edit control costs 7,855 more input tokens (spread 7,111) and $0.0003 more with fewer `other` refusals and calls per landed edit. On Sonnet's edit control Hashline's `edit` behind Pi's `read` is refused for an anchor 0.12 times a run against 0.02 behind its own, while Hashline's `read` costs 1,393 more input tokens (spread 53).
- Against `pi-read-edit` (Pi's three): on gpt-6-luna's edit control Hashline's `edit` is refused for text 0.02 times a run against 0.14 and costs $0.0003 more. On Sonnet the locate tasks repeat `pi-edit`'s anchor gap; on the edit control Hashline passes 98% against 90% (spread 5%) while costing 7,220 more input tokens (spread 1,494) and 0.07 more errors a run.
- Against `stock`: on gpt-6-luna's locate tasks Hashline halves input tokens (65,448 against 133,796, spread 37,300) and costs 39% less ($0.0023 against $0.0037); on Sonnet's it costs 19,516 more input tokens (spread 9,599) and $0.0100 more. On the edit control `stock` uses fewer input tokens on both models (gpt-6-luna 23,124 against 45,318; Sonnet 15,267 against 27,830), and Sonnet's `stock` errs more (0.24 a run against 0.10). No pass rate is beyond the spread.
- Errors by tool, the same rule on `errors-table.md`: Hashline's `edit` errs more than Pi's on Sonnet, 0.25 a locate run against none (spread 0.10) beside `stock`, `pi-edit` and `pi-read-edit`, and 0.05 an edit-control run against none; on gpt-6-luna's locate tasks it errs less behind its own `read` than behind Pi's (0.10 against 0.50, spread 0.20). Bash errs more wherever it reads and edits: in `bash-read-edit` (gpt-6-luna 0.25 a locate run and 0.19 an edit run against 0 and 0.02; Sonnet 0.45 and 0.10 against 0.05 and 0.05) and in Sonnet's `stock` (0.20 and 0.24 against 0.05 and 0.05); `bash-read-edit` also draws 0.05 `grep` errors an edit run on gpt-6-luna against none. No other per-tool gap is beyond the spread.

By task (`table.md`, 2 runs per cell, so these are leads for a later run, not results): on gpt-6-luna both arms with Hashline's `edit` passed `copy-within-100-plain` and `delete-block-10-plain` in 8 of 8 runs, the other four arms 2 of 16; the reverse, `no-ls-find` alone failed `language-select-10-json-plain` and `multi-file-1-unicode` in both repeats where `pi-read`, with the same `edit`, passed both. On Sonnet, `insert-block-100-unicode` failed all 4 runs with Pi's `edit` beside Hashline's `grep` (`pi-edit`, `pi-read-edit`) and passed in the other four arms, `stock`'s Pi `edit` included.

The blind review of 5 traces per arm (`review-notes.md`, 30 traces, seed 7 over both task sets; 28 of 30 arm guesses right): Hashline's anchors went wrong 3 times (an invented `141:??` with Pi's `read` on screen, a mistyped hash, a hash-and-text anchor), each refused and fixed on the next call, and Pi's `edit` twice (an `oldText` equal to its `newText`); bash in place of `read` and `edit` lost a run to perl matching bytes where the model wrote code points (another recovered by an unconditional substitution) and a run that never edited (26 calls, 547k input tokens), and a call to BSD `sed -i`. On the copy task drawn, `copy_lines` copied a 109-line block exactly where Pi's `edit` and a `nu` pipeline retyped it with an added blank line and failed. Whole-file reads of the 1000-test file cost 45k to 126k input tokens, either `read`; searching first held the same task to 16k to 20k.

Bounds: two repeats give each spread from two means, so a gap a little past it is weak evidence; per-task cells are 2 runs. `bash-read-edit` keeps Hashline's `grep`, `ast_search`, `nu` and bash hints, so it measures the three tools' absence, not stock bash. The edit-failure columns and calls before the touch see only `edit` calls: a `bash-read-edit` edit through bash shows only in errors by tool. Wall time includes the 300 s timeouts and three runs sharing the machine and the providers, so it is no latency measure. The Explicit Edit control is scored byte-exact, so a blank line fails a run. The tasks are this repo's and the Explicit Edit sample, the models two, thinking off.
