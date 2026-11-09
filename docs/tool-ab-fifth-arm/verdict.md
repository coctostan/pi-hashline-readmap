| pair | set | model | metric | with | without | gap | bar | verdict |
|---|---|---|---|---:|---:|---:|---:|---|
| grep tool over anchors | locate | openai-codex/gpt-6-luna | pass | 0.95 | 0.95 | 0 | 0.1 | tie |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | inputTokens | 59199 | 103688 | -44490 | 32488 | with wins |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | cost | 0.003 | 0.004 | -0.001 | 0.001 | with wins |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | errors | 0.85 | 1.1 | -0.25 | 0.2 | with wins |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 0.947 | 0.8 | 0.147 | 0.533 | tie |
| grep tool over anchors | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 7.05 | 7.5 | -0.45 | 0.8 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 43146 | 38973 | 4173 | 5046 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.041 | 0.033 | 0.008 | 0.001 | with loses |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.15 | 0.3 | -0.15 | 0.3 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.2 | 0.05 | 0.15 | 0.4 | tie |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0.316 | 1.067 | -0.751 | 0.143 | with wins |
| grep tool over anchors | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 4.25 | 4.5 | -0.25 | 0.2 | with wins |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | pass | 0.833 | 0.833 | 0 | 0.333 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | inputTokens | 22677 | 29984 | -7307 | 18696 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | cost | 0.001 | 0.002 | -0 | 0.001 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | errors | 0.167 | 0.667 | -0.5 | 0.333 | with wins |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | callsBeforeTouch | 0.2 | 0 | 0.2 | 0.333 | tie |
| grep tool over anchors | edit | openai-codex/gpt-6-luna | toolCalls (not judged) | 3.667 | 3 | 0.667 | 0.667 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | inputTokens | 21422 | 20760 | 663 | 1473 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | cost | 0.016 | 0.017 | -0.001 | 0.001 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | errors | 0.333 | 0.333 | 0 | 0.667 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.333 | 0 | 0.333 | 0.667 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0 | 0 | 0 | 0 | tie |
| grep tool over anchors | edit | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 2.333 | 2.5 | -0.167 | 0.333 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | pass | 0.95 | 0.95 | 0 | 0.1 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | inputTokens | 103688 | 121367 | -17678 | 67768 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | cost | 0.004 | 0.004 | -0 | 0.002 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | errors | 1.1 | 1.3 | -0.2 | 0.8 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0.1 | -0.1 | 0.2 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 0.8 | 1.65 | -0.85 | 1.5 | tie |
| anchors over plain bash | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 7.5 | 8.1 | -0.6 | 1.8 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 38973 | 35317 | 3656 | 5392 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.033 | 0.03 | 0.002 | 0.004 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.3 | 0.3 | 0 | 0.2 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.05 | 0.15 | -0.1 | 0.3 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 1.067 | 1 | 0.067 | 0.143 | tie |
| anchors over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 4.5 | 4.7 | -0.2 | 0.6 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | pass | 0.833 | 0.667 | 0.167 | 0.333 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | inputTokens | 29984 | 28291 | 1693 | 20322 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | cost | 0.002 | 0.001 | 0 | 0.001 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | errors | 0.667 | 0.5 | 0.167 | 0.333 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | callsBeforeTouch | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | openai-codex/gpt-6-luna | toolCalls (not judged) | 3 | 3.833 | -0.833 | 1 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | inputTokens | 20760 | 17675 | 3085 | 3851 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | cost | 0.017 | 0.016 | 0.001 | 0.002 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | errors | 0.333 | 0.5 | -0.167 | 0.333 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0 | 0 | 0 | 0 | tie |
| anchors over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 2.5 | 2 | 0.5 | 0.667 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | pass | 0.95 | 0.95 | 0 | 0.1 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | inputTokens | 59199 | 121367 | -62168 | 67768 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | cost | 0.003 | 0.004 | -0.001 | 0.002 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | errors | 0.85 | 1.3 | -0.45 | 0.8 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | wrongTool | 0 | 0.1 | -0.1 | 0.2 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | callsBeforeTouch | 0.947 | 1.65 | -0.703 | 1.5 | tie |
| grep tool over plain bash | locate | openai-codex/gpt-6-luna | toolCalls (not judged) | 7.05 | 8.1 | -1.05 | 1.8 | tie |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | inputTokens | 43146 | 35317 | 7829 | 5392 | with loses |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | cost | 0.041 | 0.03 | 0.011 | 0.004 | with loses |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | errors | 0.15 | 0.3 | -0.15 | 0.3 | tie |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.2 | 0.15 | 0.05 | 0.4 | tie |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0.316 | 1 | -0.684 | 0.033 | with wins |
| grep tool over plain bash | locate | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 4.25 | 4.7 | -0.45 | 0.6 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | pass | 0.833 | 0.667 | 0.167 | 0.333 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | inputTokens | 22677 | 28291 | -5614 | 20322 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | cost | 0.001 | 0.001 | 0 | 0.001 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | errors | 0.167 | 0.5 | -0.333 | 0.333 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | wrongTool | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | callsBeforeTouch | 0.2 | 0 | 0.2 | 0.333 | tie |
| grep tool over plain bash | edit | openai-codex/gpt-6-luna | toolCalls (not judged) | 3.667 | 3.833 | -0.167 | 1 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | pass | 1 | 1 | 0 | 0 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | inputTokens | 21422 | 17675 | 3748 | 3851 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | cost | 0.016 | 0.016 | -0 | 0.002 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | errors | 0.333 | 0.5 | -0.167 | 0.667 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | rejected | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | redundant | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | wrongTool | 0.333 | 0 | 0.333 | 0.667 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | callsBeforeTouch | 0 | 0 | 0 | 0 | tie |
| grep tool over plain bash | edit | anthropic-cc/claude-sonnet-5-5 | toolCalls (not judged) | 2.333 | 2 | 0.333 | 0.667 | tie |
