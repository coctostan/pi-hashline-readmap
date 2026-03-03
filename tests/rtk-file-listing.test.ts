import { describe, it, expect } from "vitest";
import { isFileListingCommand, compressFileListingOutput } from "../src/rtk/file-listing.js";

describe("isFileListingCommand", () => {
  it("matches find, ls -R, ls -la, tree", () => {
    expect(isFileListingCommand("find . -name '*.ts'")).toBe(true);
    expect(isFileListingCommand("find /tmp -type f")).toBe(true);
    expect(isFileListingCommand("ls -R")).toBe(true);
    expect(isFileListingCommand("ls -la /tmp")).toBe(true);
    expect(isFileListingCommand("ls -lR")).toBe(true);
    expect(isFileListingCommand("tree")).toBe(true);
    expect(isFileListingCommand("tree src/")).toBe(true);
  });

  it("does not match bare ls, cat, grep", () => {
    expect(isFileListingCommand("ls")).toBe(false);
    expect(isFileListingCommand("cat file.txt")).toBe(false);
    expect(isFileListingCommand("grep -r pattern")).toBe(false);
  });
});

describe("compressFileListingOutput", () => {
  it("returns output unchanged if ≤100 lines", () => {
    const shortOutput = Array(100).fill("./src/file.ts").join("\n");
    expect(compressFileListingOutput(shortOutput)).toBe(shortOutput);
  });

  it("groups large find output by directory with counts", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) lines.push(`./src/a/file${i}.ts`);
    for (let i = 0; i < 40; i++) lines.push(`./src/b/file${i}.ts`);
    for (let i = 0; i < 20; i++) lines.push(`./lib/file${i}.js`);
    // 110 lines total
    const result = compressFileListingOutput(lines.join("\n"));
    expect(result).not.toBeNull();
    expect(result).toContain("src/a");
    expect(result).toContain("50");
    expect(result).toContain("src/b");
    expect(result).toContain("40");
    expect(result).toContain("lib");
    expect(result).toContain("20");
    expect(result).toContain("110"); // total
  });

  it("preserves error lines", () => {
    const lines: string[] = [];
    for (let i = 0; i < 105; i++) lines.push(`./src/file${i}.ts`);
    lines.push("find: './secret': Permission denied");
    const result = compressFileListingOutput(lines.join("\n"));
    expect(result).toContain("Permission denied");
  });
});
