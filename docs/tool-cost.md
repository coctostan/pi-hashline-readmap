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
- **calls before the first touch**: per task (a user message to the next) with an `edit`, the tool calls before the first one whose arguments or result name the first edited file: as the edit gives it, absolute, or relative to the session's cwd with or without `./`, as a whole path (`src/a.ts.bak` and `lib/src/a.ts` are other files). The edit itself counts as a touch. It also reports which tool made that first touch.

A forked session copies its parent's history; the copies carry the parent's tool-call ids, so a call whose id an earlier file (by file name, oldest first) already holds counts once.

Bounds:

- Redundancy is exact repetition: the same search with a different path or one changed flag is not counted, so it undercounts near-duplicates. Only `edit` and `write` end a repetition; a bash command that changes files does not.
- Wrong-tool picks are as broad as the hint table: `git grep` counts as a grep pick, `cat` anywhere in a pipeline head as a read pick. Splitting a command into pipelines ignores quoting. A call inside a codemode script is not seen at all: only `codemode` is.
- A touch is a path match in text. A file named another way (`cd src && cat a.ts`, a glob) is missed, which pushes the count toward the edit itself; a file named in passing, in a long listing, counts as found.
- The corpus is one owner's sessions across many projects, extensions and models, most with this extension's tools active (inferred from the `read`, `grep` and `edit` counts); it is a baseline for what the A/B arms change, not a measure of any one tool in isolation.

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
