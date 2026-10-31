---
recovered: AGENTS.md "Build contract"; docs/startup-performance.md; PR #232
---
# Ship one esbuild bundle, keep source as the fallback

Pi's jiti loader transforms ~107 TypeScript modules one by one at startup, so the package ships `dist/index.js`, one ESM bundle with every npm package external, and `pi.extensions` points at it; an unbuilt checkout falls back to `index.ts`. Peers resolve only through the host loader's alias map, so the bundle never runs under a native Node import.
