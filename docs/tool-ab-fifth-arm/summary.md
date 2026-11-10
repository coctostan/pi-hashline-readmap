# Tool arms A/B — openai-codex/gpt-6-luna, anthropic-cc/claude-sonnet-5-5

Pi 1.5.0 on 2026-11-09; arms no-ls-find, no-ls-find-grep, bash-grep-anchors; 2 repeat(s); spent $2.6147 of $10.
Each cell is the mean per run; Δ is the spread, the largest minus the smallest per-repeat mean. Errors include rejected calls; calls before touch counts runs that edited.

| Set | Model | Arm | Pass | Rate | Input tokens | Cost | Tool calls | Errors | Rejected | Redundant | Wrong tool | Calls before touch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| locate | openai-codex/gpt-6-luna | no-ls-find | 19/20 | 95.0% Δ10.0 | 59199 Δ23719 | $0.0025 Δ0.0002 | 7.0 Δ0.7 | 0.85 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.9 Δ0.5 |
| locate | openai-codex/gpt-6-luna | no-ls-find-grep | 19/20 | 95.0% Δ10.0 | 121367 Δ67768 | $0.0039 Δ0.0016 | 8.1 Δ1.8 | 1.30 Δ0.80 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.10 Δ0.20 | 1.6 Δ1.5 |
| locate | openai-codex/gpt-6-luna | bash-grep-anchors | 19/20 | 95.0% Δ10.0 | 103688 Δ32488 | $0.0035 Δ0.0005 | 7.5 Δ0.8 | 1.10 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.8 Δ0.2 |
| locate | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 20/20 | 100.0% Δ0.0 | 43146 Δ1762 | $0.0411 Δ0.0012 | 4.3 Δ0.1 | 0.15 Δ0.30 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.20 Δ0.40 | 0.3 Δ0.0 |
| locate | anthropic-cc/claude-sonnet-5-5 | no-ls-find-grep | 20/20 | 100.0% Δ0.0 | 35317 Δ5392 | $0.0304 Δ0.0040 | 4.7 Δ0.6 | 0.30 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.15 Δ0.30 | 1.0 Δ0.0 |
| locate | anthropic-cc/claude-sonnet-5-5 | bash-grep-anchors | 20/20 | 100.0% Δ0.0 | 38973 Δ5046 | $0.0329 Δ0.0001 | 4.5 Δ0.2 | 0.30 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.05 Δ0.10 | 1.1 Δ0.1 |
| edit | openai-codex/gpt-6-luna | no-ls-find | 5/6 | 83.3% Δ33.3 | 22677 Δ18696 | $0.0014 Δ0.0009 | 3.7 Δ0.7 | 0.17 Δ0.33 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.2 Δ0.3 |
| edit | openai-codex/gpt-6-luna | no-ls-find-grep | 4/6 | 66.7% Δ0.0 | 28291 Δ20322 | $0.0014 Δ0.0008 | 3.8 Δ1.0 | 0.50 Δ0.33 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |
| edit | openai-codex/gpt-6-luna | bash-grep-anchors | 5/6 | 83.3% Δ33.3 | 29984 Δ8380 | $0.0017 Δ0.0004 | 3.0 Δ0.7 | 0.67 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 6/6 | 100.0% Δ0.0 | 21422 Δ391 | $0.0164 Δ0.0014 | 2.3 Δ0.0 | 0.33 Δ0.67 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.33 Δ0.67 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | no-ls-find-grep | 6/6 | 100.0% Δ0.0 | 17675 Δ3851 | $0.0165 Δ0.0017 | 2.0 Δ0.7 | 0.50 Δ0.33 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | bash-grep-anchors | 6/6 | 100.0% Δ0.0 | 20760 Δ1473 | $0.0172 Δ0.0007 | 2.5 Δ0.3 | 0.33 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |

## Failed runs (7)

- locate openai-codex/gpt-6-luna no-ls-find-grep `ls-default-limit#1`: check — documented default is 1000: got false, want true
- locate openai-codex/gpt-6-luna bash-grep-anchors `find-stat-concurrency#1`: check — checker threw: ParseError: Identifier 'DEFAULT_STAT_CONCURRENCY' has already been declared.  
 /var/folders/gw/8yg8rbgd0r7fx_7mlssdcg6c0000gn/T/tool-ab-ER6xRK/src/find-stat.ts:5:13
- locate openai-codex/gpt-6-luna no-ls-find `markdown-extension#1`: timeout — .markdown: got null, want {"id":"markdown","name":"Markdown"}
- edit openai-codex/gpt-6-luna no-ls-find-grep `multi-file-1-unicode#1`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna bash-grep-anchors `multi-file-1-unicode#1`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna no-ls-find `multi-file-1-unicode#1`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna no-ls-find-grep `multi-file-1-unicode#2`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
