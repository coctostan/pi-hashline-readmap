Read a file. For text files, each line is prefixed with `LINE:HASH|` (e.g., `12:abc12|content`). Use these references as anchors for the `edit` tool.
Images (`jpg`, `png`, `gif`, `webp`) are delegated to the built-in image reader and returned as image attachments.

Default limit: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}.

When a file is truncated (exceeds {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}), a **structural map** is appended after the hashlined content showing file symbols (classes, functions, interfaces, etc.) with line ranges.

Use the appended map for targeted reads with `offset` and `limit` — e.g., `read(path, { offset: LINE, limit: N })`.

Maps support 17 languages (including TypeScript, Python, Rust, Go, C/C++, Java, and more) and are cached in memory by file modification time for fast repeated access.