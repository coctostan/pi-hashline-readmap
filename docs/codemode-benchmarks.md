# Codemode workflow measurements

Deterministic, credential-free evidence for equivalent tool workflows—not model-performance evidence or a proposal to change defaults. See [tested recipes](codemode-recipes.md) and [independent-host provisioning](../AGENTS.md#independent-current-host-compatibility).

## Reproduce

Run `npm ci` in this maintainer checkout (Node baseline: >=22.19.0), then provision the complete pinned Pi graph (currently 1.2.0) as documented in AGENTS.md. For this command, use the issue-owned prefix `tmp/pi-265-host` rather than AGENTS.md's temporary prefix, or deliberately adjust PI_COMPAT_HOST to your exact installation:

~~~bash
PI_COMPAT_HOST="$PWD/tmp/pi-265-host/node_modules/@earendil-works/pi-coding-agent" PI_CODEMODE_BENCH_ITERATIONS=3 node scripts/benchmark-codemode.mjs
~~~

The host must be exactly the pinned Pi version (see `scripts/pi-compat-host.mjs`) with its codemode executor; no implicit locked-host fallback, global Pi, provider, or credentials are used. This is a maintainer checkout-only harness, not a CLI installed with the published extension. It requires the checkout's tests/helpers and documentation. The benchmark creates isolated files/images and cleans only its own temporary artifacts; it does not change user settings.

## Recorded run

- Run: 2026-10-11, completed at 21:40:05 UTC.
- Git HEAD: `423f6421acc0af5149389d835430c394872d98ee`, with the issue #265 working-tree changes (including the benchmark) applied; HEAD alone does not contain this harness.
- Selected host: Pi 1.1.0 (the pinned lane at the time; not re-recorded for later pins), explicitly installed at the checkout-local path recorded below.
- Node: v26.7.0; OS/architecture: Darwin 25.6.0 / arm64 (queried alongside the report).
- Three cold-process samples per workflow/mode: 12 rows total, no warm-process/VM lane.

Date, git HEAD, and OS/architecture were captured alongside the report; host, Node, fixtures, and measurements come from its actual JSON. The absolute host path below is provenance, not a portable installation example.

## Results

| Mode | Declaration bytes | Estimated declaration tokens |
|---|---:|---:|
| on (direct tools plus codemode) | 15147 | 3786.25 |
| only (codemode declaration) | 13095 | 3273.75 |

Ranges are min / median / max; with three samples the median is the middle sorted value. Times are milliseconds, rounded to three decimals. Invocation is the sum of recorded result elapsedMs: separate direct calls for on, the whole script invocation (including discovery/VM overhead) for only—not isolated nested-tool CPU time.

| Workflow | Mode | Samples | Output bytes (min/median/max) | Tool calls | Discovery calls | Discovery ms (min/median/max) | Process ms (min/median/max) | Invocation ms (min/median/max) | Setup/transport ms (min/median/max) | Correctness |
|---|---|---:|---|---:|---:|---|---|---|---|---|
| independent | on | 3 | 169 / 169 / 169 | 3 | 0 | 0.000 / 0.000 / 0.000 | 1053.492 / 1059.452 / 1076.624 | 17.810 / 18.861 / 19.105 | 1034.630 / 1041.641 / 1057.519 | pass |
| independent | only | 3 | 810 / 810 / 810 | 3 | 2 | 2.000 / 2.000 / 3.000 | 1067.308 / 1091.720 / 1111.336 | 55.600 / 56.519 / 59.066 | 1011.708 / 1035.201 / 1052.271 | pass |
| search-edit | on | 3 | 677 / 677 / 677 | 2 | 0 | 0.000 / 0.000 / 0.000 | 1043.335 / 1063.406 / 1110.933 | 39.231 / 40.475 / 43.568 | 1002.861 / 1024.175 / 1067.365 | pass |
| search-edit | only | 3 | 168 / 168 / 168 | 2 | 2 | 2.000 / 2.000 / 2.000 | 1082.534 / 1111.058 / 1111.636 | 76.980 / 77.054 / 77.771 | 1004.763 / 1034.005 / 1034.656 | pass |

Tool calls count native read/search/edit requests (including the expected missing-file failure); only-mode adds one outer codemode call per sample. Discovery counts are separate. All task summaries (after temporary-path normalization) and final inspected files matched before any successful row was reported.

<details>
<summary>Raw recorded JSON</summary>

~~~json
{
  "host": "/Users/maxwellnewman/pi/workspace/pi-hashline-readmap/tmp/pi-265-host/node_modules/@earendil-works/pi-coding-agent",
  "version": "1.1.0",
  "node": "v26.7.0",
  "iterations": 3,
  "command": "PI_COMPAT_HOST=\"/Users/maxwellnewman/pi/workspace/pi-hashline-readmap/tmp/pi-265-host/node_modules/@earendil-works/pi-coding-agent\" node scripts/benchmark-codemode.mjs",
  "fixtures": {
    "alpha.txt": "alpha\nbeta\n",
    "search.txt": "needle\n",
    "edit-target.txt": "TODO: change first\nKEEP\nTODO: leave this\n"
  },
  "methodology": {
    "normal": "Real direct tool pipeline under on loadout; independent requests intentionally executed as separate direct calls",
    "only": "Same work through tested documentation snippets under real only loadout; two awaited discovery calls",
    "declarations": "UTF-8 JSON bytes of model tool names/descriptions/parameter schemas; excludes system prompt and provider framing",
    "tokens": "Estimated declaration tokens = serialized declaration characters / 4; not provider-tokenizer counts",
    "output": "UTF-8 rendered text bytes, including host/notice framing; excludes structured JSON reports and binary images",
    "timing": "Milliseconds; each sample starts a fresh host process. No warm-process or warm-VM lane measured.",
    "overhead": "Separate process duration, invocation duration, setup/transport difference, tool counts and discovery counts/timing",
    "limits": "Deterministic credential-free fixtures, not model task quality, provider latency, cost, or a recommendation to change defaults"
  },
  "rows": [
    {
      "workflow": "independent",
      "mode": "on",
      "sample": 1,
      "correctness": true,
      "declarationBytes": 15147,
      "estimatedDeclarationTokens": 3786.25,
      "outputBytes": 169,
      "toolCalls": 3,
      "discoveryCalls": 0,
      "discoveryMs": 0,
      "outerCodemodeCalls": 0,
      "processMs": 1059.451667,
      "toolExecutionMs": 17.810374000000024,
      "setupAndTransportMs": 1041.6412930000001
    },
    {
      "workflow": "independent",
      "mode": "only",
      "sample": 1,
      "correctness": true,
      "declarationBytes": 13095,
      "estimatedDeclarationTokens": 3273.75,
      "outputBytes": 810,
      "toolCalls": 3,
      "discoveryCalls": 2,
      "discoveryMs": 3,
      "outerCodemodeCalls": 1,
      "processMs": 1111.3363330000002,
      "toolExecutionMs": 59.06570799999986,
      "setupAndTransportMs": 1052.2706250000003
    },
    {
      "workflow": "independent",
      "mode": "on",
      "sample": 2,
      "correctness": true,
      "declarationBytes": 15147,
      "estimatedDeclarationTokens": 3786.25,
      "outputBytes": 169,
      "toolCalls": 3,
      "discoveryCalls": 0,
      "discoveryMs": 0,
      "outerCodemodeCalls": 0,
      "processMs": 1076.623959,
      "toolExecutionMs": 19.104667000000063,
      "setupAndTransportMs": 1057.519292
    },
    {
      "workflow": "independent",
      "mode": "only",
      "sample": 2,
      "correctness": true,
      "declarationBytes": 13095,
      "estimatedDeclarationTokens": 3273.75,
      "outputBytes": 810,
      "toolCalls": 3,
      "discoveryCalls": 2,
      "discoveryMs": 2,
      "outerCodemodeCalls": 1,
      "processMs": 1067.3077909999997,
      "toolExecutionMs": 55.599583999999936,
      "setupAndTransportMs": 1011.7082069999998
    },
    {
      "workflow": "independent",
      "mode": "on",
      "sample": 3,
      "correctness": true,
      "declarationBytes": 15147,
      "estimatedDeclarationTokens": 3786.25,
      "outputBytes": 169,
      "toolCalls": 3,
      "discoveryCalls": 0,
      "discoveryMs": 0,
      "outerCodemodeCalls": 0,
      "processMs": 1053.4916250000006,
      "toolExecutionMs": 18.861417000000074,
      "setupAndTransportMs": 1034.6302080000005
    },
    {
      "workflow": "independent",
      "mode": "only",
      "sample": 3,
      "correctness": true,
      "declarationBytes": 13095,
      "estimatedDeclarationTokens": 3273.75,
      "outputBytes": 810,
      "toolCalls": 3,
      "discoveryCalls": 2,
      "discoveryMs": 2,
      "outerCodemodeCalls": 1,
      "processMs": 1091.7202079999997,
      "toolExecutionMs": 56.51883299999997,
      "setupAndTransportMs": 1035.2013749999996
    },
    {
      "workflow": "search-edit",
      "mode": "on",
      "sample": 1,
      "correctness": true,
      "declarationBytes": 15147,
      "estimatedDeclarationTokens": 3786.25,
      "outputBytes": 677,
      "toolCalls": 2,
      "discoveryCalls": 0,
      "discoveryMs": 0,
      "outerCodemodeCalls": 0,
      "processMs": 1063.4056250000003,
      "toolExecutionMs": 39.23091600000009,
      "setupAndTransportMs": 1024.1747090000003
    },
    {
      "workflow": "search-edit",
      "mode": "only",
      "sample": 1,
      "correctness": true,
      "declarationBytes": 13095,
      "estimatedDeclarationTokens": 3273.75,
      "outputBytes": 168,
      "toolCalls": 2,
      "discoveryCalls": 2,
      "discoveryMs": 2,
      "outerCodemodeCalls": 1,
      "processMs": 1111.6357500000004,
      "toolExecutionMs": 76.97987499999988,
      "setupAndTransportMs": 1034.6558750000004
    },
    {
      "workflow": "search-edit",
      "mode": "on",
      "sample": 2,
      "correctness": true,
      "declarationBytes": 15147,
      "estimatedDeclarationTokens": 3786.25,
      "outputBytes": 677,
      "toolCalls": 2,
      "discoveryCalls": 0,
      "discoveryMs": 0,
      "outerCodemodeCalls": 0,
      "processMs": 1110.9327909999993,
      "toolExecutionMs": 43.56762499999991,
      "setupAndTransportMs": 1067.3651659999994
    },
    {
      "workflow": "search-edit",
      "mode": "only",
      "sample": 2,
      "correctness": true,
      "declarationBytes": 13095,
      "estimatedDeclarationTokens": 3273.75,
      "outputBytes": 168,
      "toolCalls": 2,
      "discoveryCalls": 2,
      "discoveryMs": 2,
      "outerCodemodeCalls": 1,
      "processMs": 1111.0584170000002,
      "toolExecutionMs": 77.0536249999999,
      "setupAndTransportMs": 1034.0047920000002
    },
    {
      "workflow": "search-edit",
      "mode": "on",
      "sample": 3,
      "correctness": true,
      "declarationBytes": 15147,
      "estimatedDeclarationTokens": 3786.25,
      "outputBytes": 677,
      "toolCalls": 2,
      "discoveryCalls": 0,
      "discoveryMs": 0,
      "outerCodemodeCalls": 0,
      "processMs": 1043.3354580000014,
      "toolExecutionMs": 40.474709000000075,
      "setupAndTransportMs": 1002.8607490000013
    },
    {
      "workflow": "search-edit",
      "mode": "only",
      "sample": 3,
      "correctness": true,
      "declarationBytes": 13095,
      "estimatedDeclarationTokens": 3273.75,
      "outputBytes": 168,
      "toolCalls": 2,
      "discoveryCalls": 2,
      "discoveryMs": 2,
      "outerCodemodeCalls": 1,
      "processMs": 1082.5342499999988,
      "toolExecutionMs": 77.77100000000007,
      "setupAndTransportMs": 1004.7632499999987
    }
  ]
}
~~~

</details>

## Measurement boundaries

- Declaration JSON includes model tool names, descriptions, and parameter schemas; it excludes system prompt and provider framing. Character-count / 4 estimates are not exact tokens or provider-tokenizer counts.
- Loadout measurements use an all-Hashline-tools fixture supplied to the selected host's real prepareLoadout hook, not a CLI-resolved selection or a full AgentSession. Custom tool selections can produce different declarations and callable tools.
- Output is rendered UTF-8 text bytes including host/notice framing, not structured JSON report size or binary images. Only-mode output includes the explicit discovery-timing summary.
- Each sample starts a fresh process. No warm-process or warm-VM lane was measured; OS caches and external scheduling are uncontrolled. Samples always run on then only, not randomized.
- Setup/transport is process duration minus invocation duration (clamped at zero), not a uniquely attributable host component. Invocation timing includes pipeline/hook work; only-mode additionally includes VM/script/discovery overhead.
- Two explicit awaited searchTools/describeTool calls provide discovery count/timing; these are not inferred from nested-tool telemetry. Discovery uses script Date.now(), so resolution is whole milliseconds.
- Normal independent reads/searches use separate direct calls; only-mode uses the documented concurrent batch. Search/edit uses the documented private chain. Do not attribute all observed differences solely to the exposure flag.
- These tiny deterministic fixtures establish correctness and record observed overhead, not an upper bound, model task quality, model reasoning/latency, provider latency/cost, or real-world task generalization.

## Decision

All correctness gates passed; mode choice remains opt-in. Only-mode used 2,052 fewer declaration bytes (512.5 fewer character/4 estimated tokens), but independent output grew from 169 to 810 bytes while search/edit output shrank from 677 to 168 bytes. Only-mode invocation medians were higher for both workflows, with two discovery calls and VM overhead; process duration was dominated by setup/transport and varied between samples. There is no universal best mode or recommendation to change default tool exposure.
