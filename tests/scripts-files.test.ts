import { describe, it, expect } from "vitest"; // AC14
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("outline scripts (AC14)", () => {
  it("scripts/python_outline.py exists", () => {
    expect(existsSync(resolve(root, "scripts/python_outline.py"))).toBe(true);
  });

  it("scripts/go_outline.go exists", () => {
    expect(existsSync(resolve(root, "scripts/go_outline.go"))).toBe(true);
  });
});
