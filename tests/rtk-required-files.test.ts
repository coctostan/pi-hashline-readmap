import { describe, it, expect } from "vitest"; // AC12
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("RTK required files (AC12)", () => {
  const required = [
    "src/rtk/ansi.ts",
    "src/rtk/build.ts",
    "src/rtk/build-tools.ts",
    "src/rtk/transfer.ts",
    "src/rtk/test-output.ts",
    "src/rtk/git.ts",
    "src/rtk/linter.ts",
    "src/rtk/truncate.ts"
  ];

  for (const file of required) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(root, file))).toBe(true);
    });
  }
});
