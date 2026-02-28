# pi-hashline-readmap

A unified [pi-coding-agent](https://github.com/nicholasgasior/pi-coding-agent) extension that combines hash-anchored file editing with structural code maps. One extension, no conflicts.

## Why

Two popular pi extensions — `pi-hashline-edit` and `pi-read-map` — both register a `read` tool. Only one can win; whichever loads second overwrites the first. You had to choose between:

- **Hash-anchored editing** — content-addressable lines (`LINE:HASH|`) for drift-proof surgical edits
- **Structural file maps** — AST-based symbol tables for navigating large codebases

This extension combines both into a single package. You get hashlines *and* maps, with zero conflicts.

## What You Get

### `read` — Hash-anchored file reading + structural maps

Every line is prefixed with a `LINE:HASH|` anchor:

```
1:a3f|import { readFile } from "node:fs";
2:b71|import { resolve } from "node:path";
3:05|
4:c2e|export function loadConfig(path: string) {
```

When a file is **truncated** (exceeds 2000 lines or 50KB), a structural map is automatically appended showing classes, functions, and other symbols with line ranges — so you know exactly where to do a targeted read:

```
[Showing lines 1-2000 of 5432. Use offset=2001 to continue.]

## File Map
- class EventEmitter (lines 1-245)
  - method on (lines 12-45)
  - method emit (lines 47-89)
- class DatabaseConnection (lines 250-890)
  - method connect (lines 255-310)
  - method query (lines 312-450)
```

Maps support 17 languages including TypeScript, Python, Rust, Go, C/C++, Java, Ruby, and more. Maps are cached in memory by file modification time.

### `edit` — Hash-verified surgical edits

Use `LINE:HASH` anchors from `read` output to make precise, atomic edits:

- `set_line` — replace a single line
- `replace_lines` — replace a range
- `insert_after` — insert after an anchor
- `replace` — global string replace (fallback)

Hash verification ensures edits target the exact line you intended — no drift, no surprises.

### `grep` — Hash-anchored search

Search results come with `LINE:HASH|` anchors, ready to feed directly into `edit`. No intermediate `read` step needed.

## Installation

From a local clone:

```bash
pi install .
```

From npm (when published):

```bash
pi install npm:pi-hashline-readmap
```

## Output Examples

### Small file (< 2000 lines)

```
1:cf|import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
2:d7|import { registerReadTool } from "./src/read.js";
3:fa|import { registerEditTool } from "./src/edit.js";
4:ff|import { registerGrepTool } from "./src/grep.js";
5:05|
6:af|export default function piHashlineReadmapExtension(pi: ExtensionAPI): void {
7:2a|  registerReadTool(pi);
8:17|  registerEditTool(pi);
9:83|  registerGrepTool(pi);
10:18|}
```

Hashlines only — no map overhead for files that fit in the default window.

### Large file (> 2000 lines)

```
1:a3f|import { EventEmitter } from "node:events";
2:b71|...
...
2000:c4e|  }

[Showing lines 1-2000 of 10680. Use offset=2001 to continue.]

## File Map
- class EventEmitter (lines 1-2450)
  - method on (lines 15-89)
  - method off (lines 91-145)
  - method emit (lines 147-230)
- class DatabaseConnection (lines 2455-5200)
  - method connect (lines 2460-2580)
  ...
```

The structural map gives you a bird's-eye view so you can do targeted reads instead of scrolling through thousands of lines.

## Development

```bash
# Run tests
npm test

# Type check
npm run typecheck
```

## Credits

This extension combines and adapts code from three upstream projects:

- **[pi-hashline-edit](https://github.com/RimuruW/pi-hashline-edit)** (v0.3.0, MIT) by RimuruW — hash-anchored read/edit/grep
- **[pi-read-map](https://github.com/Whamp/pi-read-map)** (v1.3.0, MIT) by Whamp — structural file maps with 17 language mappers
- **[pi-rtk](https://github.com/mcowger/pi-rtk)** (v0.1.3, MIT) by mcowger — bash output techniques (ANSI stripping, test/build/git/linter compression)

## License

[MIT](./LICENSE)
