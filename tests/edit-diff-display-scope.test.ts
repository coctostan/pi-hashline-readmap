import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (stat.isFile() && /\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("edit.diffDisplay scope guard", () => {
  it("only src/hashline-settings.ts and src/edit.ts reference PI_HASHLINE_EDIT_DIFF_DISPLAY or resolveEditDiffDisplay", () => {
    const root = "src";
    const allowed = new Set([
      join(root, "hashline-settings.ts"),
      join(root, "edit.ts"),
    ]);
    const offenders: { file: string; pattern: string }[] = [];
    for (const file of walk(root)) {
      const rel = relative(".", file);
      if (allowed.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (text.includes("PI_HASHLINE_EDIT_DIFF_DISPLAY")) offenders.push({ file: rel, pattern: "PI_HASHLINE_EDIT_DIFF_DISPLAY" });
      if (text.includes("resolveEditDiffDisplay")) offenders.push({ file: rel, pattern: "resolveEditDiffDisplay" });
      if (/\.edit\?\s*\.diffDisplay\b/.test(text) || /\.edit\b[^"]*\.diffDisplay\b/.test(text)) {
        offenders.push({ file: rel, pattern: "edit.diffDisplay" });
      }
    }
    expect(offenders).toEqual([]);
  });
});
