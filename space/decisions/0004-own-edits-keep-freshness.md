---
from: GitHub PR #237
---
# Own edits keep a file's anchors fresh

Since PR #197 annotates stale results instead of replacing their content, the model still sees a read's anchors after the extension's own edit or write. `ServedLines` remaps or refuses the ones that shifted (#233), so that edit or write keeps the file fresh across turns. A change made outside the extension has no line map, so a bash change it classifies still expires freshness. A change by another process outside any tool call is never observed: it leaves freshness alone, and the per-line edit hashes refuse any line it changed. This reverses the expectation #144 pinned for the extension's own edits.
