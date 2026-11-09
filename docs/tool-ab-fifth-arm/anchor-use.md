| model | arm | runs | bash grep results anchored | edits | anchored edits | anchors only from bash | edits with no prior read | runs with such an edit |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| anthropic-cc_claude-sonnet-5-5 | bash-grep-anchors | 26 | 46 | 23 | 9 | 5 | 13 | 11 |
| anthropic-cc_claude-sonnet-5-5 | no-ls-find | 26 | 0 | 36 | 26 | 0 | 25 | 16 |
| anthropic-cc_claude-sonnet-5-5 | no-ls-find-grep | 26 | 0 | 23 | 3 | 0 | 15 | 13 |
| openai-codex_gpt-6-luna | bash-grep-anchors | 26 | 33 | 50 | 31 | 0 | 5 | 3 |
| openai-codex_gpt-6-luna | no-ls-find | 26 | 0 | 39 | 26 | 0 | 9 | 6 |
| openai-codex_gpt-6-luna | no-ls-find-grep | 26 | 0 | 45 | 27 | 0 | 4 | 3 |
