# Exploratory / Adversarial Functional Testing Report

This document records a **manual, exploratory (non-unit) functional test** of the `pi-hashline-readmap` extension tools.

- Repo: `pi-hashline-readmap`
- Date: 2026-03-02
- Focus: try normal usage + try to break tools via edge cases
- Tools exercised: `read`, `edit`, `grep`, `sg`, plus the bash output filter

## Test setup

A sandbox was created under:

- `tmp/exploratory/`

with the following files (representative edge cases):

- `sample.ts` — TypeScript with two same-named exported functions + a class
- `large.txt` — ~500KB text file (forces truncation in `read`)
- `large.ts` — ~110KB TS file with thousands of exported functions (forces truncation + structural map)
- `crlf.txt` — CRLF line endings
- `regex.txt` — regex metacharacters, anchors like `^` and `$`
- `binary.bin` — random bytes (non-image binary)
- `bad.ts` — intentionally invalid/unparseable TypeScript

## What worked (basic functionality)

### `read`

- Hashlines appear correct on normal text/TS files.
- Truncation works and suggests using `offset=...` to continue.
- `symbol=...` reads work for unambiguous symbols.
- Structural map appears for large TS files.

### `grep`

- Regex and literal modes behave as expected.
- `ignoreCase`, `context`, and `limit` work.
- Returned matches include `LINE:HASH` anchors usable by `edit`.

### `edit`

- Hash mismatch detection works (stale anchors are detected and the tool prints updated `>>>` anchors).

### bash filter

- `npm test` output was summarized/condensed, indicating the bash compression filter is active.

## Breaks / bugs found (with repro)

### 1) `sg` reports “Command failed” when there are **no matches**

This is the biggest functional issue observed.

**Repro**:

```ts
sg({ pattern: "console.log($$$ARGS)", lang: "typescript", path: "tmp/exploratory/sample.ts" })
```

**Actual**:

- Returns an error like:
  - `Command failed: sg run --json ...`

**Expected**:

- Should return the normal no-results response, e.g.
  - `No matches found for pattern: ...`

**Likely cause**:

- `ast-grep` appears to exit with code `1` for “no matches”.
- `src/sg.ts` uses `execFileText()` which rejects on any non-zero exit code, so `stdout` is never parsed.

---

### 2) `edit` cannot truly “delete a line” (docs say it can)

Tool docs state `set_line` can “Replace or delete a single line”, but:

- `set_line(..., new_text: "")` leaves an empty line (does not remove it)
- `replace_lines(..., new_text: "")` also leaves a blank line behind

**Repro**:

1) `read(tmp/exploratory/regex.txt)` to obtain anchors
2) then:

```ts
edit({
  path: "tmp/exploratory/regex.txt",
  edits: [{ set_line: { anchor: "3:HASH", new_text: "" } }]
})
```

**Actual**:

- Line becomes blank but remains present.

**Expected (per docs)**:

- The line should be removed entirely.

---

### 3) `edit` corrupts CRLF files (mixed CR/CRLF + extra blank lines)

This can subtly dirty files and introduce inconsistent line endings.

**Repro**:

Start with `tmp/exploratory/crlf.txt` (CRLF line endings), then:

```ts
edit({
  path: "tmp/exploratory/crlf.txt",
  edits: [{ insert_after: { anchor: "1:02", text: "inserted\r\n" } }]
})
```

**Actual**:

- File ends up with mixed line endings.
- `file` reported: `ASCII text, with CRLF, CR line terminators`.
- Extra blank lines appeared.
- Hex dump showed doubled `0d` sequences (bare `\r` introduced).

**Expected**:

- Preserve file’s EOL convention consistently.
- Inserted text should be normalized to match file EOL style.
- No stray `\r` characters.

---

### 4) `read(symbol=...)` ambiguity message is misleading for top-level symbol collisions

If a file has two top-level functions with the same name, the tool reports:

> “Use dot notation to disambiguate.”

…but dot notation cannot disambiguate two top-level `add()` overloads.

**Repro**:

```ts
read({ path: "tmp/exploratory/sample.ts", symbol: "add" })
```

**Actual**:

- Ambiguity list is shown
- Suggests dot notation

**Expected**:

- Provide an addressing scheme that can disambiguate top-level collisions, e.g.
  - `add#1` / `add#2`
  - `add@line:3`
  - signature-based selection (`add(a: number, b: number)`) if available

---

### 5) `read`/`grep` operate on arbitrary binary as UTF-8 text (no warning)

Not necessarily a strict bug, but it’s easy to get misleading output.

**Repro**:

```ts
read({ path: "tmp/exploratory/binary.bin" })
```

```ts
grep({ pattern: "p", path: "tmp/exploratory/binary.bin" })
```

**Actual**:

- Binary content is rendered with replacement characters / garbage text.
- `grep` can match inside that rendered output.

**Suggestion**:

- Detect likely-binary files (NUL bytes or low UTF-8 validity) and warn or refuse by default.

## Suggested fixes (high level)

1) **`sg`:** treat exit code `1` as “no matches”, parse stdout anyway, and only error on other exit codes.
2) **`edit`:** implement true line deletion semantics or update docs to match behavior.
3) **`edit`:** preserve CRLF files correctly (normalize insertions to file EOL, avoid mixed terminators).
4) **`read(symbol=...)`:** improve ambiguity resolution UX for top-level symbol collisions.
5) **binary handling:** warn/refuse by default (optional configurable behavior).
