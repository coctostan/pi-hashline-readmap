import { describe, it, expect } from "vitest"; // AC13
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(relative(dir, full));
    }
  }
  return out;
}

describe("RTK forbidden files (AC13)", () => {
  it("src/rtk/source.ts does not exist", () => {
    expect(existsSync(resolve(root, "src/rtk/source.ts"))).toBe(false);
  });

  it("src/rtk/search.ts does not exist", () => {
    expect(existsSync(resolve(root, "src/rtk/search.ts"))).toBe(false);
  });

  it("no nested source.ts/search.ts exists under src/rtk", () => {
    const rtkRoot = resolve(root, "src/rtk");
    const files = walkFiles(rtkRoot);
    expect(files.some((f) => f.endsWith("source.ts"))).toBe(false);
    expect(files.some((f) => f.endsWith("search.ts"))).toBe(false);
  });
});
