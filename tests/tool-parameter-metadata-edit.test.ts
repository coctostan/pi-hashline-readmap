import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerEditTool } from "../src/edit.js";
const execute = (tool: any, input: Record<string, unknown>, cwd: string) => tool.execute("metadata", input, new AbortController().signal, undefined, { cwd });

describe("provider-visible edit constraints", () => {
  it("states preflight rules and preserves rejection-before-mutation", async () => {
    const edit = registerEditTool({ registerTool() {} } as any) as any;
    const p = edit.parameters.properties; const variants = p.edits.items.anyOf;
    expect(p.path.description).toBe("Existing file path; requires fresh session anchors");
    expect(p.edits.description).toBe("Non-empty; each item has exactly one supported variant");
    expect(p.edits.items.description).toBe("Overlaps reject; set_line last wins; safe insert_after ok");
    expect(variants[0].properties.set_line.properties.anchor.description).toBe("Fresh LINE:HASH anchor");
    expect(variants[1].properties.replace_lines.properties.start_anchor.description).toBe("Fresh LINE:HASH start anchor");
    expect(variants[1].properties.replace_lines.properties.end_anchor.description).toBe("Fresh LINE:HASH end anchor");
    expect(variants[2].properties.insert_after.properties.anchor.description).toBe("Fresh LINE:HASH anchor");
    expect(variants[3].properties.replace.properties.old_text.description).toBe("Non-empty exact target text");
    expect(variants[4].properties.replace_symbol.properties.new_body.description).toBe("Non-blank complete symbol body");
    const cwd = mkdtempSync(join(tmpdir(), "hashline-edit-metadata-")); const target = join(cwd, "target.txt"); writeFileSync(target, "alpha\n");
    expect(await execute(edit, { path: target, edits: [] }, cwd)).toMatchObject({ isError: true, content: [{ type: "text", text: "No edits provided." }], details: { ptcValue: { tool: "edit", ok: false, error: { code: "invalid-edit-variant" } } } });
    const two = await execute(edit, { path: target, edits: [{ replace: { old_text: "alpha", new_text: "beta" }, set_line: { anchor: "1:000", new_text: "beta" } }] }, cwd);
    expect(two.content[0].text).toContain("must contain exactly one of"); expect(readFileSync(target, "utf8")).toBe("alpha\n");
    expect((await execute(edit, { path: target, edits: [{ replace: { old_text: "", new_text: "beta" } }] }, cwd)).content[0].text).toBe("replace.old_text must not be empty.");
    expect((await execute(edit, { path: target, edits: [{ replace_symbol: { symbol: "alpha", new_body: "   " } }] }, cwd)).content[0].text).toBe("replace_symbol.new_body must not be empty or whitespace-only.");
  });
});
