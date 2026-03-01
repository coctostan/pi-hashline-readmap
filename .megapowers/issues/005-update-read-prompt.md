---
id: 5
type: feature
status: closed
created: 2026-02-26T21:04:00Z
milestone: M1
priority: 4
---

# Update prompts/read.md for combined output format

Update the read tool's description template to reflect combined hashline + map behavior:

- When truncated (>2000 lines / >50KB), a structural map is appended showing symbols and line ranges
- The map enables targeted reads: `read(path, offset=LINE, limit=N)`
- Supports 17 languages
- Maps are cached in memory by file modification time
- Each line has a `LINE:HASH|` anchor for surgical edits

Include example output showing hashlines + map together.
