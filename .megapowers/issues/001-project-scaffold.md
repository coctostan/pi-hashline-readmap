---
id: 1
type: feature
status: closed
created: 2026-02-26T21:00:00Z
milestone: M1
priority: 1
---

# Project scaffold: package.json, tsconfig, vitest, directory structure

Initialize the project with:

1. **package.json** with combined dependencies:
   - From hashline-edit: xxhashjs, diff
   - From read-map: tree-sitter (0.22.4), tree-sitter-cpp (0.23.4), tree-sitter-rust (0.23.3), tree-sitter-clojure, ts-morph (27.0.2)
   - From pi-rtk: none (zero deps — pure string processing)
   - Peer deps: @mariozechner/pi-coding-agent, @sinclair/typebox
   - Dev deps: vitest, typescript, @types/xxhashjs, @types/node
   - pi.extensions pointing to ./index.ts
   - Scripts: typecheck, test, test:watch, lint

2. **tsconfig.json** with strict mode, ESM output

3. **Directory structure**:
   ```
   pi-hashline-readmap/
   ├── index.ts
   ├── package.json
   ├── tsconfig.json
   ├── prompts/
   ├── scripts/
   ├── src/
   │   ├── readmap/
   │   │   └── mappers/
   │   └── rtk/
   │       └── techniques/
   └── tests/
       ├── unit/
       ├── integration/
       └── fixtures/
   ```

4. **.gitignore** for node_modules, dist, etc.

5. **LICENSE** (MIT)

Verify: `npm install` succeeds, `npx tsc --noEmit` succeeds on empty project.
