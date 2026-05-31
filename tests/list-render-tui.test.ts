import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resetCapabilitiesCache, setCapabilities } from "@earendil-works/pi-tui";
import { registerFindTool } from "../src/find.js";
import { registerLsTool } from "../src/ls.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function capture(register: (pi: any) => any): any { let registered: any; register({ registerTool(def: any) { registered = def; } }); return registered; }
function textOf(component: any): string { return component?.text ?? component?.render?.(80)?.join("\n") ?? ""; }

afterEach(() => {
  resetCapabilitiesCache();
});

describe("list TUI renderers", () => {
  it("renders compact find output", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const find = capture(registerFindTool as any);
    expect(textOf(find.renderCall({ pattern: "*.ts", path: "src" }, theme))).toBe("find *.ts in src");
    const result = { content: [{ type: "text", text: "a.ts\nb.ts" }], details: { ptcValue: { tool: "find", totalEntries: 2, truncated: false, entries: ["a.ts", "b.ts"] } } };
    expect(textOf(find.renderResult(result, {}, theme, {}))).toBe("↳ 2 results returned • Ctrl+O to expand");
  });

  it("wraps the find path title in an OSC 8 hyperlink when supported", () => {
    const cwd = process.cwd();
    const expectedUrl = pathToFileURL(resolve(cwd, "src")).href;
    const find = capture(registerFindTool as any);

    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const linkedFind = textOf(find.renderCall({ pattern: "*.ts", path: "src" }, theme, { cwd }));
    expect(linkedFind).toContain("\u001b]8;;file:///");
    expect(linkedFind).toContain(`\u001b]8;;${expectedUrl}\u001b\\`);
    expect(linkedFind).toContain("find *.ts in ");
    expect(linkedFind).toContain("src");

    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(textOf(find.renderCall({ pattern: "*.ts", path: "src" }, theme, { cwd }))).toBe("find *.ts in src");
  });

  it("renders compact ls output", () => {
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const ls = capture(registerLsTool as any);
    expect(textOf(ls.renderCall({ path: "src" }, theme))).toBe("ls src");
    const result = { content: [{ type: "text", text: "read.ts\nwrite.ts" }], details: { ptcValue: { tool: "ls", totalEntries: 2, truncated: false, entries: ["read.ts", "write.ts"] } } };
    expect(textOf(ls.renderResult(result, {}, theme, {}))).toBe("↳ 2 entries returned • Ctrl+O to expand");
  });

  it("wraps the ls path title in an OSC 8 hyperlink when supported", () => {
    const cwd = process.cwd();
    const expectedUrl = pathToFileURL(resolve(cwd, "src")).href;
    const ls = capture(registerLsTool as any);

    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const linkedLs = textOf(ls.renderCall({ path: "src" }, theme, { cwd }));
    expect(linkedLs).toContain("\u001b]8;;file:///");
    expect(linkedLs).toContain(`\u001b]8;;${expectedUrl}\u001b\\`);
    expect(linkedLs).toContain("ls ");
    expect(linkedLs).toContain("src");

    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(textOf(ls.renderCall({ path: "src" }, theme, { cwd }))).toBe("ls src");
  });

  it("keeps find and ls error summaries visible and expands details", () => {
    const find = capture(registerFindTool as any);
    const ls = capture(registerLsTool as any);
    const failed = { isError: true, content: [{ type: "text", text: "permission denied\nfull detail" }] };

    expect(textOf(find.renderResult(failed, {}, theme, {}))).toBe("↳ permission denied");
    expect(textOf(find.renderResult(failed, { expanded: true }, theme, { expanded: true }))).toContain("full detail");
    expect(textOf(ls.renderResult(failed, {}, theme, {}))).toBe("↳ permission denied");
    expect(textOf(ls.renderResult(failed, { expanded: true }, theme, { expanded: true }))).toContain("full detail");
  });
});
