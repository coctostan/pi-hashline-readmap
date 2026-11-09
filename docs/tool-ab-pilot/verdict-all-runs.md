| tool | set | model | metric | with | without | gap | bar | verdict |
|---|---|---|---|---:|---:|---:|---:|---|
| ls+find | locate | openai-codex/gpt-6-luna | pass | 0.95 | 1 | -0.05 | 0.1 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | inputTokens | 72509 | 64717 | 7792 | 5850 | tool loses |
| ls+find | locate | openai-codex/gpt-6-luna | cost | 0.003 | 0.003 | -0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | errors | 0.95 | 1.1 | -0.15 | 0.4 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | rejected | 0.05 | 0 | 0.05 | 0.1 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 0.9 | 1.2 | -0.3 | 0.2 | tool wins |
| ls+find | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 8.45 | 7.1 | 1.35 | 1.1 | tool loses |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 46008 | 39089 | 6919 | 6595 | tool loses |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.041 | 0.039 | 0.002 | 0.01 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.15 | 0.05 | 0.1 | 0.1 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0 | 0.25 | -0.25 | 0.1 | tool wins |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0.35 | 0.412 | -0.062 | 0.1 | tie |
| ls+find | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 4.3 | 3.9 | 0.4 | 1.4 | tie |
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
| grep | locate | openai-codex/gpt-6-luna | inputTokens | 64717 | 110596 | -45879 | 26232 | tool wins |
| grep | locate | openai-codex/gpt-6-luna | cost | 0.003 | 0.003 | -0.001 | 0.001 | tool wins |
| grep | locate | openai-codex/gpt-6-luna | errors | 1.1 | 1.4 | -0.3 | 0.4 | tie |
| grep | locate | openai-codex/gpt-6-luna | rejected | 0 | 0.05 | -0.05 | 0.1 | tie |
| grep | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| grep | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 1.2 | 1.8 | -0.6 | 0.2 | tool wins |
| grep | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 7.1 | 9.15 | -2.05 | 1.1 | tool wins |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 39089 | 41456 | -2366 | 6595 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.039 | 0.034 | 0.005 | 0.01 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.05 | 0.1 | -0.05 | 0.1 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0.05 | -0.05 | 0.1 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.25 | 0.1 | 0.15 | 0.2 | tie |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0.412 | 1.214 | -0.803 | 0.429 | tool wins |
| grep | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 3.9 | 4.95 | -1.05 | 1.4 | tie |
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
