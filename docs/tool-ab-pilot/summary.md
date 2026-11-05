# Tool arms A/B — openai-codex/gpt-6-luna, anthropic-cc/claude-sonnet-5-5

Pi 1.5.0; arms stock, extension, no-ls-find, no-ls-find-grep; 2 repeat(s); spent $3.4812 of $18.
Each cell is the mean per run; Δ is the spread, the largest minus the smallest per-repeat mean. Errors include rejected calls; calls before touch counts runs that edited.

| Set | Model | Arm | Pass | Rate | Input tokens | Cost | Tool calls | Errors | Rejected | Redundant | Wrong tool | Calls before touch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| locate | openai-codex/gpt-6-luna | stock | 19/20 | 95.0% Δ10.0 | 102746 Δ7614 | $0.0033 Δ0.0004 | 7.3 Δ0.1 | 0.70 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.40 Δ0.20 | 0.7 Δ0.5 |
| locate | openai-codex/gpt-6-luna | extension | 19/20 | 95.0% Δ10.0 | 72509 Δ5850 | $0.0026 Δ0.0003 | 8.4 Δ1.1 | 0.95 Δ0.10 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.9 Δ0.2 |
| locate | openai-codex/gpt-6-luna | no-ls-find | 20/20 | 100.0% Δ0.0 | 64717 Δ2445 | $0.0026 Δ0.0004 | 7.1 Δ0.8 | 1.10 Δ0.40 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.2 Δ0.0 |
| locate | openai-codex/gpt-6-luna | no-ls-find-grep | 20/20 | 100.0% Δ0.0 | 110596 Δ26232 | $0.0034 Δ0.0006 | 9.2 Δ1.1 | 1.40 Δ0.20 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 1.8 Δ0.2 |
| locate | anthropic-cc/claude-sonnet-5-5 | stock | 20/20 | 100.0% Δ0.0 | 22486 Δ562 | $0.0282 Δ0.0018 | 4.0 Δ0.0 | 0.30 Δ0.20 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.25 Δ0.10 | 0.3 Δ0.1 |
| locate | anthropic-cc/claude-sonnet-5-5 | extension | 20/20 | 100.0% Δ0.0 | 46008 Δ4502 | $0.0407 Δ0.0070 | 4.3 Δ0.2 | 0.15 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.3 Δ0.1 |
| locate | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 20/20 | 100.0% Δ0.0 | 39089 Δ6595 | $0.0390 Δ0.0102 | 3.9 Δ1.4 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.25 Δ0.10 | 0.4 Δ0.0 |
| locate | anthropic-cc/claude-sonnet-5-5 | no-ls-find-grep | 20/20 | 100.0% Δ0.0 | 41456 Δ6571 | $0.0340 Δ0.0053 | 5.0 Δ1.3 | 0.10 Δ0.00 | 0.05 Δ0.10 | 0.00 Δ0.00 | 0.10 Δ0.20 | 1.2 Δ0.4 |
| edit | openai-codex/gpt-6-luna | stock | 5/6 | 83.3% Δ33.3 | 10366 Δ11171 | $0.0008 Δ0.0006 | 2.2 Δ0.3 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |
| edit | openai-codex/gpt-6-luna | extension | 5/6 | 83.3% Δ33.3 | 36582 Δ37139 | $0.0016 Δ0.0013 | 4.0 Δ0.7 | 0.17 Δ0.33 | 0.00 Δ0.00 | 0.17 Δ0.33 | 0.00 Δ0.00 | 0.0 Δ0.0 |
| edit | openai-codex/gpt-6-luna | no-ls-find | 6/6 | 100.0% Δ0.0 | 11771 Δ146 | $0.0008 Δ0.0001 | 3.0 Δ0.0 | 0.17 Δ0.33 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.3 Δ0.7 |
| edit | openai-codex/gpt-6-luna | no-ls-find-grep | 4/6 | 66.7% Δ0.0 | 30093 Δ2696 | $0.0017 Δ0.0001 | 4.3 Δ0.0 | 0.50 Δ0.33 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | stock | 6/6 | 100.0% Δ0.0 | 7495 Δ154 | $0.0109 Δ0.0003 | 1.7 Δ0.0 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.33 Δ0.00 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | extension | 6/6 | 100.0% Δ0.0 | 26136 Δ2710 | $0.0179 Δ0.0012 | 2.5 Δ0.3 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.33 Δ0.67 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | no-ls-find | 6/6 | 100.0% Δ0.0 | 21742 Δ4872 | $0.0166 Δ0.0032 | 2.3 Δ0.7 | 0.50 Δ0.33 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.33 Δ0.00 | 0.0 Δ0.0 |
| edit | anthropic-cc/claude-sonnet-5-5 | no-ls-find-grep | 6/6 | 100.0% Δ0.0 | 20703 Δ6544 | $0.0172 Δ0.0031 | 2.5 Δ1.0 | 0.50 Δ1.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.00 Δ0.00 | 0.0 Δ0.0 |

## Failed runs (6)

- locate openai-codex/gpt-6-luna extension `ls-default-limit#1`: check — code default is 1000: got false, want true
- locate openai-codex/gpt-6-luna stock `ls-default-limit#1`: check — documented default is 1000: got false, want true
- edit openai-codex/gpt-6-luna stock `multi-file-1-unicode#1`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna no-ls-find-grep `multi-file-1-unicode#1`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna extension `multi-file-1-unicode#2`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
- edit openai-codex/gpt-6-luna no-ls-find-grep `multi-file-1-unicode#2`: mismatch — changed cases/part-001.test.ts (first difference at line 10)
