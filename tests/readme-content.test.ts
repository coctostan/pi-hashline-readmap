import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("README.md content (AC-1, AC-2)", () => {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");

  it("documents the read tool with LINE:HASH format", () => {
    expect(readme).toContain("LINE:HASH");
    expect(readme).toContain("`read`");
  });

  it("documents the edit tool", () => {
    expect(readme).toContain("`edit`");
    expect(readme).toContain("set_line");
  });

  it("documents the grep tool", () => {
    expect(readme).toContain("`grep`");
  });

  it("explains why this extension exists (conflict resolution)", () => {
    expect(readme).toContain("conflict");
  });
});
