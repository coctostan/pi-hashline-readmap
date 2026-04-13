List directory contents. Shows directories first (with `/` suffix), then files, sorted alphabetically. Always includes dotfiles. Returns structured metadata for programmatic use.

## Parameters

- `path` — Directory to list (default: current directory)
- `limit` — Maximum entries to return (default: 500)
- `glob` — Filter entries by glob pattern, e.g. `'*.ts'` or `'.env*'`

## Output

One entry per line. Directories appear first with a trailing `/` suffix. Files follow, sorted alphabetically (case-insensitive). Hidden files (dotfiles) are always included.

When the entry count exceeds `limit`, a truncation notice is appended. Output is also bounded at 50 KB.

## Usage Guidance

- Use `ls` to inspect a single directory's structure
- Use `glob` to narrow results without switching to `find` (e.g. `glob: "*.ts"`)
- Use `find` instead for recursive file discovery across multiple directories
- Use `read` to inspect file contents — `ls` only shows names
