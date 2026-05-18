import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash } from "../src/hashline.js";
import { registerReadTool } from "../src/read.js";

function makeFakePi() {
  const tools: any[] = [];
  return { pi: { registerTool: (t: any) => tools.push(t) } as any, tools };
}

describe("edit replace_symbol variant", () => {
  it("schema admits { replace_symbol: { symbol, new_body } } (no invalid-edit-variant error)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-schema-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp, `export function add() { return 1; }\n`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [{ replace_symbol: { symbol: "add", new_body: "export function add() { return 2; }" } }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    const code = res.details?.ptcValue?.error?.code;
    expect(code).not.toBe("invalid-edit-variant");
  });

  it.each(["", "   ", "\n\n"])("rejects empty/whitespace new_body=%j with invalid-edit-variant", async (body) => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-empty-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp, `export function add() { return 1; }\n`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [{ replace_symbol: { symbol: "add", new_body: body } }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    expect(res.isError).toBe(true);
    expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
  });
});

describe("edit replace_symbol behavior", () => {
  it("replaces the symbol's declaration range and preserves the leading JSDoc comment outside it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp,
`/** doc above */
export function add(a: number, b: number) {
  return a + b;
}
`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute("c", {
      path: fp,
      edits: [{ replace_symbol: { symbol: "add", new_body: "export function add(a: number, b: number) {\n  return a + b + 1;\n}" } }],
    }, undefined, undefined, { cwd: dir });
    expect(res.isError).toBeFalsy();
    const out = readFileSync(fp, "utf-8");
    expect(out).toContain("/** doc above */");
    expect(out).toContain("return a + b + 1;");
    expect(out).not.toContain("return a + b;\n}");
  });

  it("replace_symbol ambiguous error matches the read tool's ambiguous banner verbatim", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-amb-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp,
`function bar() { return 1; }
function bar(n: number) { return n; }
`);
    const readEnv = makeFakePi();
    registerReadTool(readEnv.pi);
    const readTool = readEnv.tools[0];
    const readRes = await readTool.execute("c", { path: fp, symbol: "bar" }, undefined, undefined, { cwd: dir });
    const readBanner = readRes.content?.[0]?.text ?? "";
    expect(readBanner).toContain("is ambiguous.");

    const editEnv = makeFakePi();
    registerEditTool(editEnv.pi, { wasReadInSession: () => true });
    const editTool = editEnv.tools[0];
    const editRes = await editTool.execute("c", {
      path: fp,
      edits: [{ replace_symbol: { symbol: "bar", new_body: "function bar() { return 0; }" } }],
    }, undefined, undefined, { cwd: dir });
    expect(editRes.isError).toBe(true);
    const editMessage = editRes.details?.ptcValue?.error?.message ?? editRes.content?.[0]?.text ?? "";
    expect(editMessage).toBe(readBanner);
  });

  it("replace_symbol not-found error matches the read tool's not-found warning verbatim", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-nf-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp, `export function add() { return 1; }\n`);

    const readEnv = makeFakePi();
    registerReadTool(readEnv.pi);
    const readTool = readEnv.tools[0];
    const readRes = await readTool.execute("c", { path: fp, symbol: "missing" }, undefined, undefined, { cwd: dir });
    const readText = readRes.content?.[0]?.text ?? "";
    const readBanner = readText.split("\n")[0];
    expect(readBanner).toMatch(/^\[Warning: symbol 'missing' not found\./);

    const editEnv = makeFakePi();
    registerEditTool(editEnv.pi, { wasReadInSession: () => true });
    const editTool = editEnv.tools[0];
    const editRes = await editTool.execute("c", {
      path: fp,
      edits: [{ replace_symbol: { symbol: "missing", new_body: "export function missing() {}" } }],
    }, undefined, undefined, { cwd: dir });
    expect(editRes.isError).toBe(true);
    const editMessage = editRes.details?.ptcValue?.error?.message ?? editRes.content?.[0]?.text ?? "";
    expect(editMessage).toContain(readBanner);
  });

  it("replace_symbol returns file-not-read when wasReadInSession is false (no bypass)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-fnr-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp, `export function add() { return 1; }\n`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => false });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [{ replace_symbol: { symbol: "add", new_body: "export function add() { return 2; }" } }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    expect(res.isError).toBe(true);
    expect(res.details?.ptcValue?.error?.code).toBe("file-not-read");
    // File contents must be unchanged.
    expect(readFileSync(fp, "utf-8")).toBe("export function add() { return 1; }\n");
  });

  it("re-indents flush new_body to match the symbol's declaration indentation (in-class)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-indent-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp,
`export class Foo {
  bar() {
    return 1;
  }
}
`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [{ replace_symbol: { symbol: "Foo.bar", new_body: "bar() {\n  return 2;\n}" } }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    expect(res.isError).toBeFalsy();
    const out = readFileSync(fp, "utf-8");
    expect(out).toContain("  bar() {");
    expect(out).toContain("    return 2;");
    expect(out).not.toContain("    return 1;");
  });


  it("replaces a Java method through in-memory symbol lookup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-java-"));
    const fp = join(dir, "Example.java");
    writeFileSync(fp,
`class Example {
  int answer() {
    return 1;
  }
}
`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute("c", {
      path: fp,
      edits: [{ replace_symbol: { symbol: "Example.answer", new_body: "int answer() {\n  return 42;\n}" } }],
    }, undefined, undefined, { cwd: dir });
    expect(res.isError).toBeFalsy();
    const out = readFileSync(fp, "utf-8");
    expect(out).toContain("  int answer() {");
    expect(out).toContain("    return 42;");
    expect(out).not.toContain("return 1;");
  });


  it("returns an unsupported-language error for replace_symbol without a precise content mapper", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-unsupported-"));
    const fp = join(dir, "example.py");
    const content = "def answer():\n    return 1\n\ndef other():\n    return 2\n";
    writeFileSync(fp, content);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute("c", {
      path: fp,
      edits: [{ replace_symbol: { symbol: "answer", new_body: "def answer():\n    return 42" } }],
    }, undefined, undefined, { cwd: dir });
    expect(res.isError).toBe(true);
    expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
    expect(res.details?.ptcValue?.error?.message ?? "").toMatch(/unsupported.*Python/i);
    expect(readFileSync(fp, "utf-8")).toBe(content);
  });

  it("emits name-mismatch warning when new_body declares a different name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-nm-"));
    const fp = join(dir, "x.ts");
    writeFileSync(fp, `export function add(a: number, b: number) {\n  return a + b;\n}\n`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [{ replace_symbol: { symbol: "add", new_body: "export function plus() { return 2; }" } }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    expect(res.isError).toBeFalsy();
    const warnings: string[] = res.details?.ptcValue?.warnings ?? [];
    expect(warnings.some((w) => w.startsWith("name-mismatch: expected add, got plus"))).toBe(true);
  });

  it("rejects an anchored edit whose line falls inside a replace_symbol pre-replace range", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-overlap-"));
    const fp = join(dir, "x.ts");
    writeFileSync(
      fp,
      `export function add(a: number, b: number) {\n  return a + b;\n}\n`,
    );
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [
          { replace_symbol: { symbol: "add", new_body: "export function add(a: number, b: number) {\n  return a + b + 1;\n}" } },
          { set_line: { anchor: `2:${computeLineHash(2, "  return a + b;")}`, new_text: "  return 0;" } },
        ],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    expect(res.isError).toBe(true);
    expect(res.details?.ptcValue?.error?.code).toBe("invalid-edit-variant");
    const msg = res.details?.ptcValue?.error?.message ?? "";
    expect(msg).toMatch(/inside.*replace_symbol/i);
    expect(readFileSync(fp, "utf-8")).toBe(
      `export function add(a: number, b: number) {\n  return a + b;\n}\n`,
    );
  });

  it("resolves the symbol against the file content read in execute() even with persistent caching enabled", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "map-cache-"));
    const prevNoPersist = process.env.PI_HASHLINE_NO_PERSIST_MAPS;
    const prevCacheDir = process.env.PI_HASHLINE_MAP_CACHE_DIR;
    process.env.PI_HASHLINE_NO_PERSIST_MAPS = "0";
    process.env.PI_HASHLINE_MAP_CACHE_DIR = cacheDir;
    try {
      const dir = mkdtempSync(join(tmpdir(), "edit-rs-fresh-"));
      const fp = join(dir, "x.ts");
      writeFileSync(fp, `export function add() { return 1; }\n`);
      const { generateMap } = await import("../src/readmap/mapper.js");
      const mapV1 = await generateMap(fp);
      expect(mapV1?.symbols.some((s: any) => s.name === "add")).toBe(true);
      expect(mapV1?.symbols.some((s: any) => s.name === "sub")).toBe(false);

      writeFileSync(fp, `export function add() { return 1; }\nexport function sub() { return 0; }\n`);

      const { pi, tools } = makeFakePi();
      registerEditTool(pi, { wasReadInSession: () => true });
      const tool = tools[0];
      const res = await tool.execute(
        "c",
        {
          path: fp,
          edits: [{ replace_symbol: { symbol: "sub", new_body: "export function sub() { return -1; }" } }],
        },
        undefined,
        undefined,
        { cwd: dir },
      );
      expect(res.isError).toBeFalsy();
      expect(readFileSync(fp, "utf-8")).toContain("return -1;");
    } finally {
      if (prevNoPersist === undefined) delete process.env.PI_HASHLINE_NO_PERSIST_MAPS;
      else process.env.PI_HASHLINE_NO_PERSIST_MAPS = prevNoPersist;
      if (prevCacheDir === undefined) delete process.env.PI_HASHLINE_MAP_CACHE_DIR;
      else process.env.PI_HASHLINE_MAP_CACHE_DIR = prevCacheDir;
    }
  });

  it("triggers syntax-regression validator when replace_symbol introduces broken syntax (Rust)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-rs-syntax-"));
    const fp = join(dir, "x.rs");
    writeFileSync(fp, `fn add() -> i32 { 1 }\n`);
    const { pi, tools } = makeFakePi();
    registerEditTool(pi, { wasReadInSession: () => true });
    const tool = tools[0];
    const res = await tool.execute(
      "c",
      {
        path: fp,
        edits: [{ replace_symbol: { symbol: "add", new_body: "fn add( -> i32 {\n    1\n" } }],
      },
      undefined,
      undefined,
      { cwd: dir },
    );
    expect(res.isError).toBeFalsy();
    const warnings: string[] = res.details?.ptcValue?.warnings ?? [];
    expect(warnings.some((w) => w.startsWith("syntax-regression"))).toBe(true);
  });
});
