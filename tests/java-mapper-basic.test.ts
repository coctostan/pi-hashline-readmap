import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { javaMapper, MAPPER_VERSION } from "../src/readmap/mappers/java.js";
import { SymbolKind } from "../src/readmap/enums.js";

const dirs: string[] = [];

async function writeJava(name: string, source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pi-java-basic-"));
  dirs.push(dir);
  const file = join(dir, name);
  await writeFile(file, source, "utf8");
  return file;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("javaMapper basic tree-sitter extraction", () => {
  it("exports version 4 and maps a class with package/imports", async () => {
    const file = await writeJava("Example.java", [
      "package com.example.demo;",
      "",
      "import java.util.List;",
      "import static java.util.Collections.emptyList;",
      "",
      "public class Example {",
      "}",
      "",
    ].join("\n"));

    const map = await javaMapper(file);

    expect(MAPPER_VERSION).toBe(4);
    expect(map).not.toBeNull();
    expect(map!.language).toBe("Java");
    expect(map!.imports).toEqual([
      "package com.example.demo;",
      "import java.util.List;",
      "import static java.util.Collections.emptyList;",
    ]);
    expect(map!.symbols).toEqual([
      expect.objectContaining({
        name: "Example",
        kind: SymbolKind.Class,
        startLine: 6,
        endLine: 7,
        signature: "public class Example",
        modifiers: ["public"],
        isExported: true,
      }),
    ]);
  });
});
