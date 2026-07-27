import { afterEach, describe, expect, it } from "vitest";
const pendingPreviewHarness = vi.hoisted(() => ({
  projections: new Map<string, { promise: Promise<any>; resolve: (value: any) => void }>(),
  buildSpy: vi.fn(),
}));

function deferredPreview(): { promise: Promise<any>; resolve: (value: any) => void } {
  let resolvePromise!: (value: any) => void;
  const promise = new Promise<any>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

vi.mock("../src/pending-diff-preview.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/pending-diff-preview.js")>();
  return {
    ...actual,
    buildPendingEditPreviewData: (input: any) => {
      pendingPreviewHarness.buildSpy(input);
      const token = input?.edits?.[0]?.replace?.new_text;
      const deferred = pendingPreviewHarness.projections.get(token);
      if (!deferred) throw new Error(`missing deferred preview for ${String(token)}`);
      return deferred.promise;
    },
  };
});

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

  it("gates configured expansion and rejects an older completed preview", async () => {
    process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = "expanded";
    pendingPreviewHarness.projections.clear();
    pendingPreviewHarness.buildSpy.mockClear();
    const streaming = deferredPreview();
    const older = deferredPreview();
    const newer = deferredPreview();
    pendingPreviewHarness.projections.set("streaming", streaming);
    pendingPreviewHarness.projections.set("older", older);
    pendingPreviewHarness.projections.set("newer", newer);

    const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-pending-setting-"));
    const filePath = resolve(cwd, "sample.ts");
    writeFileSync(filePath, "const unique = 1;\n", "utf-8");
    const tool = getEditTool();
    const makeArgs = (newText: string) => ({
      path: filePath,
      edits: [{ replace: { old_text: "const unique = 1;", new_text: newText } }],
    });
    const state: Record<string, any> = {};
    const invalidate = vi.fn();

    tool.renderCall(makeArgs("streaming"), theme, {
      argsComplete: false,
      executionStarted: false,
      cwd,
      state,
      invalidate,
      expanded: false,
    });
    expect(pendingPreviewHarness.buildSpy).not.toHaveBeenCalled();

    const completeContext = {
      argsComplete: true,
      executionStarted: false,
      cwd,
      state,
      invalidate,
      expanded: false,
    };
    tool.renderCall(makeArgs("older"), theme, completeContext);
    tool.renderCall(makeArgs("newer"), theme, completeContext);
    expect(pendingPreviewHarness.buildSpy).toHaveBeenCalledTimes(2);

    const newerResult = {
      type: "ok" as const,
      data: {
        filePath,
        previousContent: "const unique = 1;\n",
        nextContent: "newer\n",
        fileExistedBeforeWrite: true,
        headerLabel: "pending edit" as const,
        diff: "-1 const unique = 1;\n+1 newer",
      },
    };
    newer.resolve(newerResult);
    await Promise.resolve();
    await Promise.resolve();
    older.resolve({ type: "skip", reason: "older result" });
    await Promise.resolve();
    await Promise.resolve();

    expect(state["hashline-edit-pending-preview"].data).toEqual(newerResult);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const rendered = textOf(tool.renderCall(makeArgs("newer"), theme, completeContext));
    expect(rendered).toContain("pending edit");
    expect(rendered).toContain("↳ diff +1 -1");
    expect(rendered).toContain("▌+ 1 │ newer");
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