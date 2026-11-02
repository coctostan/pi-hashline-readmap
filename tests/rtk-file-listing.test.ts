import { describe, it, expect } from "vitest";
import { isFileListingCommand, compressFileListingOutput } from "../src/rtk/file-listing.js";

describe("isFileListingCommand", () => {
  it("matches find", () => {
    expect(isFileListingCommand("find . -name '*.ts'")).toBe(true);
    expect(isFileListingCommand("find /tmp -type f")).toBe(true);
  });

  it.each(["-printf '%s %p\\n'", "-fprintf /dev/stdout '%p'", "-ls", "-fls /dev/stdout", "-exec wc -l {} +", "-execdir ls {} \\;", "-ok rm {} \\;", "-okdir rm {} \\;", "-print0", "-fprint0 /dev/stdout"])(
    "does not match find with the output-shaping action %s, whose lines are no bare paths",
    (action) => {
      expect(isFileListingCommand(`find src -type f ${action}`)).toBe(false);
    },
  );

  it("still matches find whose words only contain an action's name", () => {
    expect(isFileListingCommand("find src -name '*-ls*' -print")).toBe(true);
    expect(isFileListingCommand("find src/-printf -type f")).toBe(true);
  });

  it("reads the shell's words, so a quoted or escaped action is still refused", () => {
    expect(isFileListingCommand("find src '-printf' '%s %p\\n'")).toBe(false);
    expect(isFileListingCommand("find src \\-ls")).toBe(false);
    expect(isFileListingCommand("find $(pwd) -ls")).toBe(false);
    expect(isFileListingCommand("find $(pwd) -type f")).toBe(true);
    expect(isFileListingCommand("LC_ALL=C find src -ls")).toBe(false);
    expect(isFileListingCommand("LC_ALL=C find src")).toBe(true);
  });

  it("does not match ls -R, ls -la or tree, whose entries a summary can't count", () => {
    expect(isFileListingCommand("ls -R")).toBe(false);
    expect(isFileListingCommand("ls -la /tmp")).toBe(false);
    expect(isFileListingCommand("ls -lR")).toBe(false);
    expect(isFileListingCommand("tree")).toBe(false);
    expect(isFileListingCommand("tree src/")).toBe(false);
  });

  it("does not match bare ls, cat, grep", () => {
    expect(isFileListingCommand("ls")).toBe(false);
    expect(isFileListingCommand("cat file.txt")).toBe(false);
    expect(isFileListingCommand("grep -r pattern")).toBe(false);
  });

  it("does not match GNU long-form flags like --all or --recursive", () => {
    expect(isFileListingCommand("ls --all")).toBe(false);
    expect(isFileListingCommand("ls --recursive")).toBe(false);
    expect(isFileListingCommand("ls --long")).toBe(false);
  });
});

describe("compressFileListingOutput", () => {
  it("returns output unchanged if ≤100 lines", () => {
    const shortOutput = Array(100).fill("./src/file.ts").join("\n");
    expect(compressFileListingOutput(shortOutput)).toBe(shortOutput);
    expect(compressFileListingOutput(`${shortOutput}\n`)).toBe(`${shortOutput}\n`);
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
