import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walkTsFiles(path));
    else if (entry.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("internal relative import specifiers", () => {
  it("do not use extensionless relative imports in src", () => {
    const offenders: string[] = [];
    const importRe = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["'](\.\.?\/[^"']+)["']/g;

    for (const file of walkTsFiles("src")) {
      const text = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(text))) {
        const specifier = match[1];
        const lastSegment = specifier.split("/").pop() ?? "";
        if (!lastSegment.includes(".")) offenders.push(`${relative(process.cwd(), file)}: ${specifier}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
