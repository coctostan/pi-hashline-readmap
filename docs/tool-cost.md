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
