---
id: 9
type: feature
status: closed
created: 2026-02-26T21:08:00Z
milestone: M2
priority: 7
---

# Add symbol parameter to read tool

Add `symbol?: string` parameter to the read tool schema.

**When symbol is provided:**
1. Generate or retrieve cached FileMap
2. Call findSymbol(map, symbolName) → line range
3. If found: re-read with offset/limit for just that symbol, hashlined
4. Include header: `[Symbol: name, lines X-Y of total]`
5. Do NOT append structural map (already targeted)
6. If NOT found: fall back to normal read + warning listing available symbols

**Key behaviors:**
- Works on both small and large files (no size threshold)
- Returns hashlined content (editable via hash anchors)
- symbol + offset = error (use one or the other)
- Unmappable file → graceful fallback to normal read

**Update prompts/read.md** to document the symbol parameter.
