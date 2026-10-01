import { describe, it, expect } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DiffPreviewComponent } from "../src/tui-diff-component.js";
import type { DiffData } from "../src/diff-data.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters as plain } from "node:util";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { initTheme, keyHint } from "@earendil-works/pi-coding-agent";

vi.unmock("@earendil-works/pi-coding-agent");
initTheme("dark", false);
const hostEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const hostTui = await import(pathToFileURL(
  createRequire(hostEntry).resolve("@earendil-works/pi-tui")
).href);
const { KeybindingsManager: HostKeybindingsManager } = await import(
  new URL("./core/keybindings.js", hostEntry).href
);

const identityTheme = { fg: (_kind: string, text: string) => text } as any;

const longText = "the quick brown fox jumps over the lazy dog and then keeps going far past the right edge of the viewport without stopping";

const longDiffData: DiffData = {
	version: 1,
	entries: [
		{ kind: "remove", oldLine: 1, text: longText },
		{ kind: "add", newLine: 1, text: longText.toUpperCase() },
		{ kind: "context", oldLine: 2, newLine: 2, text: "tail" },
	],
	stats: { added: 1, removed: 1, context: 1 },
	blockRanges: [{ kind: "add", startLine: 1, endLine: 2 }],
};

describe("DiffPreviewComponent", () => {
	it("renders at the width passed to render() rather than a baked-in fallback", () => {
		const comp = new DiffPreviewComponent({
			prefixLines: ["edit /tmp/file.txt (1 edit)", "↳ pending edit"],
			diffData: longDiffData,
			theme: identityTheme,
			expanded: true,
		});
		const at60 = comp.render(60);
		const at160 = comp.render(160);
		for (const line of at60) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
		for (const line of at160) expect(visibleWidth(line)).toBeLessThanOrEqual(160);
		// At 60 columns we must be in unified mode (>= 50 and < 100) and content wraps.
		expect(at60.join("\n")).toContain("↳ diff +1 -1 • 1 hunk • 1 file • unified");
		expect(at60.length).toBeGreaterThan(at160.length);
		// No row should be truncated with an ellipsis when wrap is feasible.
		expect(at60.some((line) => line.endsWith("..."))).toBe(false);
	});

	it("respects expanded=false by omitting the body and showing a hidden hint", () => {
		const comp = new DiffPreviewComponent({
			prefixLines: ["write sample.txt", "↳ pending overwrite"],
			diffData: longDiffData,
			theme: identityTheme,
			expanded: false,
		});
		const lines = comp.render(120);
		const text = lines.join("\n");
		expect(text).toContain("write sample.txt");
		expect(text).toContain("↳ pending overwrite");
		// In collapsed mode the diff renderer emits the hidden-content hint
		// rather than the body rows.
		expect(text).not.toContain("▌- 1 │ ");
		expect(text).not.toContain("▌+ 1 │ ");
		expect(text).toMatch(/^…|^… \(/m);
	});

	it("invalidates cached output when update() changes inputs", () => {
		const comp = new DiffPreviewComponent({
			prefixLines: ["first"],
			diffData: longDiffData,
			theme: identityTheme,
			expanded: true,
		});
		const first = comp.render(80).join("\n");
		comp.update({ prefixLines: ["second"], diffData: longDiffData, theme: identityTheme, expanded: true });
		const second = comp.render(80).join("\n");
		expect(first).toContain("first");
		expect(second).toContain("second");
		expect(second).not.toContain("first");
	});
});

it("refreshes cached collapsed diff hints after a binding change at the same width", () => {
  const previous = hostTui.getKeybindings();
  const bindings = new HostKeybindingsManager();
  hostTui.setKeybindings(bindings);
  try {
    const component = new DiffPreviewComponent({
      diffData: longDiffData,
      theme: identityTheme,
      expanded: false,
    });
    const first = component.render(120);
    assert.strictEqual(component.render(120), first);
    bindings.setUserBindings({ "app.tools.expand": "ctrl+shift+alt+x" });
    const second = component.render(120);
    assert.ok(plain(second.join("\n")).includes(plain(keyHint("app.tools.expand", "to expand"))),
      "cached diff hint must follow binding changes");
    assert.notStrictEqual(second, first);
    assert.strictEqual(component.render(120), second);
    assert.equal(second.length, first.length);
    assert.ok(plain(second.join("\n")).includes("3 more diff lines • 1 more hunk"));
    assert.ok(second.every(line => visibleWidth(line) <= 120));
    for (const disabled of [[], ""] as const) {
      bindings.setUserBindings({ "app.tools.expand": disabled });
      const withoutHint = component.render(120);
      assert.equal(plain(withoutHint[1]), "… (3 more diff lines • 1 more hunk)");
      assert.strictEqual(component.render(120), withoutHint);
      assert.ok(withoutHint.every(line => visibleWidth(line) <= 120));
    }
    component.update({ diffData: longDiffData, theme: identityTheme, expanded: true });
    const expanded = component.render(120);
    assert.ok(expanded.some(line => line.includes("▌-")));
    bindings.setUserBindings({ "app.tools.expand": "ctrl+shift+alt+x" });
    assert.strictEqual(component.render(120), expanded);
  } finally {
    hostTui.setKeybindings(previous);
  }
});

it("renders expanded diffs without initializing the host theme", () => {
  // A fresh process avoids this file's initTheme() and the global keyHint fixture.
  const script = `
    import assert from "node:assert/strict";
    import { DiffPreviewComponent } from "./src/tui-diff-component.ts";
    import { createRequire } from "node:module";
    import { pathToFileURL } from "node:url";
    import { keyText } from "@earendil-works/pi-coding-agent";
    const hostEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
    const hostTui = await import(pathToFileURL(createRequire(hostEntry).resolve("@earendil-works/pi-tui")).href);
    const { KeybindingsManager } = await import(new URL("./core/keybindings.js", hostEntry).href);
    hostTui.setKeybindings(new KeybindingsManager());
    assert.equal(keyText("app.tools.expand"), "ctrl+o");
    const component = new DiffPreviewComponent({
      diffData: ${JSON.stringify(longDiffData)},
      theme: { fg: (_, text) => text, bold: text => text },
      expanded: true,
    });
    const lines = component.render(80);
    assert.ok(lines.some(line => line.includes("▌-")));
    assert.ok(!lines.some(line => line.includes("to expand")));
    assert.strictEqual(component.render(80), lines);
  `;
  execFileSync(process.execPath, [
    "--loader", "./tests/helpers/typescript-loader.mjs", "--input-type=module", "-e", script,
  ], { cwd: fileURLToPath(new URL("../", import.meta.url)), timeout: 10000, stdio: "pipe" });
});
