# Session Handoff

**Date:** 2026-03-03  
**Branch:** `main` (PR #6 merged — wave 2 complete)  
**Suite:** 56 test files / 283 tests — all green

---

## What was built (wave 2, now on main)

**Track A: Bash filter + new RTK compressors**
- `BASH_FILTER_ENABLED = true` re-enabled in `index.ts`
- Test command bypass: `isTestCommand()` fires first — test output never compressed
- 4 new compressors: `package-manager.ts`, `docker.ts`, `file-listing.ts`, `http-client.ts`
- All wired into `filterBashOutput()` route chain + exported from `src/rtk/index.ts`

**Track B: Symbol lookup quality**
- Recursive dot-notation: `A.B.C.D` walks arbitrary depth
- Ranked fuzzy matching: exact > CI-exact > prefix > camelCase > substring, capped at 5
- LRU cache: 500-entry cap, Map insertion order, `setMapCacheMaxSize()` for testing
- Breadcrumb headers: `[Symbol: method (method) in ClassName, lines X-Y of Z]`

## Bugs found and fixed (stress testing session)

| Bug | File | Fix |
|-----|------|-----|
| `ls --all` false positive — `l` in `--all` matched the flag detector | `src/rtk/file-listing.ts` | Replaced `rest.includes('l')` with short-flag regex — only matches single-dash POSIX flags |
| `npm i` not matched — `pnpm i` was covered but not `npm i` | `src/rtk/package-manager.ts` | Added `/^npm\s+i(?:\s|$)/` to `INSTALL_COMMAND_PATTERNS` |

---

## Known gaps / next things to test

### Compressor gaps found in real-session usage

1. **BuildKit docker format not handled** — Modern `docker build` uses BuildKit by default,
   which outputs `#1 [internal] load build definition from Dockerfile` instead of `Step N/M`.
   The docker compressor only handles classic format → BuildKit output → all stripped → `null`
   → falls back to raw. Significant gap since BuildKit is now the default on Docker Desktop.

2. **curl `-v` TLS noise not stripped** — The `* ` prefixed lines from `curl -v`
   (TLS handshake, connection info like `* Connected to`, `* TLS 1.3 connection using`)
   are not stripped. Only `%` progress meters are removed. Those `* ` lines are pure noise.

3. **`isTestCommand` has false positives** — `cat vitest.config.ts` bypasses compression
   because the check is `c.includes("vitest")`. Known tradeoff (false-negative compression
   is worse than false-positive bypass) but could be tightened with word-boundary checks.

4. **Dot-notation not-found dumps whole file** — When `ClassName.nonExistentMethod` fails,
   falls through to full file + map read. For a 10,681-line file this is expensive.
   Should emit a targeted "symbol not found in ClassName — did you mean: addUser, getUser?"

5. **`isHttpCommand` too broad** — `http` matches httpie, but also matches any command
   starting with `http` followed by a space (e.g., `http-server`, `http-proxy`). The current
   guard excludes `httpd` and `https-` but other `http-*` tools could false-positive.

### Suggested next stress tests

```bash
# BuildKit docker (the default on modern Docker)
docker build .

# curl -v to see how many * lines survive
curl -v https://api.github.com/zen

# Large JSON response truncation
curl -s https://api.github.com/repos/microsoft/typescript/commits

# Ambiguous symbol — multiple classes sharing a method name
# (construct a fixture or find one in node_modules)

# npm i alias (now fixed) — real install
npm i lodash --dry-run

# GNU long flags (now fixed)
ls --all /tmp
ls --recursive /usr/local/lib

# 5-level symbol path that doesn't exist at level 5
# LRU under mtime churn — touch a file mid-session, re-read, confirm stale eviction
```

---

## Architecture quick-ref

```
index.ts                    # Extension entry — BASH_FILTER_ENABLED = true
src/rtk/
  bash-filter.ts            # filterBashOutput() — test bypass then route chain
  package-manager.ts        # npm install/ci/i, yarn, pnpm install/i/add
  docker.ts                 # docker build/compose build/buildx (classic format only — BuildKit gap)
  file-listing.ts           # find, tree, ls -la/-R/-alh (short POSIX flags only)
  http-client.ts            # curl, wget, http — strips % progress, truncates body at 200 lines
  git.ts / build.ts / linter.ts / test-output.ts  # existing compressors
src/readmap/
  symbol-lookup.ts          # findSymbol() — @line, dot-path, exact, CI, prefix, camel, substr
  formatter.ts              # FileMap → human text with budget tiers
src/map-cache.ts            # LRU cache, max 500, setMapCacheMaxSize() for tests
src/read.ts                 # breadcrumb header: [Symbol: name (kind) in Parent, lines X-Y]
```

## Test files (wave 2)

```
tests/bash-filter-test-bypass.test.ts   # isTestCommand routing
tests/rtk-package-manager.test.ts       # PM compressor (7 tests, npm i covered)
tests/rtk-docker.test.ts                # Docker compressor (6 tests, classic format only)
tests/rtk-file-listing.test.ts          # File listing compressor (6 tests, GNU flag fix)
tests/rtk-http-client.test.ts           # HTTP client compressor (8 tests)
tests/symbol-lookup-recursive.test.ts   # Dot-notation 3+ levels (6 tests)
tests/symbol-lookup-fuzzy.test.ts       # Ranked tiers (6 tests)
tests/map-cache-lru.test.ts             # LRU eviction (5 tests)
tests/symbol-read-breadcrumbs.test.ts   # Breadcrumb header (4 tests)
```
