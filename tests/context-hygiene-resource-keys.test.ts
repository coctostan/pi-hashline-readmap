import { describe, expect, it } from "vitest";
import {
  buildCommandResource,
  buildContextHygieneMetadata,
  buildFileResource,
  buildSymbolResource,
  normalizeCommandForContextHygiene,
  normalizePathForContextHygiene,
} from "../src/context-hygiene.js";

describe("context hygiene resource keys", () => {
  it("builds deterministic file resources from paths", () => {
    expect(buildFileResource("src/read.ts")).toEqual({
      kind: "file",
      key: "file:src/read.ts",
      path: "src/read.ts",
    });

    expect(buildFileResource("src\\read.ts")).toEqual(buildFileResource("src/read.ts"));
    expect(buildFileResource("./src/read.ts")).toEqual(buildFileResource("src/read.ts"));
    expect(buildFileResource("src/../src/read.ts")).toEqual(buildFileResource("src/read.ts"));
    expect(buildFileResource("src//read.ts")).toEqual(buildFileResource("src/read.ts"));
  });

  it("matches Windows backslash paths against slash-normalized stale resource keys", () => {
    const backslashPath = "C:\\Users\\Agent\\AppData\\Local\\Temp\\sample.ts";
    const slashPath = "C:/Users/Agent/AppData/Local/Temp/sample.ts";

    expect(normalizePathForContextHygiene(backslashPath)).toBe(slashPath);
    expect(buildFileResource(backslashPath)).toEqual({
      kind: "file",
      key: `file:${slashPath}`,
      path: slashPath,
    });
    expect(buildFileResource(backslashPath)).toEqual(buildFileResource(slashPath));
  });

  it("builds deterministic symbol resources scoped to files", () => {
    expect(buildSymbolResource("src/read.ts", "buildReadOutput", "function")).toEqual({
      kind: "symbol",
      key: 'symbol:["src/read.ts","function","buildReadOutput"]',
      path: "src/read.ts",
      symbolName: "buildReadOutput",
      symbolKind: "function",
    });


    expect(buildSymbolResource("src/a.ts", "function:parse").key).not.toBe(
      buildSymbolResource("src/a.ts", "parse", "function").key,
    );
  });

  it("normalizes commands and classifies command resources", () => {
    expect(normalizeCommandForContextHygiene("  npm   test  ")).toBe("npm test");
    expect(normalizeCommandForContextHygiene("printf 'a  b'")).toBe("printf 'a  b'");

    expect(buildCommandResource("  npm   test  ")).toEqual({
      kind: "command",
      key: "command:test:npm test",
      command: "npm test",
      commandKind: "test",
    });

    expect(buildCommandResource("npm run typecheck").commandKind).toBe("typecheck");
    expect(buildCommandResource("git status --short").commandKind).toBe("vcs");
    expect(buildCommandResource("node script.js").commandKind).toBe("other");
  });

  it("builds additive metadata without mutating resources", () => {
    const fileResource = buildFileResource("src/read.ts");
    const metadata = buildContextHygieneMetadata({
      tool: "read",
      classification: "read-context",
      resources: [fileResource, fileResource],
    });

    expect(metadata).toEqual({
      schemaVersion: 1,
      tool: "read",
      classification: "read-context",
      resources: [fileResource],
    });
    expect(fileResource).toEqual({
      kind: "file",
      key: "file:src/read.ts",
      path: "src/read.ts",
    });
  });
});
