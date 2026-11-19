# Tool arms A/B — openai-codex/gpt-6-luna, anthropic-cc/claude-sonnet-5-5

Pi 1.5.2 on 2026-11-19; arms stock, no-ls-find, pi-edit, pi-read, pi-read-edit, bash-read-edit; 2 repeat(s); spent $11.1573 of $20.
Each cell is the mean per run; Δ is the spread, the largest minus the smallest per-repeat mean. Errors include rejected calls; calls before touch counts runs that edited.

| Set | Model | Arm | Pass | Rate | Input tokens | Cost | Tool calls | Errors | Rejected | Redundant | Wrong tool | Calls before touch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| locate | openai-codex/gpt-6-luna | stock | 19/20 | 95.0% Δ10.0 | 133796 Δ21082 | $0.0037 Δ0.0004 | 8.2 Δ1.3 | 1.40 Δ1.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.45 Δ0.10 | 0.7 Δ0.1 |
| locate | openai-codex/gpt-6-luna | no-ls-find | 20/20 | 100.0% Δ0.0 | 65448 Δ37300 | $0.0023 Δ0.0006 | 7.2 Δ1.7 | 0.90 Δ0.60 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.2 Δ1.0 |
| locate | openai-codex/gpt-6-luna | pi-edit | 19/20 | 95.0% Δ10.0 | 50873 Δ19217 | $0.0019 Δ0.0001 | 6.6 Δ0.8 | 0.70 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.1 Δ0.2 |
| locate | openai-codex/gpt-6-luna | pi-read | 20/20 | 100.0% Δ0.0 | 101780 Δ3327 | $0.0029 Δ0.0000 | 9.5 Δ0.4 | 1.20 Δ0.40 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.1 Δ0.4 |
| locate | openai-codex/gpt-6-luna | pi-read-edit | 20/20 | 100.0% Δ0.0 | 75177 Δ16074 | $0.0026 Δ0.0002 | 7.9 Δ0.8 | 0.60 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.7 Δ1.0 |
| locate | openai-codex/gpt-6-luna | bash-read-edit | 8/20 | 40.0% Δ40.0 | 286548 Δ125646 | $0.0066 Δ0.0018 | 25.3 Δ6.7 | 1.80 Δ0.40 | 0.00 Δ0.00 | 0.85 Δ1.10 | 0.00 Δ0.00 | - |
| locate | anthropic-cc/claude-sonnet-5-5 | stock | 19/20 | 95.0% Δ10.0 | 23486 Δ2749 | $0.0289 Δ0.0030 | 4.2 Δ0.2 | 0.25 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.35 Δ0.10 | 0.6 Δ1.1 |
| locate | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 20/20 | 100.0% Δ0.0 | 43002 Δ9599 | $0.0388 Δ0.0047 | 4.3 Δ0.7 | 0.35 Δ0.30 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.30 Δ0.20 | 0.4 Δ0.0 |
| locate | anthropic-cc/claude-sonnet-5-5 | pi-edit | 20/20 | 100.0% Δ0.0 | 36801 Δ3824 | $0.0380 Δ0.0011 | 4.3 Δ0.9 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.15 Δ0.30 | 0.8 Δ0.7 |
| locate | anthropic-cc/claude-sonnet-5-5 | pi-read | 20/20 | 100.0% Δ0.0 | 36120 Δ6052 | $0.0347 Δ0.0031 | 4.3 Δ0.3 | 0.20 Δ0.40 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.15 Δ0.10 | 0.3 Δ0.2 |
| locate | anthropic-cc/claude-sonnet-5-5 | pi-read-edit | 20/20 | 100.0% Δ0.0 | 33848 Δ2363 | $0.0370 Δ0.0031 | 4.5 Δ0.8 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.15 Δ0.30 | 0.4 Δ0.2 |
| locate | anthropic-cc/claude-sonnet-5-5 | bash-read-edit | 20/20 | 100.0% Δ0.0 | 24148 Δ1182 | $0.0301 Δ0.0011 | 4.2 Δ0.3 | 0.45 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.65 Δ0.10 | - |
| edit | openai-codex/gpt-6-luna | stock | 32/42 | 76.2% Δ0.0 | 23124 Δ2651 | $0.0012 Δ0.0001 | 3.4 Δ0.0 | 0.02 Δ0.05 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.1 |
| edit | openai-codex/gpt-6-luna | no-ls-find | 32/42 | 76.2% Δ9.5 | 45318 Δ255 | $0.0019 Δ0.0001 | 5.0 Δ0.5 | 0.19 Δ0.19 | 0.00 Δ0.00 | 0.05 Δ0.00 | 0.00 Δ0.00 | 0.1 Δ0.0 |
| edit | openai-codex/gpt-6-luna | pi-edit | 30/42 | 71.4% Δ9.5 | 32992 Δ15409 | $0.0016 Δ0.0003 | 4.6 Δ0.7 | 0.19 Δ0.00 | 0.00 Δ0.00 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.1 Δ0.0 |
| edit | openai-codex/gpt-6-luna | pi-read | 34/42 | 81.0% Δ9.5 | 37463 Δ7111 | $0.0016 Δ0.0000 | 5.3 Δ0.1 | 0.38 Δ0.19 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.1 Δ0.0 |
| edit | openai-codex/gpt-6-luna | pi-read-edit | 29/42 | 69.0% Δ4.8 | 34830 Δ15731 | $0.0016 Δ0.0002 | 4.7 Δ0.1 | 0.21 Δ0.05 | 0.00 Δ0.00 | 0.07 Δ0.05 | 0.00 Δ0.00 | 0.1 Δ0.0 |
| edit | openai-codex/gpt-6-luna | bash-read-edit | 24/42 | 57.1% Δ9.5 | 37786 Δ1951 | $0.0016 Δ0.0001 | 8.2 Δ0.8 | 0.45 Δ0.05 | 0.00 Δ0.00 | 0.31 Δ0.05 | 0.00 Δ0.00 | - |
| edit | anthropic-cc/claude-sonnet-5-5 | stock | 42/42 | 100.0% Δ0.0 | 15267 Δ793 | $0.0212 Δ0.0006 | 2.4 Δ0.2 | 0.24 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.24 Δ0.10 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 41/42 | 97.6% Δ4.8 | 27830 Δ53 | $0.0256 Δ0.0000 | 2.6 Δ0.0 | 0.10 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.19 Δ0.10 | 0.0 Δ0.1 |
| edit | anthropic-cc/claude-sonnet-5-5 | pi-edit | 39/42 | 92.9% Δ4.8 | 23864 Δ1308 | $0.0262 Δ0.0008 | 2.6 Δ0.2 | 0.05 Δ0.00 | 0.00 Δ0.00 | 0.02 Δ0.05 | 0.45 Δ0.14 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | pi-read | 41/42 | 97.6% Δ4.8 | 26437 Δ19 | $0.0254 Δ0.0004 | 2.7 Δ0.0 | 0.19 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.24 Δ0.10 | 0.1 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | pi-read-edit | 38/42 | 90.5% Δ0.0 | 20611 Δ1494 | $0.0251 Δ0.0017 | 2.7 Δ0.8 | 0.02 Δ0.05 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.24 Δ0.10 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | bash-read-edit | 42/42 | 100.0% Δ0.0 | 18334 Δ239 | $0.0242 Δ0.0003 | 2.7 Δ0.0 | 0.10 Δ0.00 | 0.00 Δ0.00 | 0.02 Δ0.05 | 0.64 Δ0.05 | - |

## Edit failures

Calls of the `edit` tool, Pi's or Hashline's, and those refused by why: a stale or unknown anchor, old text not found or not unique, rejected arguments, or any other error. Calls per landed edit counts runs with one that landed; reads before edit, the `read` calls of a file before its first edit, averaged over the run's edited files, runs with an `edit` call.

| Set | Model | Arm | Edit calls | Anchor | Text | Arguments | Other | Calls per landed edit | Reads before edit |
|---|---|---|---|---|---|---|---|---|---|
| locate | openai-codex/gpt-6-luna | stock | 2.8 Δ1.0 | 0.00 Δ0.00 | 0.60 Δ1.20 | 0.00 Δ0.00 | 0.05 Δ0.10 | 1.3 Δ0.5 | 0.8 Δ0.0 |
| locate | openai-codex/gpt-6-luna | no-ls-find | 1.8 Δ0.4 | 0.10 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.1 Δ0.1 | 0.9 Δ0.2 |
| locate | openai-codex/gpt-6-luna | pi-edit | 1.8 Δ0.1 | 0.00 Δ0.00 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.1 | 0.8 Δ0.3 |
| locate | openai-codex/gpt-6-luna | pi-read | 2.5 Δ0.5 | 0.30 Δ0.60 | 0.00 Δ0.00 | 0.05 Δ0.10 | 0.15 Δ0.30 | 1.3 Δ0.2 | 1.0 Δ0.0 |
| locate | openai-codex/gpt-6-luna | pi-read-edit | 2.0 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.05 Δ0.10 | 1.1 Δ0.1 | 0.9 Δ0.0 |
| locate | openai-codex/gpt-6-luna | bash-read-edit | 0.0 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | - | - |
| locate | anthropic-cc/claude-sonnet-5-5 | stock | 0.7 Δ0.3 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.2 Δ0.3 |
| locate | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 1.4 Δ0.1 | 0.25 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.2 Δ0.0 | 0.4 Δ0.3 |
| locate | anthropic-cc/claude-sonnet-5-5 | pi-edit | 1.4 Δ0.3 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.3 Δ0.1 |
| locate | anthropic-cc/claude-sonnet-5-5 | pi-read | 1.4 Δ0.1 | 0.10 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.1 Δ0.2 | 0.3 Δ0.0 |
| locate | anthropic-cc/claude-sonnet-5-5 | pi-read-edit | 1.4 Δ0.6 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.4 Δ0.1 |
| locate | anthropic-cc/claude-sonnet-5-5 | bash-read-edit | 0.0 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | - | - |
| edit | openai-codex/gpt-6-luna | stock | 1.1 Δ0.1 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.9 Δ0.1 |
| edit | openai-codex/gpt-6-luna | no-ls-find | 1.6 Δ0.4 | 0.07 Δ0.14 | 0.02 Δ0.05 | 0.02 Δ0.05 | 0.00 Δ0.00 | 1.1 Δ0.2 | 1.2 Δ0.3 |
| edit | openai-codex/gpt-6-luna | pi-edit | 1.4 Δ0.3 | 0.00 Δ0.00 | 0.10 Δ0.10 | 0.00 Δ0.00 | 0.05 Δ0.10 | 1.1 Δ0.0 | 1.2 Δ0.3 |
| edit | openai-codex/gpt-6-luna | pi-read | 1.8 Δ0.1 | 0.21 Δ0.24 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.14 Δ0.10 | 1.3 Δ0.2 | 1.0 Δ0.3 |
| edit | openai-codex/gpt-6-luna | pi-read-edit | 1.4 Δ0.0 | 0.00 Δ0.00 | 0.14 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.1 Δ0.0 | 1.2 Δ0.2 |
| edit | openai-codex/gpt-6-luna | bash-read-edit | 0.0 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | - | - |
| edit | anthropic-cc/claude-sonnet-5-5 | stock | 0.2 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.1 Δ0.3 |
| edit | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 0.8 Δ0.0 | 0.02 Δ0.05 | 0.02 Δ0.05 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.1 Δ0.0 | 0.3 Δ0.1 |
| edit | anthropic-cc/claude-sonnet-5-5 | pi-edit | 0.4 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.1 Δ0.1 |
| edit | anthropic-cc/claude-sonnet-5-5 | pi-read | 0.9 Δ0.1 | 0.12 Δ0.05 | 0.02 Δ0.05 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.2 Δ0.1 | 0.2 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | pi-read-edit | 0.6 Δ0.5 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.0 Δ0.0 | 0.2 Δ0.1 |
| edit | anthropic-cc/claude-sonnet-5-5 | bash-read-edit | 0.0 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | - | - |

## Failed runs (95)

- locate anthropic-cc/claude-sonnet-5-5 stock `rename-format-not-found#1`: check — src/read.ts still names formatNotFound
- locate openai-codex/gpt-6-luna bash-read-edit `markdown-extension#1`: check — .markdown: got null, want {"id":"markdown","name":"Markdown"}
- locate openai-codex/gpt-6-luna stock `ls-default-limit#1`: check — documented default is 1000: got false, want true
- locate openai-codex/gpt-6-luna bash-read-edit `ls-default-limit#1`: check — code default is 1000: got false, want true
- locate openai-codex/gpt-6-luna bash-read-edit `integer-plus-sign#1`: check — +12 with a name: got {"ok":false,"message":"Invalid limit: expected a base-10 integer, received \"+12\"."}, want {"ok":true,"value":12}
- locate openai-codex/gpt-6-luna bash-read-edit `ast-search-loop-suggestion#1`: check — suggests "try a narrower path": got false, want true
- edit openai-codex/gpt-6-luna no-ls-find `language-select-10-json-plain#1`: mismatch — changed routes.json (first difference at line 8)
- edit openai-codex/gpt-6-luna no-ls-find `language-insert-1-yaml-plain#1`: mismatch — changed routes.yaml (first difference at line 15)
- edit openai-codex/gpt-6-luna bash-read-edit `unique-1000-plain#1`: mismatch — changed settings.ts (first difference at line 502)
- edit openai-codex/gpt-6-luna no-ls-find `multi-file-1-unicode#1`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna bash-read-edit `select-subset-1000-unicode#1`: mismatch — changed cases.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna stock `delete-subset-10-plain#1`: mismatch — changed cases.test.ts (first difference at line 8)
- edit openai-codex/gpt-6-luna pi-edit `delete-subset-10-plain#1`: mismatch — changed cases.test.ts (first difference at line 87, trailing newline only)
- edit openai-codex/gpt-6-luna pi-read-edit `delete-subset-10-plain#1`: mismatch — changed cases.test.ts (first difference at line 8)
- edit openai-codex/gpt-6-luna pi-read `delete-subset-10-plain#1`: mismatch — changed cases.test.ts (first difference at line 8)
- edit anthropic-cc/claude-sonnet-5-5 pi-read `delete-subset-10-plain#1`: mismatch — changed cases.test.ts (first difference at line 8)
- edit anthropic-cc/claude-sonnet-5-5 pi-read-edit `delete-subset-10-plain#1`: mismatch — changed cases.test.ts (first difference at line 8)
- edit openai-codex/gpt-6-luna bash-read-edit `insert-subset-100-unicode#1`: mismatch — changed cases.test.ts (first difference at line 17)
- edit openai-codex/gpt-6-luna bash-read-edit `replace-block-10-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 21)
- edit openai-codex/gpt-6-luna pi-read-edit `delete-block-10-plain#1`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna stock `delete-block-10-plain#1`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-edit `delete-block-10-plain#1`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-edit `move-block-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-read-edit `move-block-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read `move-block-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 23)
- edit openai-codex/gpt-6-luna bash-read-edit `move-block-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-edit `copy-block-100-unicode#1`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read-edit `copy-block-100-unicode#1`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna bash-read-edit `copy-block-100-unicode#1`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read `copy-block-100-unicode#1`: mismatch — changed target.test.ts (first difference at line 7)
- edit openai-codex/gpt-6-luna no-ls-find `copy-block-100-unicode#1`: mismatch — changed target.test.ts (first difference at line 19)
- edit anthropic-cc/claude-sonnet-5-5 pi-read-edit `insert-block-100-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 128)
- edit openai-codex/gpt-6-luna stock `insert-payload-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 21)
- edit anthropic-cc/claude-sonnet-5-5 pi-edit `insert-block-100-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 128)
- edit openai-codex/gpt-6-luna pi-edit `insert-payload-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 21)
- edit openai-codex/gpt-6-luna no-ls-find `insert-payload-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 21)
- edit openai-codex/gpt-6-luna pi-read-edit `insert-payload-1000-unicode#1`: mismatch — changed blocks.test.ts (first difference at line 22)
- edit openai-codex/gpt-6-luna pi-edit `copy-within-100-plain#1`: mismatch — changed blocks.test.ts (first difference at line 140)
- edit openai-codex/gpt-6-luna bash-read-edit `copy-within-100-plain#1`: mismatch — changed blocks.test.ts (first difference at line 140)
- edit openai-codex/gpt-6-luna pi-read-edit `copy-within-100-plain#1`: mismatch — changed blocks.test.ts (first difference at line 140)
- edit openai-codex/gpt-6-luna stock `copy-within-100-plain#1`: mismatch — changed blocks.test.ts (first difference at line 140)
- edit openai-codex/gpt-6-luna pi-read-edit `move-between-1000-unicode#1`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna stock `move-between-1000-unicode#1`: mismatch — changed source.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-edit `move-between-1000-unicode#1`: mismatch — changed source.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-read `insert-payload-1000-unicode#1`: timeout — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna bash-read-edit `unicode-fix-1-cyrillic-a-unicode#1`: mismatch — changed sample.txt (first difference at line 2)
- edit openai-codex/gpt-6-luna no-ls-find `move-between-1000-unicode#1`: timeout — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read `move-between-1000-unicode#1`: timeout — changed target.test.ts (first difference at line 9)
- locate openai-codex/gpt-6-luna bash-read-edit `rename-format-not-found#2`: check — src/read.ts still names formatNotFound
- locate openai-codex/gpt-6-luna bash-read-edit `markdown-extension#2`: check — .markdown: got null, want {"id":"markdown","name":"Markdown"}
- locate openai-codex/gpt-6-luna pi-edit `ls-default-limit#2`: check — documented default is 1000: got false, want true
- locate openai-codex/gpt-6-luna bash-read-edit `ls-default-limit#2`: check — code default is 1000: got false, want true
- locate openai-codex/gpt-6-luna bash-read-edit `bash-search-hint-commands#2`: check — ag: got null, want "[Hint: Prefer the grep tool for content search.]"
- locate openai-codex/gpt-6-luna bash-read-edit `integer-plus-sign#2`: check — +12 with a name: got {"ok":false,"message":"Invalid limit: expected a base-10 integer, received \"+12\"."}, want {"ok":true,"value":12}
- locate openai-codex/gpt-6-luna bash-read-edit `find-stat-concurrency#2`: check — default: got 32, want 16
- locate openai-codex/gpt-6-luna bash-read-edit `outline-script-license#2`: check — scripts/python_outline.py is otherwise unchanged: got false, want true
- locate openai-codex/gpt-6-luna bash-read-edit `ast-search-loop-suggestion#2`: check — suggests "try a narrower path": got false, want true
- edit openai-codex/gpt-6-luna no-ls-find `language-select-10-json-plain#2`: mismatch — changed routes.json (first difference at line 8)
- edit openai-codex/gpt-6-luna bash-read-edit `language-insert-1-yaml-plain#2`: mismatch — changed routes.yaml (first difference at line 15)
- edit openai-codex/gpt-6-luna bash-read-edit `select-one-1000-plain#2`: mismatch — changed cases.test.ts (first difference at line 5499)
- edit openai-codex/gpt-6-luna no-ls-find `multi-file-1-unicode#2`: mismatch — changed cases/part-001.test.ts (first difference at line 1)
- edit openai-codex/gpt-6-luna bash-read-edit `select-subset-1000-unicode#2`: mismatch — changed cases.test.ts (first difference at line 11006, trailing newline only)
- edit openai-codex/gpt-6-luna pi-edit `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 87, trailing newline only)
- edit openai-codex/gpt-6-luna pi-read `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 8)
- edit openai-codex/gpt-6-luna pi-read-edit `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 8)
- edit openai-codex/gpt-6-luna bash-read-edit `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 8)
- edit openai-codex/gpt-6-luna stock `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 8)
- edit anthropic-cc/claude-sonnet-5-5 pi-read-edit `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 8)
- edit anthropic-cc/claude-sonnet-5-5 pi-edit `delete-subset-10-plain#2`: mismatch — changed cases.test.ts (first difference at line 9)
- edit openai-codex/gpt-6-luna bash-read-edit `insert-subset-100-unicode#2`: mismatch — changed cases.test.ts (first difference at line 17)
- edit openai-codex/gpt-6-luna stock `delete-block-10-plain#2`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-edit `delete-block-10-plain#2`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-read-edit `delete-block-10-plain#2`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna bash-read-edit `delete-block-10-plain#2`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-edit `move-block-1000-unicode#2`: mismatch — changed blocks.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna bash-read-edit `move-block-1000-unicode#2`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna stock `copy-block-100-unicode#2`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read-edit `copy-block-100-unicode#2`: mismatch — changed target.test.ts (first difference at line 127, trailing newline only)
- edit anthropic-cc/claude-sonnet-5-5 no-ls-find `copy-block-100-unicode#2`: mismatch — changed target.test.ts (first difference at line 122)
- edit anthropic-cc/claude-sonnet-5-5 pi-edit `insert-block-100-unicode#2`: mismatch — changed blocks.test.ts (first difference at line 128)
- edit anthropic-cc/claude-sonnet-5-5 pi-read-edit `insert-block-100-unicode#2`: mismatch — changed blocks.test.ts (first difference at line 128)
- edit openai-codex/gpt-6-luna pi-read `insert-payload-1000-unicode#2`: mismatch — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna stock `insert-payload-1000-unicode#2`: mismatch — changed blocks.test.ts (first difference at line 22)
- edit openai-codex/gpt-6-luna pi-edit `insert-payload-1000-unicode#2`: timeout — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna pi-read-edit `insert-payload-1000-unicode#2`: timeout — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna no-ls-find `insert-payload-1000-unicode#2`: timeout — changed blocks.test.ts (first difference at line 20)
- edit openai-codex/gpt-6-luna bash-read-edit `copy-within-100-plain#2`: mismatch — changed blocks.test.ts (first difference at line 21)
- edit openai-codex/gpt-6-luna pi-edit `copy-within-100-plain#2`: mismatch — changed blocks.test.ts (first difference at line 140)
- edit openai-codex/gpt-6-luna pi-read-edit `copy-within-100-plain#2`: mismatch — changed blocks.test.ts (first difference at line 140)
- edit openai-codex/gpt-6-luna stock `move-between-1000-unicode#2`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read-edit `move-between-1000-unicode#2`: mismatch — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna bash-read-edit `move-between-1000-unicode#2`: mismatch — changed source.test.ts (first difference at line 30, trailing newline only)
- edit openai-codex/gpt-6-luna bash-read-edit `unicode-fix-1-cyrillic-a-unicode#2`: mismatch — changed sample.txt (first difference at line 2)
- edit openai-codex/gpt-6-luna no-ls-find `move-between-1000-unicode#2`: timeout — changed target.test.ts (first difference at line 19)
- edit openai-codex/gpt-6-luna pi-read `move-between-1000-unicode#2`: timeout — changed target.test.ts (first difference at line 19)
