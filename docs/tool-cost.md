# Tool cost

What each tool this extension registers costs in context, measured for the tools-vs-bash (Each search tool earns its place over bash) arc, which rules whether `find`, `ls` and `grep` earn their place over bash.

[Back to Benchmarking edits](benchmarking.md)

## Declarations

```sh
node scripts/bench/tool-cost.mjs            # table and cross-references
node scripts/bench/tool-cost.mjs --json     # the same as data
```

`--declarations`, the default, loads this checkout's `index.ts` alone into the selected host (`PI_COMPAT_HOST`, else the locked Pi) through `createAgentSession`, in a scratch working directory and agent directory, as `pi --no-extensions -e index.ts` would on a fresh install with no user settings. It sends one prompt to a stub provider and measures what that provider receives: the rendered system prompt and the tool declarations. Every tool the extension declares is active, as Pi's default selection leaves it.

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

Locked Pi 1.5.0, Node v26.13.0, macOS, nu 0.116.1 and ast-grep 0.51.0 installed, at `eee27fee` with the script from slice 3 (Declaration cost is measured).

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

`node scripts/bench/tool-ab.mjs --models <list> --max-cost <usd>` runs each task in a fresh workspace through the selected host's own Pi CLI (`PI_COMPAT_HOST`, else the locked Pi, never the global `pi`), in four arms. The system prompt names the host's docs, so a selected host inside this checkout, as the locked one in `node_modules` is, runs instead as its version installed once under `~/.cache/pi-hashline-readmap/bench-hosts/<version>` (the whole Pi graph pinned, as in AGENTS.md's Host compatibility), and a host still inside is refused. The arms: `stock` (Pi's `read`, `bash`, `edit`, `write`), `extension` (this checkout's `index.ts`), `no-ls-find` (`--exclude-tools ls,find`) and `no-ls-find-grep` (`--exclude-tools ls,find,grep`). The tasks are the 10 locate-first tasks (`scripts/bench/locate-tasks/`), each on the pinned snapshot committed into a fresh git repo and scored by its checker in a child process with a 60 s timeout, and an Explicit Edit control of three tasks (`unique-1000-plain`, `multi-file-1-unicode`, `replace-block-10-unicode`), scored byte-exact without a `.git`. Each task and model runs its arms back to back, the arm order rotating, and every first repeat before any second. A run is launched only while the spent cost plus, for it and each run in flight, the most any run has cost stays within the cap; until one finishes, one runs alone. `summary.md` gives, per task set, model and arm, the mean per run of the pass rate, input tokens (input plus cache reads and writes), cost, tool calls and the confusion signals above, each with Δ, its spread between the repeats' means; `run.json` records the host, the extension's commit and the total spent.

An arm is what it declares: text in another tool naming an excluded one (listed above) and bash's grep hint on pipe filters stay, since a ruling that excludes a tool would ship them so.

Bounds:

- The workspaces have no `node_modules`, so a model's `npm test` fails in every arm and adds an error; in the live drive below, 7 of 8 runs tried, and one `stock` run's `npx vitest` fetched vitest from the registry.
- A timeout is a failed run whatever its cause, a provider stall included.
- A run can cost more than any before it, so the total can pass the cap by that excess per run in flight.
- A model can still reach this checkout by a path it guesses or finds outside the prompt; the pilot's escape (below) came through the host's docs path, before the host moved out. A run after which the checkout's tree differs (what git tracks or would add, `--out` excluded) is recorded failed as `checkout-changed`, and no run launches after it; runs in flight finish and are compared too. Ignored paths, such as `node_modules` and `tmp`, are not compared.

### Live drive, 2026-11-05

`--models openai-codex/gpt-6-luna --tasks ansi-cursor-codes --repeat 2 --max-cost 0.5` on Pi 1.5.0: 8 runs, $0.0176 in all, 7 passed. Each trace's system message declared its arm's tools: `stock` `read,bash,edit,write`; `extension` adding `grep,ast_search,nu,ls,find`; `no-ls-find` without `ls,find`; `no-ls-find-grep` without `grep` too. The failure, `no-ls-find` repeat 2, is a provider stall: its last event, a tool-call delta 6 s in, was followed by nothing until the 300 s timeout. Its summary scored `no-ls-find` repeat 1 at 2 calls before the touch where its second `grep`, in `src`, had printed `ansi.ts`; the rule above, fixed after the drive, rescores it 1 and leaves every other figure of the 8 runs unchanged. Each `no-ls-find-grep` run counts one error from `read` on the workspace directory, whose message answers `Use ls to inspect directories` with `ls` excluded.

The same command on the final harness, extension at `b4415881` with no uncommitted changes: 8 runs, $0.0185 in all, 8 passed. Every error the summary counts is in the traces: 8 `npm test` or `npx vitest` calls failing without `node_modules`, one in each run; 4 `read` calls in `extension` refused for pairing `charLimit` with a multi-line `limit`; and in `no-ls-find-grep` an `edit` missing `new_text` (rejected) and an `edit` on a stale anchor. The same command again without `--resume` refused the directory, and with `--resume` found 0 runs left.

Both drives are one task at 2 repeats, run to prove the harness; they carry no ruling.

## Pilot, 2026-11-05

The run behind [ruling 0008](../space/decisions/0008-ls-find-deferred-grep-kept.md), with its artifacts, the rule's tables and the blind review notes in [`docs/tool-ab-pilot/`](tool-ab-pilot/README.md):

```sh
node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --max-cost 18 --concurrency 3 --out tmp/bench-results/tool-ab-pilot
```

Pi 1.5.0, extension at `7c139d36` with no uncommitted changes, thinking off, 300 s timeout: 13 tasks × 2 models × 4 arms × 2 repeats, 208 runs in 17 minutes, $3.4812 by its `run.json`. Two probes before it, outside the run: `anthropic/claude-sonnet-5-5` failed its OAuth refresh (`invalid_grant`) at $0, and `anthropic-cc/claude-sonnet-5-5`, the provider used, ran 2 runs for $0.0775. No run timed out or failed for the provider, so none was rerun.

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
