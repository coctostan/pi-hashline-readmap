import { describe, it, expect } from "vitest"; // AC10
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("read-map core files (AC10)", () => {
  const required = [
    "src/readmap/mapper.ts",
    "src/readmap/formatter.ts",
    "src/readmap/language-detect.ts",
    "src/readmap/types.ts",
    "src/readmap/constants.ts"
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
