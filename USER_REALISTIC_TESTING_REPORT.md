# User-realistic tool testing report — pi-hashline-readmap

> Session intent: integration + UX testing (no fixes).  
> Repo: `pi-hashline-readmap`

## Environment

Commands:

```bash
node -v
npm -v
```

Observed:

- `node`: `v25.6.1`
- `npm`: `11.9.0`

## Baseline checks

### Tests

Command:

```bash
npm test
```

Key output:

- `Test Files  62 passed (62)`
- `Tests  347 passed (347)`

### Typecheck

Command:

```bash
npm run typecheck
```

Result: **failed** (exit code 2)

Key errors:

```text
src/edit.ts(139,15): error TS2677: A type predicate's type must be assignable to its parameter's type.
...
src/read.ts(200,36): error TS2339: Property 'parentName' does not exist on type '{ name: string; kind: string; startLine: number; endLine: number; }'.
src/read.ts(200,68): error TS2339: Property 'parentName' does not exist on type '{ name: string; kind: string; startLine: number; endLine: number; }'.
```

## A) RTK bash filter routing/compression scenarios + observations

### Harness notes (important)

The prompt requested:

```bash
node --experimental-strip-types -e "<script>"
```

Direct import of `./src/rtk/bash-filter.ts` **failed** due to `.js` specifiers inside TS source (example import error below). To run the probes, I had to add a temporary Node ESM loader that maps relative `./x.js` and `./x` to `./x.ts` when the JS file doesn’t exist.

Repro (fails as-is):

```bash
node --experimental-strip-types --input-type=module \
  -e "import * as m from './src/rtk/bash-filter.ts'; console.log(Object.keys(m));"
```

Error snippet:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/rtk/ansi.js' imported from .../src/rtk/bash-filter.ts
```

Workaround used for the rest of section A:

```bash
# temp loader created at .user-testing/resolve-js-to-ts-loader.mjs
node --experimental-strip-types \
  --loader ./.user-testing/resolve-js-to-ts-loader.mjs \
  ./.user-testing/rtk-probe.ts
```

Note: Node prints an `ExperimentalWarning` about `--experimental-loader` on each run.

### Scenarios (simulated command/output pairs)

All scenarios were run through:

- `filterBashOutput(cmd, output)` from `src/rtk/bash-filter.ts`
- Route inference via predicates (from `src/rtk/index.ts` and `src/rtk/bash-filter.ts`):
  - `isBuildToolsCommand`, `isTransferCommand`, etc.

#### 1) make

- cmd: `make all`
- route inference:
  - `isBuildToolsCommand: true`

Observed compression (from `.user-testing/rtk-probe.ts`):

- `savedChars: 221`
- Noise removed: `make[1]: Entering/Leaving directory ...`
- Preserved “signal” line:

```text
make: *** [all] Error 1
```

#### 2) cmake

- cmd: `cmake --build .`
- route inference:
  - `isBuildToolsCommand: true`

Observed (when output contains a final non-progress line like `done`):

- `savedChars: 315`
- Compressed output became only:

```text
done
```

Observed (progress-only output; no final “done” / error):

Command:

```bash
node --experimental-strip-types --input-type=module \
  --loader ./.user-testing/resolve-js-to-ts-loader.mjs \
  -e 'import { filterBashOutput } from "./src/rtk/bash-filter.ts";
      const out = Array.from({length:15},(_,i)=>`[ ${String(i+1).padStart(2)}%] Building ...`).join("\n")+"\n";
      console.log(filterBashOutput("cmake --build .", out));'
```

Output:

```js
{ output: '', savedChars: 300 }
```

So compression can produce **empty string output**.

#### 3) gradle / ./gradlew

- cmd: `./gradlew build`
- route inference:
  - `isBuildToolsCommand: true`

SUCCESSFUL case:

- Compressed output reduced to:

```text
BUILD SUCCESSFUL in 12s
```

FAILED case:

- Task spam removed.
- Exception summary and `BUILD FAILED in ...` preserved.

#### 4) mvn

- cmd: `mvn package`
- route inference:
  - `isBuildToolsCommand: true`

Observed:

- Download spam removed (most `[INFO] Downloading:` lines removed)
- Error context preserved:

```text
[ERROR] COMPILATION ERROR :
[ERROR] /repo/src/main/java/App.java:[10,1] cannot find symbol
...
[INFO] BUILD FAILURE
```

#### 5) rsync

- cmd: `rsync -av src/ dst/`
- route inference:
  - `isTransferCommand: true`

Observed:

- `savedChars: 0`
- Output **not compressed**; per-file noise remains.

#### 6) scp

- cmd: `scp file host:/path`
- route inference:
  - `isTransferCommand: true`

Observed:

- `savedChars: 0`
- Output **not compressed**; progress bar lines remain.
- Both `KB/s` and `kB/s` variants were *not* normalized/compacted in this simulation.

## B) read tool realism — scenarios + observations

### B1) Large file + map behavior

Fixture:

- `tests/fixtures/large.ts` (~414KB, 10,681 lines)

Command:

```text
read({ path: "tests/fixtures/large.ts" })
```

Observed:

- Output truncated with indicator:

```text
[Output truncated: showing 1112 of 10681 lines (50.0KB of 497.1KB). Use offset=1113 to continue.]
```

- Structural map appended automatically (because of truncation), with e.g.:

```text
File Map: large.ts
10,681 lines │ 414.1 KB │ TypeScript
...
class EventEmitter: [47-1342]
  initialize: [62-146]
...
```

Offset/limit read (no map by default):

```text
read({ path: "tests/fixtures/large.ts", offset: 200, limit: 10 })
```

Observed:

- Only lines 200–209 returned
- No map appended

Offset/limit with `map: true`:

```text
read({ path: "tests/fixtures/large.ts", offset: 200, limit: 10, map: true })
```

Observed:

- Lines 200–209 returned
- Full-file map appended

### B2) Symbol lookup

Known symbols:

```text
read({ path: "tests/fixtures/large.ts", symbol: "EventEmitter.initialize" })
```

Observed:

- Symbol header:

```text
[Symbol: initialize (method) in EventEmitter, lines 62-146 of 10681]
```

Ambiguous symbol:

```text
read({ path: "tests/fixtures/large.ts", symbol: "initialize" })
```

Observed disambiguation UX:

```text
Symbol 'initialize' is ambiguous.
Matches:
- initialize (method) — lines 62-146
- initialize (method) — lines 1361-1445
...
Use initialize@62 or initialize@1361 ...
```

Missing symbol:

```text
read({ path: "tests/fixtures/large.ts", symbol: "NoSuchSymbol" })
```

Observed:

- Warns and falls back to normal read:

```text
[Warning: symbol 'NoSuchSymbol' not found. Available symbols: parseConfig, formatOutput, ...]
```

### B3) Binary-ish files

Repo fixture:

```text
read({ path: "tests/fixtures/sample.bin" })
```

Observed:

- **No binary warning**
- Output looks garbled (replacement characters), e.g.:

```text
1:e2|���_...
```

NUL-bytes file (created for test):

```bash
printf 'abc\0def\n' > .user-testing/nul-bytes.bin
read({ path: ".user-testing/nul-bytes.bin" })
```

Observed:

- Warns:

```text
[Warning: file appears to be binary — output may be garbled]
```

Non-UTF8 without NUL (created for test):

```bash
python3 - <<'PY'
import pathlib
pathlib.Path('.user-testing/high-bit.bin').write_bytes(bytes([255,254,253,252,251,250,249,248,247,246]))
PY
read({ path: ".user-testing/high-bit.bin" })
```

Observed:

- **No warning**
- Garbled output line:

```text
1:f5|����������
```

### B4) Line endings

CRLF file (created):

```bash
printf 'line1\r\nline2\r\nline3\r\n' > .user-testing/crlf.txt
read({ path: ".user-testing/crlf.txt" })
```

Observed:

- No warning
- Lines numbered as expected (1..3)

Bare-CR file (created):

```bash
printf 'line1\rline2\rline3\r' > .user-testing/cr-only.txt
read({ path: ".user-testing/cr-only.txt" })
```

Observed:

- Warning shown:

```text
[Warning: file contains bare CR (\r) line endings — line numbering may be inconsistent with grep and other tools]
```

- Displayed as 3 lines (1..3)

## C) grep tool realism — scenarios + observations

### C1) Normal text fixtures

Command:

```text
grep({ pattern: "export", path: "tests/fixtures/small.ts" })
```

Observed:

- Anchored matches like:

```text
small.ts:>>13:91|export class UserDirectory {
```

### C2) grep against CR-only file

Command:

```text
grep({ pattern: "line2", path: ".user-testing/cr-only.txt" })
```

Observed (surprising):

```text
[1 matches in 1 files]
--- cr-only.txt (1 matches) ---
cr-only.txt:>>1:02|line1
```

So grep reports a match for `line2` but the snippet/anchor points at `line1` / line 1.

### C3) grep against binary-ish files

NUL-bytes file:

```text
grep({ pattern: "abc", path: ".user-testing/nul-bytes.bin" })
```

Observed:

```text
[Warning: '.user-testing/nul-bytes.bin' appears to be a binary file — grep skips binary files by default. ...]
```

Binary-ish with ASCII needle but invalid bytes (created):

```bash
python3 - <<'PY'
import pathlib
p=pathlib.Path('.user-testing/binaryish-with-text.bin')
p.write_bytes(bytes([255,254,253,252]) + b'NEEDLE' + bytes([251,250,249]))
PY

grep({ pattern: "NEEDLE", path: ".user-testing/binaryish-with-text.bin" })
```

Observed:

- No warning
- Reported:

```text
[0 matches in 0 files]
```

Even though the bytes contain `NEEDLE`.

## D) edit (hash-anchored) scenarios + observations

Scratch file:

```bash
cat > .user-testing/edit-scratch.txt <<'EOF'
alpha
beta
gamma
delta
epsilon
EOF
read({ path: ".user-testing/edit-scratch.txt" })
```

Anchors observed:

```text
2:89|beta
3:6d|gamma
```

### D1) set_line

```text
edit({
  path: ".user-testing/edit-scratch.txt",
  edits: [{ set_line: { anchor: "2:89", new_text: "beta-UPDATED" } }]
})
```

Observed: `Updated .user-testing/edit-scratch.txt`

### D2) insert_after

```text
edit({
  path: ".user-testing/edit-scratch.txt",
  edits: [{ insert_after: { anchor: "3:6d", new_text: "INSERTED" } }]
})
```

### D3) replace_lines

```text
edit({
  path: ".user-testing/edit-scratch.txt",
  edits: [{ replace_lines: { start_anchor: "1:c8", end_anchor: "2:be", new_text: "ALPHA\nBETA" } }]
})
```

### D4) replace (string replace)

```text
edit({
  path: ".user-testing/edit-scratch.txt",
  edits: [{ replace: { old_text: "delta", new_text: "DELTA" } }]
})
```

### D5) Drift / mismatch behavior (old anchor)

Attempted to reuse a stale anchor (`2:89`) after edits:

```text
edit({
  path: ".user-testing/edit-scratch.txt",
  edits: [{ set_line: { anchor: "2:89", new_text: "SHOULD FAIL" } }]
})
```

Observed error message (good UX):

```text
1 line has changed since last read. Auto-relocation checks only within ±20 lines of each anchor.
Use the updated LINE:HASH references shown below (>>> marks changed lines).

    1:f8|ALPHA
>>> 2:21|BETA
    3:6d|gamma
    4:6d|INSERTED
```

## Issues found

### 1) RTK probing via `node --experimental-strip-types` fails without a custom loader (TS files import `.js` / extensionless specifiers)

**Repro**

```bash
node --experimental-strip-types --input-type=module \
  -e "import * as m from './src/rtk/bash-filter.ts'; console.log(Object.keys(m));"
```

**Actual**

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/rtk/ansi.js' imported from .../src/rtk/bash-filter.ts
```

**Expected**

- The recommended “Node type-stripping” workflow should be able to import the extension’s TS sources without extra loaders.

**Impact / UX**

- Makes ad-hoc probing/debugging of RTK compressors difficult.
- Confusing for users: the import error points to missing `.js` files even though `.ts` exists.

---

### 2) `filterBashOutput()` can compress `cmake --build .` progress-only output to an empty string

**Repro**

```bash
node --experimental-strip-types --input-type=module \
  --loader ./.user-testing/resolve-js-to-ts-loader.mjs \
  -e 'import { filterBashOutput } from "./src/rtk/bash-filter.ts";
      const out = Array.from({length:15},(_,i)=>`[ ${String(i+1).padStart(2)}%] Building ...`).join("\n")+"\n";
      console.log(filterBashOutput("cmake --build .", out));'
```

**Actual**

```js
{ output: '', savedChars: 300 }
```

**Expected**

- Output should not become `""` (blank). Ideally preserve at least one progress line or emit a placeholder like `(build output compressed)`.

**Impact / UX**

- Users can get a completely blank response from `bash` filtering while a build is running (or when only progress output is available), which looks like a tool failure.

---

### 3) Transfer route seems to fire for `rsync`/`scp`, but compression doesn’t reduce output (savedChars=0)

**Repro**

Run the probe harness:

```bash
node --experimental-strip-types \
  --loader ./.user-testing/resolve-js-to-ts-loader.mjs \
  ./.user-testing/rtk-probe.ts
```

**Actual**

- For both `rsync -av ...` and `scp ...` scenarios:
  - route inference: `isTransferCommand: true`
  - `savedChars: 0`
  - progress/per-file noise remains

**Expected**

- Some compaction of per-file/progress-bar spam; preserve final summary lines.

**Impact / UX**

- High-volume transfer output can overwhelm tool output; undermines the value of the RTK filter for common commands.

---

### 4) `grep` anchors/snippets are misleading on bare-CR (\r-only) files

**Repro**

```bash
printf 'line1\rline2\rline3\r' > .user-testing/cr-only.txt
read({ path: ".user-testing/cr-only.txt" })
grep({ pattern: "line2", path: ".user-testing/cr-only.txt" })
```

**Actual**

`read` shows 3 lines and warns about bare CR.

`grep` reports:

```text
cr-only.txt:>>1:02|line1
```

…even though the match is `line2`.

**Expected**

- If grep supports bare-CR files, it should produce anchors/snippets consistent with `read`’s displayed line numbering; otherwise, it should warn and/or refuse anchors.

**Impact / UX**

- Extremely high: users will copy anchors into `edit`, but they point to the wrong line.
- Makes “read → grep → edit” workflow unsafe on such files.

---

### 5) `grep` silently returns no matches on non-UTF8 binary-ish data containing ASCII

**Repro**

```bash
python3 - <<'PY'
import pathlib
p=pathlib.Path('.user-testing/binaryish-with-text.bin')
p.write_bytes(bytes([255,254,253,252]) + b'NEEDLE' + bytes([251,250,249]))
PY

grep({ pattern: "NEEDLE", path: ".user-testing/binaryish-with-text.bin" })
```

**Actual**

```text
[0 matches in 0 files]
```

(no warning)

**Expected**

- Either:
  - warn and skip as “binary-ish” (like the NUL-bytes warning), or
  - search raw bytes / Latin-1 compatible decoding so ASCII substrings are findable.

**Impact / UX**

- Confusing false negative: user knows the string exists but grep says no matches.

---

### 6) `read` does not warn on binary-ish files without NUL bytes

**Repro**

```text
read({ path: "tests/fixtures/sample.bin" })
# or
read({ path: ".user-testing/high-bit.bin" })
```

**Actual**

- Returns garbled output without a binary warning.

**Expected**

- Some heuristic warning for non-text / non-UTF8 data, not only NUL detection.

**Impact / UX**

- Users may assume output is valid text (with hashlines) and try to edit/grep it.

## Minimal repro fixtures created in this session

All created under `.user-testing/`:

- `.user-testing/cr-only.txt` — bare-CR line endings (grep anchor mismatch)
- `.user-testing/binaryish-with-text.bin` — non-UTF8 bytes containing ASCII `NEEDLE` (grep false negative)
- `.user-testing/nul-bytes.bin` — includes NUL byte (read warns; grep warns+skips)
- `.user-testing/high-bit.bin` — high-bit bytes without NUL (read no warning)
- `.user-testing/edit-scratch.txt` — edit tool workflow
- `.user-testing/rtk-probe.ts` — RTK simulation runner
- `.user-testing/resolve-js-to-ts-loader.mjs` — Node loader workaround for RTK probing
