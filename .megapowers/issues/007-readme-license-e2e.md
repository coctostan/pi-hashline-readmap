---
id: 7
type: feature
status: closed
created: 2026-02-26T21:06:00Z
milestone: M1
priority: 5
---

# README.md, LICENSE, and end-to-end verification

**README.md:**
- What it is (combined hashline-edit + read-map + rtk bash techniques)
- Why it exists (resolves read tool conflict)
- What you get (read, edit, grep + structural maps + bash compression)
- Installation: `pi install .` / `pi install npm:pi-hashline-readmap`
- Output format examples for small and large files
- Development setup
- Upstream credits (hashline-edit by RimuruW, read-map by Whamp, rtk by mcowger)
- License (MIT)

**E2E verification:**
1. `pi install .` — extension loads without errors
2. Read small file → hashlines, no map
3. Read large file → hashlines + structural map
4. Edit using anchors → applies correctly
5. Grep → results have hash anchors
6. `/reload` works cleanly
