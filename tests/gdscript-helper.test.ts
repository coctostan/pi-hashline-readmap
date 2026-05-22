import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const fixture = resolve("tests/fixtures/gdscript/Player.gd");

async function fakeGdtoolkitRoot(): Promise<string> {
  const root = join(tmpdir(), `fake-gdtoolkit-${randomBytes(6).toString("hex")}`);
  await mkdir(join(root, "gdtoolkit"), { recursive: true });
  await writeFile(join(root, "gdtoolkit", "__init__.py"), "");
  await writeFile(join(root, "gdtoolkit", "parser.py"), `
class Node:
    def __init__(self, data, children=None, line=1, end_line=None, value=None):
        self.data = data
        self.children = children or []
        self.line = line
        self.end_line = end_line or line
        self.value = value

class Parser:
    def parse(self, source):
        return Node("file", [
            Node("class_name", value="Player", line=1, end_line=17),
            Node("signal_stmt", value="health_changed", line=3),
            Node("enum_stmt", value="State", line=4),
            Node("const_stmt", value="MAX_HEALTH", line=6),
            Node("var_stmt", value="health", line=7),
            Node("var_stmt", value="weapon", line=8),
            Node("preload", value="res://weapons/sword.gd", line=8),
            Node("load", value="res://enemies/enemy.gd", line=9),
            Node("requires", value="res://shared/constants.gd", line=10),
            Node("func_def", value="func _ready() -> void:", line=12, end_line=13),
            Node("func_def", value="func take_damage(amount: int) -> void:", line=15, end_line=17),
        ])

def parse(source):
    return Parser().parse(source)
`);
  return root;
}

describe("scripts/gdscript_outline.py", () => {
  it("walks gdtoolkit.parser AST output for symbols and imports", async () => {
    const root = await fakeGdtoolkitRoot();
    try {
      const { stdout } = await execFileAsync("python3", ["scripts/gdscript_outline.py", fixture], {
        env: { ...process.env, PYTHONPATH: root },
      });
      const parsed = JSON.parse(stdout) as { imports: string[]; symbols: Array<{ name: string; kind: string; startLine: number; endLine: number; signature?: string }> };
      expect(parsed.imports).toEqual(["res://weapons/sword.gd", "res://enemies/enemy.gd", "res://shared/constants.gd"]);
      expect(parsed.symbols).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "Player", kind: "class", startLine: 1, endLine: 17 }),
        expect.objectContaining({ name: "health_changed", kind: "signal", startLine: 3, endLine: 3 }),
        expect.objectContaining({ name: "State", kind: "enum", startLine: 4, endLine: 4 }),
        expect.objectContaining({ name: "MAX_HEALTH", kind: "constant", startLine: 6, endLine: 6 }),
        expect.objectContaining({ name: "health", kind: "variable", startLine: 7, endLine: 7 }),
        expect.objectContaining({ name: "weapon", kind: "variable", startLine: 8, endLine: 8 }),
        expect.objectContaining({ name: "_ready", kind: "function", startLine: 12, endLine: 13, signature: "func _ready() -> void:" }),
        expect.objectContaining({ name: "take_damage", kind: "function", startLine: 15, endLine: 17, signature: "func take_damage(amount: int) -> void:" }),
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the packaged helper and representative GDScript fixture covered", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { files?: string[] };
    expect(packageJson.files).toEqual(expect.arrayContaining(["scripts/gdscript_outline.py"]));

    const source = await readFile(fixture, "utf8");
    expect(source).toContain("class_name Player");
    expect(source).toContain("signal health_changed");
    expect(source).toContain("enum State");
    expect(source).toContain("const MAX_HEALTH");
    expect(source).toContain("var health");
    expect(source).toContain("var weapon");
    expect(source).toContain("preload(\"res://weapons/sword.gd\")");
    expect(source).toContain("load(\"res://enemies/enemy.gd\")");
    expect(source).toContain("requires(\"res://shared/constants.gd\")");
    expect(source).toContain("func _ready() -> void:");
    expect(source).toContain("func take_damage(amount: int) -> void:");
  });
});
