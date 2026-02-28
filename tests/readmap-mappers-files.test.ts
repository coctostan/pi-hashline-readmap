import { describe, it, expect } from "vitest"; // AC11
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("required read-map mapper files (AC11)", () => {
  const required = [
    "typescript.ts",
    "python.ts",
    "go.ts",
    "rust.ts",
    "json.ts",
    "markdown.ts",
    "fallback.ts"
  ];

  for (const mapper of required) {
    it(`src/readmap/mappers/${mapper} exists`, () => {
      expect(existsSync(resolve(root, `src/readmap/mappers/${mapper}`))).toBe(true);
    });
  }
});
