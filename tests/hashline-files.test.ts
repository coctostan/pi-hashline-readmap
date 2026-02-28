import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("hashline source files (AC9)", () => { // AC9
  const required = [
    "src/read.ts",
    "src/edit.ts",
    "src/grep.ts",
    "src/hashline.ts",
    "src/path-utils.ts",
    "src/runtime.ts"
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
