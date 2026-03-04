# Tool testing report (session)

Date: 2026-03-03

This session focused on *actual tool testing* (read/grep/sg/edit + RTK bash filter behavior), first validating recent work and then pushing edges to find gaps.

## What was tested

### Repo health checks
- `npm test` → **PASS** (62 files, 347 tests)
- `npm run typecheck` → **FAIL** (3 TypeScript errors)

### Live tool calls
- `read` (including `map: true`, and `symbol:` reads)
- `grep` (including on binary-ish and bare-CR files)
- `sg` (ast-grep wrapper)
- `edit` (hash-anchored edits; tested in a scratch file)

### Targeted edge-case probes
- Direct invocation of RTK compressors via Node type-stripping:
  - `compressBuildToolsOutput()`
  - `compressTransferOutput()`
  - `compressHttpOutput()`

> Note: During the session, filesystem writes were restricted (done-phase); `edit` was validated using a scratch file under `.megapowers/`. With mega off, you can repeat those tests on normal repo/tmp files.

---

## Findings / issues (not fixed)

### 1) **Typecheck failure despite green tests**
`npm run typecheck` fails even though `npm test` passes.

Observed TS errors:
- `src/edit.ts(139,15)`: type predicate not assignable
  - Likely cause: schema vs type mismatch
    - Tool schema requires: `insert_after.new_text: string`
    - Internal type appears to allow: `insert_after.new_text?: string` (optional)

- `src/read.ts(200,36)` and `src/read.ts(200,68)`: `parentName` missing on symbol type
  - `read.ts`’s local `symbolMatch` type omits `parentName`, but runtime symbol lookup returns `parentName?: string`.

Impact:
- This is a “ship quality” gap if typecheck is a release/CI gate.

---

### 2) **New compressors can yield empty-string output**
Both new compressors can collapse output to `""` (empty string) when the input is long but fully classified as noise.

Repro (conceptual):
- Build-tools: output is entirely Gradle noise lines like `> Task :compileJava`
- Transfer: output is entirely rsync per-file progress lines

Observed behavior:
- `compressBuildToolsOutput(longNoiseOnly)` → `""`
- `compressTransferOutput(longNoiseOnly)` → `""`

Impact:
- Users may see “no output” after compression, which can look like the command did nothing.

---

### 3) **Transfer compressor misses common scp progress variants**
`compressTransferOutput()` strips scp progress lines only when the rate matches uppercase units.

Example not stripped:
- `file.txt  100%  1234  1.2kB/s  00:00` (lowercase `k`)

Impact:
- Some scp progress spam will leak through.

---

### 4) **Binary warning heuristic misses NUL-free binaries**
Binary detection appears to rely on the presence of `\0` bytes.

Observed:
- `read("tests/fixtures/sample.bin")` renders garbled characters **without** a binary warning.

Impact:
- Many binary files won’t trigger a warning if they do not contain NUL bytes.

---

### 5) **Bare-CR files: `read` warns correctly; `grep` line anchors can be misleading**
A bare-CR file (`\r` line endings, classic Mac) produces:

- `read`: explicit warning + normalized line display (good)
- `grep`: results can be inconsistent with the normalized display

Observed symptom:
- Grep finds a match but shows a line/anchor that doesn’t visibly contain the match in the hashlined output.

Likely cause:
- Underlying grep engine may treat CR-only content as a single line, while `read` normalizes to LF for hashing/display.

Impact:
- Risk of “ghost matches” / confusing anchors in grep output on CR-only files.

---

### 6) **Schema strictness vs internal edit types**
Schema validation correctly rejects `insert_after` without `new_text`.

But this highlights a mismatch:
- If internal types allow optional `new_text`, devs may write code expecting it to be optional, while the tool interface requires it.

Impact:
- Maintenance hazard; can cause typecheck failures and confusion.

---

## Quick notes on behaviors that worked well
- `read(symbol: ...)` supports method lookup and prints a symbol header including parent context (e.g. `in UserDirectory`).
- `read(map: true)` correctly appends a structural map.
- `sg` returns hashline anchors suitable for `edit`.
- `edit` correctly:
  - applies `set_line`, `insert_after`, `replace_lines`, `replace`
  - detects hash mismatches and prints updated anchors

---

# Handoff: next session “user-realistic testing” instructions

Goal: simulate what a real pi user experiences: running shell commands, reading files, grepping, applying edits, and seeing RTK-compressed outputs. Focus on *integration and UX*, not unit tests.

## 0) Establish baseline
1. Run:
   - `npm test`
   - `npm run typecheck`
2. Record any failures and keep them separate from behavioral issues.

## 1) RTK bash filter realism (routing + compression)
Use realistic command/output pairs and ensure the *route selection* and *compression* look correct.

Suggested scenarios to try:
- Build-tools:
  - `make all` with lots of `Entering/Leaving directory` noise + a final `make: *** ... Error 1` line
  - `cmake --build .` with `[ 10%]` progress spam
  - `./gradlew build` with `> Task :...` spam plus `BUILD FAILED` / `BUILD SUCCESSFUL`
  - `mvn package` with `[INFO] Downloading` spam plus an `[ERROR]` line

- Transfer:
  - `rsync -av src/ dst/` with per-file progress lines + summary `sent ... bytes ...`
  - `scp file host:/path` with progress bars (test uppercase and lowercase unit variants: `KB/s` vs `kB/s`)

What to look for:
- Does output ever compress to an empty string? If yes, is that acceptable UX?
- Are “signal lines” preserved consistently?
- Do any common progress formats leak through?

## 2) read/grep realism on tricky files
1. **Binary-ish files**
   - Try `read` + `grep` on:
     - a file containing NUL bytes (should warn)
     - a file that is binary but NUL-free (may not warn today)
   - Assess whether the lack of warning is problematic.

2. **Line endings**
   - Create and test:
     - CRLF file
     - CR-only file (classic Mac)
   - Run `read` then `grep` for a known token.
   - Watch for mismatched line numbers/anchors or confusing grep snippets.

## 3) edit realism with anchors
1. Use `read` output anchors to:
   - `set_line`
   - `insert_after`
   - `replace_lines`
2. Intentionally change the file and then apply an old anchor to validate mismatch reporting.

## 4) Document outcomes as “user-facing bugs”
For each issue, capture:
- the command
- the input/output snippet
- why it’s confusing for a user
- whether it’s correctness vs UX vs performance

---

## Appendix: commands used during session (representative)
- `node --experimental-strip-types -e "import { compressTransferOutput } from './src/rtk/transfer.ts'; ..."`
- `read({ path: 'tests/fixtures/large.ts', map: true })`
- `read({ path: 'tests/fixtures/small.ts', symbol: 'UserDirectory.addUser' })`
- `sg({ pattern: 'console.log($$$ARGS)', lang: 'typescript', path: 'tests/fixtures/large.ts' })`
