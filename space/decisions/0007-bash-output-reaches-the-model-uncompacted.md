---
supersedes: 0006
from: chat 2026-11-04, shaping uncompacted-bash (Bash output reaches the model as Pi gives it)
---
# Bash output reaches the model uncompacted

The model sees a `bash` result as Pi's bash tool returns it, Pi's own truncation and `Full output:` path included: the extension strips ANSI codes and may append notices (anti-pattern hints, context hygiene, doom-loop warnings), but no compactor, summary or context guard drops, rewrites or re-trims a line. Three arcs spent keeping heuristic compactors truthful and each close found another class of misread line; current models handle the larger context, and Pi already saves and names the full output when it truncates.
