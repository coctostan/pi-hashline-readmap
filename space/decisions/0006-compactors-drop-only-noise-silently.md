---
from: chat 2026-11-02, shaping truthful-compaction (Compacted bash output is truthful and recoverable)
---
# Compactors drop only noise silently

A bash compactor may drop noise without saying so: progress meters, `Compiling` lines, intermediate Docker containers, and whatever else `docs/bash-output.md` lists as that route's noise. Diagnostics (errors, warnings, lint findings) and status facts (a branch's tracking, a merge conflict) are kept up to a budget, and what the budget cuts is counted in a marker and reported in `details.rtkCompaction.dropped`. A compactor that cannot tell a line's kind keeps it. A summary may replace lines only with true counts.

A new route, or a change to one, names its noise in `docs/bash-output.md` and proves in `tests/rtk-drop-markers.test.ts` that every other line of its fixture is kept or counted.
