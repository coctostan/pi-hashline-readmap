---
from: docs/tool-cost.md#pilot-2026-11-05, slice 7 (Pilot proposes a ruling) of tools-vs-bash (Each search tool earns its place over bash)
---
# `ls` and `find` are deferred, `grep` is kept

In the pilot (gpt-6-luna and Claude Sonnet 5.5, 208 runs, $3.48) `ls` and `find` cost Sonnet 6,486 input tokens per locate run beyond the repeat spread and won only gpt-6-luna's calls before the first touch, so by the rule they are not kept and go inactive by default, still registered for `tool_search` and codemode, since removing them would need a deprecation release for no further measured gain. `grep` is kept: dropping it cost gpt-6-luna 35,302 input tokens a run and both models calls before the first touch, against one loss, Sonnet's cost, 3% past a two-repeat spread and a tie once the leaked `ls-default-limit` task is counted. Anchored bash grep is triggered, since losing `grep` costs something real, and runs as a fifth arm before `grep`'s place is ruled again.
