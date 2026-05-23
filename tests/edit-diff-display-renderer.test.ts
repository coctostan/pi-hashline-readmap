import { afterEach, describe, expect, it } from "vitest";
import { registerEditTool } from "../src/edit.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { vi } from "vitest";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };

function textOf(component: any, width = 120): string {
  return component?.text ?? component?.render?.(width)?.join("\n") ?? "";
}

function getEditTool(): any {
  let registered: any;
  registerEditTool({ registerTool(def: any) { registered = def; } } as any, { wasReadInSession: () => true } as any);
  if (!registered) throw new Error("edit tool was not registered");
  return registered;
}

describe("edit final-result renderer with edit.diffDisplay = expanded", () => {
  const originalEnv = process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    else process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = originalEnv;
  });

  it("renders the diff body inline when context.expanded is false but the env says expanded", () => {
    process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = "expanded";
    const result: any = {
      content: [{ type: "text", text: "1:abc|one\n2:def|TWO" }],
      details: {
        diff: "-2 two\n+2 TWO",
        diffData: {
          version: 1,
          stats: { added: 1, removed: 1, context: 0 },
          entries: [
            { kind: "remove", oldLine: 2, text: "two" },
            { kind: "add", newLine: 2, text: "TWO" },
          ],
        },
        ptcValue: { warnings: [], noopEdits: [] },
      },
    };
    const rendered = textOf(
      getEditTool().renderResult(result, { expanded: false, width: 80 }, theme, { expanded: false, width: 80 }),
      80,
    );
    expect(rendered).toContain("↳ diff +1 -1");
    expect(rendered).toContain("▌+ 2 │ TWO");
  });
});
describe("edit pending-preview renderer with edit.diffDisplay = expanded", () => {
  const originalEnv = process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    else process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = originalEnv;
  });

  it("renders pending preview diff inline when context.expanded is false but the env says expanded", async () => {
    process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = "expanded";
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-pending-setting-"));
    const filePath = resolve(cwd, "sample.ts");
    writeFileSync(filePath, "const unique = 1;\n", "utf-8");
    const tool = getEditTool();
    const context: any = { argsComplete: false, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: false };
    const args = { path: filePath, edits: [{ replace: { old_text: "const unique = 1;", new_text: "const unique = 2;" } }] };

    const first = tool.renderCall(args, theme, context);
    await Promise.resolve();
    const second = tool.renderCall(args, theme, { ...context, lastComponent: first });
    const rendered = textOf(second);

    expect(rendered).toContain("pending edit");
    expect(rendered).toContain("↳ diff +1 -1");
    expect(rendered).toContain("▌+ 1 │ const unique = 2;");
  });
});

describe("edit renderer default behavior is unchanged with no setting and no env", () => {
  const originalEnv = process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    else process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = originalEnv;
    __resetHashlineSettingsPathsForTest();
  });

  it("keeps the final-result diff hidden when nothing requests expansion", () => {
    delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    const root = join(tmpdir(), `edit-diff-renderer-default-${randomBytes(6).toString("hex")}`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });
    const result: any = {
      content: [{ type: "text", text: "1:abc|one\n2:def|TWO" }],
      details: {
        diff: "-2 two\n+2 TWO",
        diffData: {
          version: 1,
          stats: { added: 1, removed: 1, context: 0 },
          entries: [
            { kind: "remove", oldLine: 2, text: "two" },
            { kind: "add", newLine: 2, text: "TWO" },
          ],
        },
        ptcValue: { warnings: [], noopEdits: [] },
      },
    };
    const rendered = textOf(
      getEditTool().renderResult(result, { expanded: false, width: 80 }, theme, { expanded: false, width: 80 }),
      80,
    );
    expect(rendered).not.toContain("↳ diff +1 -1");
    expect(rendered).not.toContain("▌+ 2 │ TWO");
  });

  it("still expands the final-result diff when context.expanded is true", () => {
    delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    const root = join(tmpdir(), `edit-diff-renderer-ctx-${randomBytes(6).toString("hex")}`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });
    const result: any = {
      content: [{ type: "text", text: "1:abc|one\n2:def|TWO" }],
      details: {
        diff: "-2 two\n+2 TWO",
        diffData: {
          version: 1,
          stats: { added: 1, removed: 1, context: 0 },
          entries: [
            { kind: "remove", oldLine: 2, text: "two" },
            { kind: "add", newLine: 2, text: "TWO" },
          ],
        },
        ptcValue: { warnings: [], noopEdits: [] },
      },
    };
    const rendered = textOf(
      getEditTool().renderResult(result, { expanded: true, width: 80 }, theme, { expanded: true, width: 80 }),
      80,
    );
    expect(rendered).toContain("↳ diff +1 -1");
    expect(rendered).toContain("▌+ 2 │ TWO");
  });
});