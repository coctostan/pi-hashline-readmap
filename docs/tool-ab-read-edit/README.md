# Read and edit, 2026-11-19

The run of slice 5 (Read and edit run is recorded) of read-edit-ab (Read and edit are measured against the alternatives), summarized in [Tool cost](../tool-cost.md#read-and-edit-2026-11-19). The traces stay on the owner's machine under `tmp/bench-results/tool-ab-read-edit/traces/`; these files are the rest of the run and the analysis on it.

```sh
caffeinate -i node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --arms stock,no-ls-find,pi-edit,pi-read,pi-read-edit,bash-read-edit --tasks locate,edit-sample \
  --repeat 2 --max-cost 20 --concurrency 3 --out tmp/bench-results/tool-ab-read-edit
```

| file | what |
|---|---|
| `run.json`, `results.jsonl`, `summary.md` | the harness's own output, unedited; `summary.md` holds the edit-failure breakdown |
| `table.md` | per set, model and arm, the mean and spread of pass rate, input and output tokens, cost, wall time and calls before the first touch; then passes per task wherever a run failed (`node table.mjs <out>`) |
| `gaps.md` | rulings 0008's and 0009's spread rule, reported, not ruled: `no-ls-find` against each other arm, each gap beyond both arms' spreads (`node gaps.mjs <out>`) |
| `errors-by-tool.md` | calls, errors, rejected calls and wrong-tool picks per model, arm and tool (`node ../tool-ab-pilot/errors.mjs <out>`, run from this directory) |
| `errors-table.md` | per set, model, arm and tool, the mean errors per run and the spread between the repeats' means, over the traces (`node errors-table.mjs <out>`) |
| `review-notes.md`, `review-key.json` | the blind review: 5 (task, model, repeat) draws over both task sets by `sample.mjs` (seed 7), each in all 6 arms, read under shuffled ids; the notes before "After unblinding" were written before the key was opened |

The scripts are the record of how the tables were made, not maintained tools; they import `scripts/bench/` by a relative path, so run them from this directory.
