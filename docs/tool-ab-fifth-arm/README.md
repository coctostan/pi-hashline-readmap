# Fifth arm, 2026-11-09

The run of slice 10 (A fifth arm rules on grep) of tools-vs-bash (Each search tool earns its place over bash), summarized in [Tool cost](../tool-cost.md#fifth-arm-2026-11-09). The traces stay on the owner's machine under `tmp/bench-results/tool-ab-fifth-arm/traces/`; these files are the rest of the run and the analysis on it.

```sh
node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna,anthropic-cc/claude-sonnet-5-5 \
  --arms no-ls-find,no-ls-find-grep,bash-grep-anchors --max-cost 10 --concurrency 3 \
  --out tmp/bench-results/tool-ab-fifth-arm
```

| file | what |
|---|---|
| `run.json`, `results.jsonl`, `summary.md` | the harness's own output, unedited |
| `verdict.md` | ruling 0008's rule on three pairs, all 13 tasks (`node verdict.mjs <out>`); the first pair, the `grep` tool against anchored bash grep, is the ruled one |
| `errors-by-tool.md` | calls, errors, rejected calls and wrong-tool picks per model, arm and tool (`node ../tool-ab-pilot/errors.mjs <out>`, run from `docs/tool-ab-pilot/`) |
| `anchor-use.md` | per model and arm, anchored bash grep results, edits, edits by an anchor only a bash grep had shown, and edits of a file never read (`node anchor-use.mjs <out>`) |
| `review-notes.md`, `review-key.json` | the blind review: 5 (task, model, repeat) draws by `sample.mjs` (seed 7, the pilot's draws), each in all 3 arms, read under shuffled ids; the notes were written before the key was opened |

The scripts are the record of how the tables were made, not maintained tools; they import `scripts/bench/` by a relative path, so run them from this directory.
