| tool | set | model | metric | with | without | gap | bar | verdict |
|---|---|---|---|---:|---:|---:|---:|---|
| ls+find | locate | openai-codex/gpt-6-luna | pass | 1 | 1 | 0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | inputTokens | 62465 | 60289 | 2177 | 6862 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | cost | 0.002 | 0.003 | -0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | errors | 0.889 | 1.056 | -0.167 | 0.333 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | rejected | 0.056 | 0 | 0.056 | 0.111 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 0.944 | 1.278 | -0.333 | 0.111 | tool wins |
| ls+find | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 7.889 | 7 | 0.889 | 1.333 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 43287 | 36801 | 6486 | 3023 | tool loses |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.037 | 0.037 | 0.001 | 0.007 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.167 | 0.056 | 0.111 | 0.111 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0 | 0.222 | -0.222 | 0 | tool wins |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0.389 | 0.438 | -0.049 | 0.111 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 4.111 | 3.722 | 0.389 | 1 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | pass | 0.833 | 1 | -0.167 | 0.333 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | inputTokens | 36582 | 11771 | 24811 | 37139 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | cost | 0.002 | 0.001 | 0.001 | 0.001 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | errors | 0.167 | 0.167 | 0 | 0.333 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | redundant | 0.167 | 0 | 0.167 | 0.333 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | callsBeforeTouch | 0 | 0.333 | -0.333 | 0.667 | tie |
| ls+find | edit | openai-codex/gpt-6-luna | toolCalls (not judged) | 4 | 3 | 1 | 0.667 | tool loses |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | inputTokens | 26136 | 21742 | 4394 | 4872 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | cost | 0.018 | 0.017 | 0.001 | 0.003 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | errors | 0 | 0.5 | -0.5 | 0.333 | tool wins |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.333 | 0.333 | 0 | 0.667 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0 | 0 | 0 | 0 | tie |
| ls+find | edit | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 2.5 | 2.333 | 0.167 | 0.667 | tie |
| grep | locate | openai-codex/gpt-6-luna | pass | 1 | 1 | 0 | 0 | tie |
| grep | locate | openai-codex/gpt-6-luna | inputTokens | 60289 | 95591 | -35302 | 21440 | tool wins |
| grep | locate | openai-codex/gpt-6-luna | cost | 0.003 | 0.003 | -0.001 | 0.001 | tool wins |
| grep | locate | openai-codex/gpt-6-luna | errors | 1.056 | 1.333 | -0.278 | 0.333 | tie |
| grep | locate | openai-codex/gpt-6-luna | rejected | 0 | 0.056 | -0.056 | 0.111 | tie |
| grep | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| grep | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 1.278 | 1.889 | -0.611 | 0.111 | tool wins |
| grep | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 7 | 8.667 | -1.667 | 1.333 | tool wins |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 36801 | 34820 | 1982 | 6782 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.037 | 0.03 | 0.007 | 0.007 | tool loses |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.056 | 0.111 | -0.056 | 0.111 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0.056 | -0.056 | 0.111 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.222 | 0.056 | 0.167 | 0.111 | tool loses |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0.438 | 1.083 | -0.646 | 0.5 | tool wins |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 3.722 | 4.5 | -0.778 | 1 | tie |
| grep | edit | openai-codex/gpt-6-luna | pass | 1 | 0.667 | 0.333 | 0 | tool wins |
| grep | edit | openai-codex/gpt-6-luna | inputTokens | 11771 | 30093 | -18322 | 2696 | tool wins |
| grep | edit | openai-codex/gpt-6-luna | cost | 0.001 | 0.002 | -0.001 | 0 | tool wins |
| grep | edit | openai-codex/gpt-6-luna | errors | 0.167 | 0.5 | -0.333 | 0.333 | tie |
| grep | edit | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| grep | edit | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep | edit | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| grep | edit | openai-codex/gpt-6-luna | callsBeforeTouch | 0.333 | 0 | 0.333 | 0.667 | tie |
| grep | edit | openai-codex/gpt-6-luna | toolCalls (not judged) | 3 | 4.333 | -1.333 | 0 | tool wins |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | inputTokens | 21742 | 20703 | 1039 | 6544 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | cost | 0.017 | 0.017 | -0.001 | 0.003 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | errors | 0.5 | 0.5 | 0 | 1 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.333 | 0 | 0.333 | 0 | tool loses |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0 | 0 | 0 | 0 | tie |
| grep | edit | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 2.333 | 2.5 | -0.167 | 1 | tie |
