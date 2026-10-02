# Benchmarking edits

How `pi-hashline-readmap` measures edit accuracy.

[Back to README](../README.md)

## Deterministic scenarios (`npm test`)

`tests/edit-scenarios.test.ts` replays the 34 scenarios of [pi-edit-benchmark](https://github.com/YuGiMob/pi-edit-benchmark) at the tool level: fixed fixtures, the anchored edit a careful model would issue, and staleness cases that change the file between the read and the edit. Calls go through the extension entry point, so the `tool_result` hooks that track what the model was shown run as they do in Pi. No model is involved.

## Explicit Edit tasks with a real model

[Explicit Edit](https://github.com/alexshpunt/explicit-edit-benchmark) has 226 deterministic, byte-exact editing tasks. Its official runs need Linux and Bubblewrap; `scripts/bench/explicit-edit.mjs` runs the same tasks on macOS through headless Pi, for comparing versions of this extension. Results are not publishable to the benchmark dataset.

```sh
# 2 tasks per family (42 tasks), three arms, local Ollama model
node scripts/bench/explicit-edit.mjs --model ollama/qwen3:4b

# Haiku through the anthropic-cc provider, two arms, selected tasks
node scripts/bench/explicit-edit.mjs --model anthropic-cc/claude-haiku-4-5 \
  --arms ref:main,working --tasks unique-100-plain,delete-block-10-plain
```

Arms:

| Arm | Loads |
|---|---|
| `pi-default` | Pi's built-in tools only |
| `working` | this checkout's `index.ts` |
| `ref:<git-ref>` | a `git archive` snapshot of that ref under `tmp/bench-arms/` |

Each run starts Pi with `--no-extensions --no-skills --no-prompt-templates --no-context-files`, loads only the arm and the model provider extension, and checks the whole workspace byte for byte against the benchmark's expected tree. Arms are interleaved per task so provider drift affects all arms alike. A run fails if the model that answered differs from `--model`.

Output goes to `tmp/bench-results/<timestamp>/`: `results.jsonl` (one line per run, appended as it goes; `--resume` continues from it), `run.json`, and `traces/<arm>/<task>#<n>.jsonl` (the full Pi event stream of each run), and `summary.md` with pass rates, tool calls, tokens, cost, per-family results, and the tasks where arms disagree.

Model providers:

- `ollama/<model>` loads `scripts/bench/ollama-provider.ts` (set `BENCH_OLLAMA_MODELS` for models other than `qwen3:4b`). Ollama's OpenAI endpoint does not reliably disable qwen3 thinking, so expect minutes per task.
- `anthropic-cc/<model>` loads `../pi-claude-header/src/index.ts`; pass `--provider-extension PATH` for another location or provider.

Repeated runs of the same configuration differ by about two percentage points on the public leaderboard, so treat smaller differences as noise and confirm with `--repeat` or more tasks.
