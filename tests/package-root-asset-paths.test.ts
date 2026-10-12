import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packagePath } from "../src/package-root.js";

const source = (file: string) => readFileSync(file, "utf8");

describe("assets resolve through package-root", () => {
  it("routes the python/go/gdscript outline script paths through the helper", () => {
    for (const name of ["python", "go", "gdscript"]) {
      const text = source(`src/readmap/mappers/${name}.ts`);
      expect(text, name).not.toContain("import.meta.url");
      expect(text, name).toContain('from "../../package-root.js"');
      expect(text, name).not.toContain("../../../scripts");
    }
  });

  it("routes the read, grep and edit prompt URLs through the helper", () => {
    for (const name of ["read", "grep", "edit"]) {
      const text = source(`src/${name}.ts`);
      expect(text, name).not.toContain("import.meta.url");
      expect(text, name).toContain('from "./package-root.js"');
      expect(text, name).toContain(`packageFileUrl("prompts", "${name}.md")`);
    }
  });

  it("routes the sg, write and ls prompt URLs through the helper", () => {
    for (const [file, prompt] of [["sg", "sg.md"], ["write", "write.md"], ["ls", "ls.md"]]) {
      const text = source(`src/${file}.ts`);
      expect(text, file).not.toContain("import.meta.url");
      expect(text, file).toContain('from "./package-root.js"');
      expect(text, file).toContain(`packageFileUrl("prompts", "${prompt}")`);
    }
  });

  it("routes the find and nu prompt URLs through the helper", () => {
    for (const name of ["find", "nu"]) {
      const text = source(`src/${name}.ts`);
      expect(text, name).not.toContain("import.meta.url");
      expect(text, name).toContain('from "./package-root.js"');
      expect(text, name).toContain(`packageFileUrl("prompts", "${name}.md")`);
    }
  });

  it("leaves import.meta.url only in the helper and the createRequire-based resolvers", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(`${dir}/${entry.name}`) : entry.name.endsWith(".ts") ? [`${dir}/${entry.name}`] : [],
      );
    const offenders = walk("src").filter((file) => source(file).includes("import.meta.url"));
    expect(offenders.sort()).toEqual([
      "src/binary-resolution.ts",
      "src/package-root.ts",
      "src/readmap/parser-loader.ts",
    ]);
  });

  it("finds each outline script from the package root", () => {
    for (const file of ["python_outline.py", "go_outline.go", "gdscript_outline.py"]) {
      expect(existsSync(packagePath("scripts", file)), file).toBe(true);
    }
  });
});
