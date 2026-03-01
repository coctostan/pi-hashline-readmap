---
id: 4
type: feature
status: closed
created: 2026-02-26T21:03:00Z
milestone: M1
priority: 3
---

# Integrate map generation into hashline read tool

The core integration — modify `src/read.ts` to call read-map's `generateMap()` + `formatFileMapWithBudget()` when a file is truncated.

**The change (~15 lines in src/read.ts):**

After the truncation detection block, add:

```typescript
if (truncation.truncated && !params.offset && !params.limit) {
    try {
        const fileMap = await generateMap(absolutePath);
        if (fileMap) {
            const mapText = formatFileMapWithBudget(fileMap);
            text += mapText;
        }
    } catch {
        // Map generation failed — still return hashlined content without map
    }
}
```

**Also add in-memory map cache:**
- Cache keyed by `(absolutePath, mtimeMs)`
- Check cache before calling generateMap()
- Import stat from fs/promises for mtime check

**Conditions for map generation:**
1. File was truncated (truncation.truncated === true)
2. No offset parameter provided
3. No limit parameter provided

**Behavior on failure:**
- Map generation errors are caught silently
- User still gets hashlined content without the map
- Read tool must NEVER fail because of map generation
