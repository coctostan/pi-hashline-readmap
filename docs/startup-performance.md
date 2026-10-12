# Startup performance

Decision record for issue #267 (bundled `dist/index.js` entry, proposed in PR #226). Measured with Pi 1.1.0.

## Host

- macOS 26.6.2, Apple M4 Pro
- Node v26.7.0
- Pi 1.1.0 (Measured with Pi 1.1.0)

## Method

Reproduce with `node scripts/bench-startup.mjs --runs 5 --lazy-dir <lazy> --bundle-dir <bundle> --json`. Every run is `pi --no-session --no-extensions [-e <target>] --list-models`.

- (a) no extension.
- (b) the current source entry, `-e <repo>/index.ts` (jiti transforms the ~107-module TypeScript graph).
- (c) lazy-import prototype: a copy of the repo where every static import in `src/readmap/mapper.ts` becomes a dynamic `import()` wrapper. Scope is the readmap mappers only; `src/rtk/*` techniques are consumed through the synchronous `filterBashOutput` API, so lazy-loading them would need an async filter API and is excluded.
- (d) bundle prototype: `index.ts` bundled with esbuild 0.28.2 (ESM syntax, `packages: "external"`) to `dist/index.js`, with `dist/package.json` `{"type":"commonjs"}`. It is loaded by passing the package directory (`-e <dir>`) so Pi resolves it through the `pi.extensions` manifest. The tree contains the runtime dependencies but no Pi peers and no `typebox`, like an installed extension.
- Warm = jiti transform cache enabled: one discarded warm-up run, then 5 timed runs. Cold = `JITI_FS_CACHE=false` on every run (5 timed runs).

The prototypes are measurement-only and were deleted afterwards; nothing from them ships except what later tasks implement.

## Results

Median wall time over 5 runs; overhead is versus the warm no-extension median.

| Variant | Mode | Median (s) | Overhead vs (a) (s) |
|---|---|---|---|
| a | warm | 0.19 | 0.00 |
| a | cold | 0.18 | -0.00 |
| b | warm | 0.91 | 0.72 |
| b | cold | 1.60 | 1.41 |
| c | warm | 0.79 | 0.60 |
| c | cold | 1.41 | 1.22 |
| d | warm | 0.27 | 0.08 |
| d | cold | 0.77 | 0.58 |

## Gate computation

The bundle passes iff warm `(b−d)/(b−a) ≥ 0.5` and cold `(d_cold−a) < 2.0 s`. Lazy imports win iff the bundle passes and `(b−c)/(b−d) ≥ 0.8`; otherwise a passing bundle is selected.

```json
{
  "bundleReduction": 0.8928197212809749,
  "coldOverhead": 0.5835038759999962,
  "bundlePasses": true,
  "lazyShareOfBundle": 0.19070176744142928,
  "outcome": "BUNDLE"
}
```

Outcome: BUNDLE

## External evidence

PR #226 reported on Windows 10: 4602 ms module import via `PI_TIMING=1`, and with a bundle warm 107 ms and cold 1578 ms. These figures are reported, not reproduced here.

## Upstream suggestion

Pi could expose its host modules (`VIRTUAL_MODULES`) to released runtimes to avoid the ~1.4 s first load of the host library entry. Documented only; not implemented in this repository.

## Raw measurements

```json startup-measurements
{
  "piVersion": "1.1.0",
  "host": "26.6.2 / Apple M4 Pro",
  "runs": {
    "a": {
      "warm": [
        0.18902333300000004,
        0.20046995799999998,
        0.19719624999999996,
        0.18622487499999998,
        0.18248337499999992
      ],
      "cold": [
        0.18594970799999988,
        0.1843911250000001,
        0.18338983400000006,
        0.182965459,
        0.18792041599999992
      ]
    },
    "b": {
      "warm": [
        0.9092199580000001,
        0.9109350000000004,
        0.9049715409999999,
        0.917046625,
        0.9020181670000001
      ],
      "cold": [
        1.5985419169999995,
        1.6160752919999994,
        1.597211792,
        1.6141210410000004,
        1.6020251659999993
      ]
    },
    "c": {
      "warm": [
        0.7956711249999989,
        0.7865976249999985,
        0.7987885419999984,
        0.7853956249999974,
        0.7855106250000026
      ],
      "cold": [
        1.4038990830000002,
        1.425391832999998,
        1.4088229580000007,
        1.4146346660000018,
        1.3979409589999996
      ]
    },
    "d": {
      "warm": [
        0.26355474999999934,
        0.26114166699999986,
        0.27314166699999987,
        0.26772083300000304,
        0.26621420800000123
      ],
      "cold": [
        0.772961083000002,
        0.7851828339999993,
        0.7689769579999993,
        0.7633559170000008,
        0.7725272089999963
      ]
    }
  }
}
```
