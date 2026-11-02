import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const lockedPi: string = JSON.parse(readFileSync("package-lock.json", "utf8"))
  .packages["node_modules/@earendil-works/pi-coding-agent"].version;

const docFiles = [
  "README.md",
  "AGENTS.md",
  ...readdirSync("docs", { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs", name)),
];

const MENTION = /\bPi (\d+\.\d+(?:\.\d+)?)/g;
const MINIMUM_CLAIM = /^(\+|\s+(and newer|or later|or newer)\b)/;
const CURRENT_CLAIM = /\b(locked|currently)\s+$/;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

// A Pi version passes as the locked host, a minimum-version claim, or a dated measurement;
// a "locked"/"currently" mention must be the locked host even on a dated line.
function hostVersionViolations(text: string, locked: string): string[] {
  const violations: string[] = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(MENTION)) {
      const version = match[1];
      if (locked === version || locked.startsWith(`${version}.`)) continue;
      const before = line.slice(0, match.index);
      const after = line.slice(match.index + match[0].length);
      if (MINIMUM_CLAIM.test(after)) continue;
      if (ISO_DATE.test(line) && !CURRENT_CLAIM.test(before)) continue;
      violations.push(`${index + 1}: ${match[0]}`);
    }
  });
  return violations;
}

describe("host version in the docs", () => {
  it("reads the locked Pi version from package-lock.json", () => {
    expect(lockedPi).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("names no Pi version but the locked one, outside minimum claims and dated measurements", () => {
    const violations = docFiles.flatMap((file) =>
      hostVersionViolations(readFileSync(file, "utf8"), lockedPi).map((v) => `${file}:${v}`),
    );
    expect(violations).toEqual([]);
  });

  it("applies the rule to each form", () => {
    expect(hostVersionViolations("the locked Pi 1.4.0 host", "1.4.0")).toEqual([]);
    expect(hostVersionViolations("on Pi 1.4", "1.4.0")).toEqual([]);
    expect(hostVersionViolations("Pi 0.99+ and Pi 1.0.0 and newer, Pi 1.1 or later", "1.4.0")).toEqual([]);
    expect(hostVersionViolations("measured with Pi 1.1.0 on 2026-10-12", "1.4.0")).toEqual([]);
    expect(hostVersionViolations("the locked Pi 1.3.0", "1.4.0")).toEqual(["1: Pi 1.3.0"]);
    expect(hostVersionViolations("on the locked Pi 1.3.0 (2026-11-01)", "1.4.0")).toEqual(["1: Pi 1.3.0"]);
    expect(hostVersionViolations("currently Pi 1.3.0 (2026-11-01)", "1.4.0")).toEqual(["1: Pi 1.3.0"]);
    expect(hostVersionViolations("x\nOn Pi 1.1, enable it", "1.4.0")).toEqual(["2: Pi 1.1"]);
    expect(hostVersionViolations("on Pi 1.4", "1.40.0")).toEqual(["1: Pi 1.4"]);
  });
});
