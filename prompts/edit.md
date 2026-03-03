Surgically edit files with hash-verified line references (anchors). Use the `LINE:HASH` strings from the latest `read` or `grep` output to specify exactly where to make changes.

- path: File path
- edits: Array of operations:
  - { set_line: { anchor, new_text } }              // Replace or delete a single line
  - { replace_lines: { start_anchor, end_anchor, new_text } } // Replace a range
  - { insert_after: { anchor, new_text } }           // Insert after anchor
  - { replace: { old_text, new_text, all? } }       // Global string replace (fallback)

Rules:
- Anchors (`LINE:HASH`) must be copied exactly from `read`/`grep` output.
- `new_text` is plain content (no hashes, no diff `+` markers).
- If a hash mismatch occurs (indicated by `>>>`), re-read the file to sync.
- Operations are validated and applied bottom-up atomically.
