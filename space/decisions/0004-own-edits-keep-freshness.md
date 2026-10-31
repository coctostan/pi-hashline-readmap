---
from: GitHub PR #237
---
# Own edits keep a file's anchors fresh

Since PR #197 annotates stale results instead of replacing their content, the model still sees a read's anchors after the extension's own edit or write. `ServedLines` remaps or refuses the ones that shifted (#233), so that edit or write keeps the file fresh across turns. A change made outside the extension (bash, another process) has no line map, so it still expires freshness. This reverses the expectation #144 pinned for the extension's own edits.
