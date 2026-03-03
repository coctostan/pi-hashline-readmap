Read a file. For text files, each line is prefixed with `LINE:HASH|` (e.g., `12:abc12|content`). Use these references as anchors for the `edit` tool.
Images (`jpg`, `png`, `gif`, `webp`) are delegated to the built-in image reader and returned as image attachments.

Default limit: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}.

When a file is truncated (exceeds {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}), a **structural map** is appended after the hashlined content showing file symbols (classes, functions, interfaces, etc.) with line ranges.

Use the appended map for targeted reads with `offset` and `limit` — e.g., `read(path, { offset: LINE, limit: N })`.

Maps support 17 languages (including TypeScript, Python, Rust, Go, C/C++, Java, and more) and are cached in memory by file modification time for fast repeated access.

## Map Parameter

Use the `map` parameter to request a structural map alongside the file content:

- `read(path, { map: true })` — appends the structural map after hashlined content, even for small files
- `read(path, { map: true, offset: 50, limit: 20 })` — scoped hashlines with full-file map

**Mutual exclusivity:** `map` cannot be combined with `symbol`. Use one or the other.

When `map` is not specified, structural maps are only appended automatically when a file exceeds the truncation threshold.

## Symbol Parameter

Use the `symbol` parameter to read a specific symbol by name — no line numbers needed:

- `read(path, { symbol: "functionName" })` — reads just that function
- `read(path, { symbol: "ClassName.methodName" })` — reads a method inside a class (dot notation)

**Examples by symbol type:**

| Type | Example | What it reads |
|------|---------|---------------|
| Function | `{ symbol: "processEvent" }` | The full function body |
| Class | `{ symbol: "EventEmitter" }` | The entire class declaration |
| Method | `{ symbol: "EventEmitter.emit" }` | A single method within a class |
| Interface | `{ symbol: "RequestOptions" }` | The full interface declaration |
| Type alias | `{ symbol: "EventHandler" }` | The type alias definition |
| Const/variable | `{ symbol: "DEFAULT_TIMEOUT" }` | The const/let/var declaration |
| Enum | `{ symbol: "LogLevel" }` | The full enum declaration |

**Mutual exclusivity:** `symbol` cannot be combined with `offset` or `limit`. Use one addressing mode or the other.

**Behavior by result:**

- **Found:** Returns hashlined content for the symbol's line range only, prepended with `[Symbol: name (kind), lines X-Y of Z]`.
- **Ambiguous (multiple matches):** Returns a disambiguation list with each candidate's name, kind, and line range. Use dot notation (e.g., `ClassName.methodName`) to narrow the match.
- **Not found:** Falls back to a normal read with a warning listing up to 20 available symbol names.
- **Unmappable file:** Falls back to a normal read with a warning noting the file type doesn't support symbol lookup.

Hash anchors from symbol reads are valid for use with the `edit` tool.
