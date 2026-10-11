import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

describe("map-cache isolation", () => {
  it("src/map-cache.ts has no direct persistence fs calls", async () => {
    const src = await readFile(join(process.cwd(), "src/map-cache.ts"), "utf-8");
    // Persistent cache I/O stays delegated; only private snapshot staging may write.
    const banned = ["readFile", "rename", "readdir", "unlink", "mkdir"];
    for (const name of banned) {
      expect(src).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    const file = ts.createSourceFile("map-cache.ts", src, ts.ScriptTarget.Latest, true);
    const staging = file.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "generateSnapshotMap");
    expect(staging).toBeDefined();
    const writes: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === "writeFile") {
        const parent = node.parent;
        if (ts.isImportSpecifier(parent)) {
          expect(parent.propertyName).toBeUndefined();
        } else {
          expect(ts.isCallExpression(parent) && parent.expression === node).toBe(true);
          expect(node.getStart(file)).toBeGreaterThan(staging!.getStart(file));
          expect(node.getEnd()).toBeLessThan(staging!.getEnd());
          if (ts.isCallExpression(parent)) writes.push(parent);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(writes).toHaveLength(1);
    expect(writes[0].arguments.map(arg => arg.getText(file))).toEqual([
      "stagedPath", "snapshot", '{ mode: 0o600, flag: "wx" }',
    ]);
    const stagingSource = staging!.getText(file);
    expect(stagingSource).toContain('mkdtemp(join(tmpdir(), "pi-readmap-snapshot-"))');
    expect(stagingSource).toContain("join(directory, basename(absPath))");
    expect(stagingSource).toMatch(/finally\s*\{\s*await rm\(directory, \{ recursive: true, force: true \}\)/);
    // Must still import stat (for mtime) — sanity check.
    expect(src).toMatch(/\bstat\b/);
    // Must import from ./persistent-map-cache.
    expect(src).toMatch(/from\s+["']\.\/persistent-map-cache(?:\.js)?["']/);
  });
});
