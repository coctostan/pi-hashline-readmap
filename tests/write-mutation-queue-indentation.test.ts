import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("write mutation queue source layout", () => {
  it("indents every callback-body line beneath withFileMutationQueue", () => {
    const source = readFileSync("src/write.ts", "utf8");
    const start = source.indexOf("return withFileMutationQueue(queueKey, async () => {");
    const end = source.indexOf("\n      });", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const callbackLines = source.slice(start, end).split("\n").slice(1).filter((line) => line.trim());
    expect(callbackLines.every((line) => line.startsWith("        "))).toBe(true);
  });
});
