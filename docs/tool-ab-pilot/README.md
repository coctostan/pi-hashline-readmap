# Tool arms pilot, 2026-11-05

The pilot of slice 7 (Pilot proposes a ruling) of tools-vs-bash (Each search tool earns its place over bash), summarized in [Tool cost](../tool-cost.md#pilot-2026-11-05). The traces (140 MB) stay on the owner's machine under `tmp/bench-results/tool-ab-pilot/traces/`; these files are the rest of the run and the analysis on it.

```sh
node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --max-cost 18 --concurrency 3 --out tmp/bench-results/tool-ab-pilot
```

| file | what |
|---|---|
| `run.json`, `results.jsonl`, `summary.md` | the harness's own output, unedited |
| `verdict.md` | the rule applied with `ls-default-limit` left out of every arm (`node verdict.mjs <out> ls-default-limit`) |
| `verdict-all-runs.md` | the same over all 13 tasks (`node verdict.mjs <out>`) |
| `errors-by-tool.md` | calls, errors, rejected calls and wrong-tool picks per model, arm and tool, bash split into test commands and the rest (`node errors.mjs <out>`) |
| `review-notes.md`, `review-key.json` | the blind review: 5 (task, model, repeat) draws by `sample.mjs` (seed 7), each in all 4 arms, read under shuffled ids; the notes were written before the key was opened |

The three scripts are the record of how the tables were made, not maintained tools; they import `scripts/bench/` by a relative path, so run them from this directory.

`verdict.mjs`'s rule: per task set and model, a pair of arms differing by the ruled tools (`extension` against `no-ls-find` for `ls` and `find`, `no-ls-find` against `no-ls-find-grep` for `grep`) is compared on each metric's mean per run; a gap counts only when it is larger than both arms' repeat spreads (Δ in `summary.md`). Pass rate is better higher, the rest lower. Tool calls are shown but not judged, since the shape names pass rate, tokens and the confusion signals.
