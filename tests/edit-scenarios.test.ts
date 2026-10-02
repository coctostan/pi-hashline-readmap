/**
 * Deterministic tool-level versions of the pi-edit-benchmark scenarios
 * (https://github.com/YuGiMob/pi-edit-benchmark, MIT). Fixtures and expected bytes are copied from
 * its scenario catalog. The model's part is played by the anchored edit a careful model would
 * issue; staleness scenarios change the file between the read and the edit, as that benchmark does.
 * Calls run through the extension entry point, so the tool_result hooks that track what the model
 * was shown are exercised exactly as in Pi.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

interface CallResult {
  text: string;
  isError: boolean;
  details: any;
}

function session(fileName: string, fixture: string, others: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "edit-scenario-"));
  const file = join(dir, fileName);
  writeFileSync(file, Buffer.from(fixture, "utf8"));
  for (const [name, content] of Object.entries(others)) writeFileSync(join(dir, name), Buffer.from(content, "utf8"));
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);
  let next = 0;

  async function call(name: string, params: Record<string, unknown>): Promise<CallResult> {
    const tool = tools.get(name);
    const id = `call-${next++}`;
    const args = tool.prepareArguments ? tool.prepareArguments(params) : params;
    await handlers.tool_call?.({ type: "tool_call", toolName: name, toolCallId: id, input: args }, { cwd: dir });
    let result: any;
    try {
      result = await tool.execute(id, args, new AbortController().signal, undefined, { cwd: dir });
    } catch (error) {
      // Pi reports a thrown tool error to the model as an error result with its message.
      result = { content: [{ type: "text", text: (error as Error).message }], details: undefined, isError: true };
    }
    const event = {
      type: "tool_result",
      toolName: name,
      toolCallId: id,
      input: args,
      content: result.content,
      details: result.details,
      isError: result.isError === true,
    };
    const patched = await handlers.tool_result?.(event, { cwd: dir });
    const final = patched ? { ...result, ...patched } : result;
    const text = (final.content as Array<{ type: string; text?: string }>)
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n");
    return { text, isError: final.isError === true, details: final.details };
  }

  return {
    read: (path = fileName) => call("read", { path }),
    edit: (edits: unknown[], path = fileName) => call("edit", { path, edits }),
    bytes: (path = fileName) => readFileSync(join(dir, path), "utf8"),
    mutate: (next: string, path = fileName) => writeFileSync(join(dir, path), next, "utf8"),
  };
}

/** Rows `LINE:HASH|content` in tool output, in order. */
function rows(text: string): Array<{ anchor: string; content: string }> {
  const out: Array<{ anchor: string; content: string }> = [];
  for (const line of text.split("\n")) {
    const match = /^(?:>>> | {2,4})?(\d+:[0-9a-f]{3})\|(.*)$/.exec(line);
    if (match) out.push({ anchor: match[1], content: match[2] });
  }
  return out;
}

/** Anchor of the `nth` (1-based) row whose content is exactly `content`. */
function anchor(text: string, content: string, nth = 1): string {
  const found = rows(text).filter((row) => row.content === content)[nth - 1];
  if (!found) throw new Error(`no row ${JSON.stringify(content)} in:\n${text}`);
  return found.anchor;
}

beforeAll(async () => {
  await ensureHashInit();
});

describe("core editing", () => {
  it("single-line", async () => {
    const s = session("single.ts", "aaa\nbbb\nccc\nddd\n");
    const r = await s.read();
    expect((await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "BBB" } }])).isError).toBe(false);
    expect(s.bytes()).toBe("aaa\nBBB\nccc\nddd\n");
  });

  it("range", async () => {
    const s = session("range.ts", "aaa\nbbb\nccc\nddd\neee\n");
    const r = await s.read();
    await s.edit([{ replace_lines: { start_anchor: anchor(r.text, "bbb"), end_anchor: anchor(r.text, "ddd"), new_text: "B\nC\nD" } }]);
    expect(s.bytes()).toBe("aaa\nB\nC\nD\neee\n");
  });

  it("delete-line", async () => {
    const s = session("delete.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "" } }]);
    expect(s.bytes()).toBe("aaa\nccc\n");
  });

  it("duplicate-nth", async () => {
    const s = session("duplicate.ts", "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "}", 2), new_text: "};" } }]);
    expect(s.bytes()).toBe("function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n};\n");
  });

  it("duplicate-import", async () => {
    const s = session("dup-import.ts", "import { a } from 'x';\nimport { b } from 'y';\nimport { a } from 'x';\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "import { a } from 'x';", 2), new_text: "import { a2 } from 'x';" } }]);
    expect(s.bytes()).toBe("import { a } from 'x';\nimport { b } from 'y';\nimport { a2 } from 'x';\n");
  });

  it("whitespace-only", async () => {
    const s = session("ws.ts", "aaa\nbbb  \nccc\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "bbb  "), new_text: "BBB" } }]);
    expect(s.bytes()).toBe("aaa\nBBB\nccc\n");
  });

  it.each([
    ["crlf", "crlf.txt", "alpha\r\nbeta\r\ngamma\r\n", "alpha\r\nBETA\r\ngamma\r\n"],
    ["bom", "bom.txt", "\uFEFFalpha\nbeta\ngamma\n", "\uFEFFalpha\nBETA\ngamma\n"],
    ["crlf-bom", "crlf-bom.txt", "\uFEFFalpha\r\nbeta\r\ngamma\r\n", "\uFEFFalpha\r\nBETA\r\ngamma\r\n"],
  ])("%s survives", async (_name, fileName, fixture, expected) => {
    const s = session(fileName, fixture);
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "beta"), new_text: "BETA" } }]);
    expect(s.bytes()).toBe(expected);
  });

  it("empty-file: the single empty row anchors the first insertion", async () => {
    const s = session("empty.txt", "");
    const r = await s.read();
    expect(rows(r.text)).toHaveLength(1);
    await s.edit([{ insert_after: { anchor: rows(r.text)[0].anchor, new_text: "first\nsecond" } }]);
    expect(s.bytes()).toBe("first\nsecond");
  });

  it("noop: identical replacement succeeds and leaves the bytes alone", async () => {
    const s = session("noop.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    const result = await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "bbb" } }]);
    expect(result.isError).toBe(false);
    expect(result.text).toContain("No changes made");
    expect(s.bytes()).toBe("aaa\nbbb\nccc\n");
  });

  it("insert-after", async () => {
    const s = session("insert.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    await s.edit([{ insert_after: { anchor: anchor(r.text, "bbb"), new_text: "B1\nB2" } }]);
    expect(s.bytes()).toBe("aaa\nbbb\nB1\nB2\nccc\n");
  });

  it("unicode", async () => {
    const s = session("unicode.txt", "h\u00e9llo w\u00f6rld\n\u65e5\u672c\u8a9e\u306e\u884c \ud83c\udf89\n\u0441\u043c\u0435\u0441\u044c\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "\u65e5\u672c\u8a9e\u306e\u884c \ud83c\udf89"), new_text: "\u65e5\u672c\u8a9e\u306e\u884c \ud83d\ude80" } }]);
    expect(s.bytes()).toBe("h\u00e9llo w\u00f6rld\n\u65e5\u672c\u8a9e\u306e\u884c \ud83d\ude80\n\u0441\u043c\u0435\u0441\u044c\n");
  });

  it("tabs", async () => {
    const s = session("tabs.ts", "function f() {\n\treturn 1;\n\t\t// deeply nested\n}\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "\treturn 1;"), new_text: "\treturn 2;" } }]);
    expect(s.bytes()).toBe("function f() {\n\treturn 2;\n\t\t// deeply nested\n}\n");
  });

  it("no-trailing-newline", async () => {
    const s = session("nonl.ts", "aaa\nbbb");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "BBB" } }]);
    expect(s.bytes()).toBe("aaa\nBBB");
  });

  it("delete-range", async () => {
    const s = session("delete-range.ts", "aaa\nbbb\nccc\nddd\n");
    const r = await s.read();
    await s.edit([{ replace_lines: { start_anchor: anchor(r.text, "bbb"), end_anchor: anchor(r.text, "ccc"), new_text: "" } }]);
    expect(s.bytes()).toBe("aaa\nddd\n");
  });

  it("insert-eof: read shows no phantom empty row, and inserting after the last line keeps the final newline", async () => {
    const s = session("eof-insert.ts", "aaa\nbbb\n");
    const r = await s.read();
    expect(rows(r.text).map((row) => row.content)).toEqual(["aaa", "bbb"]);
    await s.edit([{ insert_after: { anchor: anchor(r.text, "bbb"), new_text: "CCC" } }]);
    expect(s.bytes()).toBe("aaa\nbbb\nCCC\n");
  });

  it("insert-eof: an anchor on the old phantom row still appends before the final newline", async () => {
    const s = session("eof-insert.ts", "aaa\nbbb\n");
    await s.read();
    await s.edit([{ insert_after: { anchor: `3:${computeLineHash(3, "")}`, new_text: "CCC" } }]);
    expect(s.bytes()).toBe("aaa\nbbb\nCCC\n");
  });

  it("sub-line-token", async () => {
    const fixture =
      'function loadConfig() {\n  const endpoint = "https://api.example.com/v1/resources?limit=100&sort=asc";\n  const fallback = "https://api.example.com/v1/resources?limit=25&sort=desc";\n  return { endpoint, fallback };\n';
    const s = session("sub-line.ts", fixture);
    await s.read();
    await s.edit([{ replace: { old_text: "limit=100&sort=asc", new_text: "limit=250&sort=asc" } }]);
    expect(s.bytes()).toBe(fixture.replace("limit=100", "limit=250"));
  });

  it("replace-all", async () => {
    const fixture = "script:\n  stage: deploy --env stage\n  canary: deploy --env canary\n  prod: deploy --env prod\n  smoke: deploy --env smoke\n";
    const s = session("replace-all.yaml", fixture);
    await s.read();
    await s.edit([{ replace: { old_text: "deploy", new_text: "ship", all: true } }]);
    expect(s.bytes()).toBe(fixture.replaceAll("deploy", "ship"));
  });

  it("batch-edits", async () => {
    const s = session("config.yaml", "server:\n  host: localhost\n  port: 8080\n  timeout: 30\n  workers: 4\n  loglevel: info\n");
    const r = await s.read();
    await s.edit([
      { set_line: { anchor: anchor(r.text, "  host: localhost"), new_text: "  host: 127.0.0.1" } },
      { set_line: { anchor: anchor(r.text, "  port: 8080"), new_text: "  port: 9090" } },
      { set_line: { anchor: anchor(r.text, "  timeout: 30"), new_text: "  timeout: 60" } },
      { set_line: { anchor: anchor(r.text, "  workers: 4"), new_text: "  workers: 8" } },
      { set_line: { anchor: anchor(r.text, "  loglevel: info"), new_text: "  loglevel: debug" } },
    ]);
    expect(s.bytes()).toBe("server:\n  host: 127.0.0.1\n  port: 9090\n  timeout: 60\n  workers: 8\n  loglevel: debug\n");
  });

  it("undo by a second anchored edit restores the exact bytes", async () => {
    const s = session("undo.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "BBB" } }]);
    const again = await s.read();
    await s.edit([{ set_line: { anchor: anchor(again.text, "BBB"), new_text: "bbb" } }]);
    expect(s.bytes()).toBe("aaa\nbbb\nccc\n");
  });

  it("b13-chained-diff-edit: a second edit with anchors from the first read still lands", async () => {
    const s = session("b13.ts", "aaa\nbbb\nccc\nddd\neee\n");
    const r = await s.read();
    await s.edit([{ set_line: { anchor: anchor(r.text, "ccc"), new_text: "CCC" } }]);
    await s.edit([{ set_line: { anchor: anchor(r.text, "ddd"), new_text: "DDD" } }]);
    expect(s.bytes()).toBe("aaa\nbbb\nCCC\nDDD\neee\n");
  });

  it("b18-boundary-dup: a replacement that repeats the line above is applied literally, with a warning", async () => {
    const s = session("b18.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    const result = await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "aaa\nBBB" } }]);
    expect(s.bytes()).toBe("aaa\naaa\nBBB\nccc\n");
    expect(result.text).toContain("appears twice");
  });
});

describe("staleness and concurrency", () => {
  it.each([
    ["stale-line", "aaa\nbbb-external\nccc\n"],
    ["b9-boundary-changed", "aaa\nbbb-x\nccc\n"],
  ])("%s: an anchored edit on a changed line is refused", async (_name, mutated) => {
    const s = session("stale.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    s.mutate(mutated);
    const result = await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "BBB" } }]);
    expect(result.isError).toBe(true);
    expect(s.bytes()).toBe(mutated);
  });

  it("b9-boundary-changed: a text replace that still matches a substring of the changed line is refused", async () => {
    const s = session("b9.ts", "aaa\nbbb\nccc\n");
    await s.read();
    s.mutate("aaa\nbbb-x\nccc\n");
    const result = await s.edit([{ replace: { old_text: "bbb", new_text: "BBB" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain(">>> 2:");
    expect(s.bytes()).toBe("aaa\nbbb-x\nccc\n");
  });

  it("stale-range: a changed line inside a replaced range is refused, and the feedback anchors allow a decided retry", async () => {
    const s = session("stale-range.ts", "aaa\nbbb\nccc\nddd\n");
    const r = await s.read();
    s.mutate("aaa\nbbb\nccc-external\nddd\n");
    const edit = { replace_lines: { start_anchor: anchor(r.text, "bbb"), end_anchor: anchor(r.text, "ddd"), new_text: "B\nD" } };
    const refused = await s.edit([edit]);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("ccc-external");
    expect(s.bytes()).toBe("aaa\nbbb\nccc-external\nddd\n");
    expect((await s.edit([edit])).isError).toBe(false);
    expect(s.bytes()).toBe("aaa\nB\nD\n");
  });

  it("b15-large-range-drift: interior drift in a 181-line range is refused", async () => {
    const fixture = Array.from({ length: 200 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
    const s = session("b15.ts", fixture);
    const r = await s.read();
    s.mutate(fixture.replace("line100\n", "line100-drifted\n"));
    const result = await s.edit([
      { replace_lines: { start_anchor: anchor(r.text, "line10"), end_anchor: anchor(r.text, "line190"), new_text: "X" } },
    ]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("line100-drifted");
    expect(s.bytes()).toBe(fixture.replace("line100\n", "line100-drifted\n"));
  });

  it("b10-duplicate-drift: editing the untouched brace applies and keeps the drift", async () => {
    const s = session("b10.ts", "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\n");
    const r = await s.read();
    s.mutate("function a() {\n  return 1;\n}\nfunction b() {\n  return 2; // drifted\n}\n");
    await s.edit([{ set_line: { anchor: anchor(r.text, "}", 2), new_text: "};" } }]);
    expect(s.bytes()).toBe("function a() {\n  return 1;\n}\nfunction b() {\n  return 2; // drifted\n};\n");
  });

  it("b12-noop-with-drift: an identical replacement elsewhere is a successful no-op", async () => {
    const s = session("b12.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    s.mutate("aaa-x\nbbb\nccc\n");
    const result = await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "bbb" } }]);
    expect(result.isError).toBe(false);
    expect(s.bytes()).toBe("aaa-x\nbbb\nccc\n");
  });

  it("external-far: an unrelated distant change does not block the edit", async () => {
    const s = session("external-far.ts", "aaa\nbbb\nccc\nddd\neee\n");
    const r = await s.read();
    s.mutate("aaa-external\nbbb\nccc\nddd\neee\n");
    await s.edit([{ set_line: { anchor: anchor(r.text, "ccc"), new_text: "CCC" } }]);
    expect(s.bytes()).toBe("aaa-external\nbbb\nCCC\nddd\neee\n");
  });

  it("b6-change-then-revert: content changed and restored before the edit applies", async () => {
    const s = session("b6.ts", "aaa\nbbb\nccc\nddd\n");
    const r = await s.read();
    s.mutate("aaa\nbbb\nccc-tmp\nddd\n");
    s.mutate("aaa\nbbb\nccc\nddd\n");
    await s.edit([{ replace_lines: { start_anchor: anchor(r.text, "bbb"), end_anchor: anchor(r.text, "ddd"), new_text: "B\nD" } }]);
    expect(s.bytes()).toBe("aaa\nB\nD\n");
  });

  it("formatter-drift: a reindent makes the anchor stale; the retry uses the fresh anchor from the refusal", async () => {
    const s = session("formatter-drift.ts", "function connect(opts) {\n  const host = opts.host;\n  const port = opts.port ?? 8080;\n  return { host, port };\n");
    const r = await s.read();
    s.mutate("function connect(opts) {\n    const host = opts.host;\n    const port = opts.port ?? 8080;\n    return { host, port };\n");
    const refused = await s.edit([{ set_line: { anchor: anchor(r.text, "  const port = opts.port ?? 8080;"), new_text: "  const port = opts.port ?? 9090;" } }]);
    expect(refused.isError).toBe(true);
    const fresh = anchor(refused.text, "    const port = opts.port ?? 8080;");
    await s.edit([{ set_line: { anchor: fresh, new_text: "    const port = opts.port ?? 9090;" } }]);
    expect(s.bytes()).toBe("function connect(opts) {\n    const host = opts.host;\n    const port = opts.port ?? 9090;\n    return { host, port };\n");
  });

  it("error-guidance: the refusal names the fresh anchor and the retry lands on current bytes", async () => {
    const s = session("error-guidance.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    s.mutate("aaa\nbbb-external\nccc\n");
    const refused = await s.edit([{ set_line: { anchor: anchor(r.text, "bbb"), new_text: "BBB" } }]);
    expect(refused.isError).toBe(true);
    await s.edit([{ set_line: { anchor: anchor(refused.text, "bbb-external"), new_text: "BBB" } }]);
    expect(s.bytes()).toBe("aaa\nBBB\nccc\n");
  });

  it("insert-race-stale-boundary: an insert after a changed anchor line is refused", async () => {
    const s = session("insert-race.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    s.mutate("aaa\nbbb-x\nccc\n");
    const result = await s.edit([{ insert_after: { anchor: anchor(r.text, "bbb"), new_text: "BB1\nBB2" } }]);
    expect(result.isError).toBe(true);
    expect(s.bytes()).toBe("aaa\nbbb-x\nccc\n");
  });
});

describe("block copy and move without retyping (Explicit Edit block families)", () => {
  // Invisible and lookalike characters a model drops or normalizes when it retypes a block.
  const BLOCK = ["// BEGIN checkout\u2011payload\u00a00042", "const feature = \"legacy\u200bCheckout\";", "", "// END checkout\u2011payload\u00a00042"];
  const SOURCE = ["// head", ...BLOCK, "// tail"].join("\n") + "\n";
  const TARGET = "// TARGET\nconst x = 1;\n";

  it("copy-block: copy_lines from_path appends the exact block to the end of another file", async () => {
    const s = session("target.ts", TARGET, { "source.ts": SOURCE });
    const src = await s.read("source.ts");
    const dst = await s.read();
    const result = await s.edit([
      { copy_lines: { from_path: "source.ts", start_anchor: anchor(src.text, BLOCK[0]), end_anchor: anchor(src.text, BLOCK[3]), after_anchor: anchor(dst.text, "const x = 1;") } },
    ]);
    expect(result.isError).toBe(false);
    expect(s.bytes()).toBe(TARGET + BLOCK.join("\n") + "\n");
    expect(s.bytes("source.ts")).toBe(SOURCE);
  });

  it("copy-within: copy_lines without from_path copies inside the file", async () => {
    const s = session("blocks.ts", SOURCE);
    const r = await s.read();
    await s.edit([{ copy_lines: { start_anchor: anchor(r.text, BLOCK[0]), end_anchor: anchor(r.text, BLOCK[3]), after_anchor: anchor(r.text, "// tail") } }]);
    expect(s.bytes()).toBe(SOURCE + BLOCK.join("\n") + "\n");
  });

  it("copy right after an identical line keeps every copied line (no echo stripping)", async () => {
    const s = session("dup.ts", "x\nx\ny\n");
    const r = await s.read();
    await s.edit([{ copy_lines: { start_anchor: anchor(r.text, "x", 2), end_anchor: anchor(r.text, "y"), after_anchor: anchor(r.text, "x") } }]);
    expect(s.bytes()).toBe("x\nx\ny\nx\ny\n");
  });

  it("move-block: move_lines moves the block after a marker in one call", async () => {
    const s = session("blocks.ts", ["// PREFIX", ...BLOCK, "// SUFFIX", "// tail"].join("\n") + "\n");
    const r = await s.read();
    const result = await s.edit([{ move_lines: { start_anchor: anchor(r.text, BLOCK[0]), end_anchor: anchor(r.text, BLOCK[3]), after_anchor: anchor(r.text, "// SUFFIX") } }]);
    expect(result.isError).toBe(false);
    expect(s.bytes()).toBe(["// PREFIX", "// SUFFIX", ...BLOCK, "// tail"].join("\n") + "\n");
  });

  it("move-block upward works too", async () => {
    const s = session("blocks.ts", ["// PREFIX", "// mid", ...BLOCK].join("\n") + "\n");
    const r = await s.read();
    await s.edit([{ move_lines: { start_anchor: anchor(r.text, BLOCK[0]), end_anchor: anchor(r.text, BLOCK[3]), after_anchor: anchor(r.text, "// PREFIX") } }]);
    expect(s.bytes()).toBe(["// PREFIX", ...BLOCK, "// mid"].join("\n") + "\n");
  });

  it("move-between: copy to the target, then delete from the source", async () => {
    const s = session("target.ts", TARGET, { "source.ts": SOURCE });
    const src = await s.read("source.ts");
    const dst = await s.read();
    const start = anchor(src.text, BLOCK[0]);
    const end = anchor(src.text, BLOCK[3]);
    await s.edit([{ copy_lines: { from_path: "source.ts", start_anchor: start, end_anchor: end, after_anchor: anchor(dst.text, "const x = 1;") } }]);
    await s.edit([{ replace_lines: { start_anchor: start, end_anchor: end, new_text: "" } }], "source.ts");
    expect(s.bytes()).toBe(TARGET + BLOCK.join("\n") + "\n");
    expect(s.bytes("source.ts")).toBe("// head\n// tail\n");
  });

  it("a move target inside the moved range is refused", async () => {
    const s = session("blocks.ts", SOURCE);
    const r = await s.read();
    const result = await s.edit([{ move_lines: { start_anchor: anchor(r.text, BLOCK[0]), end_anchor: anchor(r.text, BLOCK[3]), after_anchor: anchor(r.text, BLOCK[1]) } }]);
    expect(result.isError).toBe(true);
    expect(s.bytes()).toBe(SOURCE);
  });

  it("a copy whose source changed since it was read is refused with the source's current rows", async () => {
    const s = session("target.ts", TARGET, { "source.ts": SOURCE });
    const src = await s.read("source.ts");
    const dst = await s.read();
    s.mutate(SOURCE.replace("// END", "// END!"), "source.ts");
    const result = await s.edit([
      { copy_lines: { from_path: "source.ts", start_anchor: anchor(src.text, BLOCK[0]), end_anchor: anchor(src.text, BLOCK[3]), after_anchor: anchor(dst.text, "const x = 1;") } },
    ]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("copy_lines source source.ts");
    expect(result.text).toContain("// END!");
    expect(s.bytes()).toBe(TARGET);
  });

  it("a copy from a missing file is refused", async () => {
    const s = session("target.ts", TARGET);
    const dst = await s.read();
    const a = anchor(dst.text, "const x = 1;");
    const result = await s.edit([{ copy_lines: { from_path: "nope.ts", start_anchor: a, end_anchor: a, after_anchor: a } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("File not found: nope.ts");
  });
});
describe("small-model slips observed in the benchmark traces", () => {
  it("a unique exact text replace works without a prior read (Explicit Edit literal-1-regex trace)", async () => {
    const s = session("sample.txt", "// Keep this comment unchanged.\n/^(\\d*)\\..*\\.log$/\n");
    const result = await s.edit([{ replace: { old_text: "/^(\\d*)\\..*\\.log$/", new_text: "/^(\\d+)\\..*\\.log$/" } }]);
    expect(result.isError).toBe(false);
    expect(s.bytes()).toBe("// Keep this comment unchanged.\n/^(\\d+)\\..*\\.log$/\n");
  });

  it("anchored edits still require a read", async () => {
    const s = session("unread.txt", "aaa\nbbb\n");
    const result = await s.edit([{ set_line: { anchor: `2:${computeLineHash(2, "bbb")}`, new_text: "BBB" } }]);
    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe("file-not-read");
    expect(s.bytes()).toBe("aaa\nbbb\n");
  });

  it("an ambiguous text replace is refused with the matching lines instead of editing the first", async () => {
    const s = session("dup.ts", "import { a } from 'x';\nimport { b } from 'y';\nimport { a } from 'x';\n");
    const result = await s.edit([{ replace: { old_text: "import { a } from 'x';", new_text: "import { a2 } from 'x';" } }]);
    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe("ambiguous-match");
    expect(result.text).toMatch(/occurs 2 times[\s\S]*1:[0-9a-f]{3}\|import \{ a \}[\s\S]*3:[0-9a-f]{3}\|import \{ a \}/);
    expect(s.bytes()).toBe("import { a } from 'x';\nimport { b } from 'y';\nimport { a } from 'x';\n");
    // The listed rows count as seen: the model can retarget the second one by anchor.
    await s.edit([{ set_line: { anchor: anchor(result.text, "import { a } from 'x';", 2), new_text: "import { a2 } from 'x';" } }]);
    expect(s.bytes()).toBe("import { a } from 'x';\nimport { b } from 'y';\nimport { a2 } from 'x';\n");
  });
  it("an anchor pasted without its line number resolves when exactly one line matches", async () => {
    const s = session("slip.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    const hashOnly = anchor(r.text, "bbb").split(":")[1];
    await s.edit([{ set_line: { anchor: `${hashOnly}|bbb`, new_text: "BBB" } }]);
    expect(s.bytes()).toBe("aaa\nBBB\nccc\n");
  });

  it("a line-free anchor that matches several lines is refused with the candidates", async () => {
    const s = session("slip.ts", "}\nx\n}\n");
    const r = await s.read();
    const hashOnly = anchor(r.text, "}").split(":")[1];
    const result = await s.edit([{ set_line: { anchor: `${hashOnly}|}`, new_text: "};" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("matches 2 lines");
    expect(s.bytes()).toBe("}\nx\n}\n");
  });

  it("a hash-prefixed replacement copied from the row is stripped", async () => {
    const s = session("slip.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    const a = anchor(r.text, "bbb");
    await s.edit([{ set_line: { anchor: a, new_text: `${a.split(":")[1]}|BBB` } }]);
    expect(s.bytes()).toBe("aaa\nBBB\nccc\n");
  });

  it("replace.old_text pasted with row prefixes matches those rows as whole lines", async () => {
    const s = session("slip.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    await s.edit([{ replace: { old_text: `${anchor(r.text, "bbb")}|bbb`, new_text: "BBB" } }]);
    expect(s.bytes()).toBe("aaa\nBBB\nccc\n");
  });

  it("replace.old_text that is not found lists the closest lines with anchors", async () => {
    const s = session("slip.ts", "alpha\nbeta gamma\ndelta\n");
    await s.read();
    const result = await s.edit([{ replace: { old_text: "beta  gamma", new_text: "x" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Closest current lines:\n {2}2:[0-9a-f]{3}\|beta gamma/);
    expect(result.text).toContain('"set_line"');
  });

  it("replace_symbol aimed at a line explains how to edit lines instead", async () => {
    const s = session("slip.ts", "aaa\nbbb\nccc\n");
    const r = await s.read();
    const result = await s.edit([{ replace_symbol: { symbol: `${anchor(r.text, "bbb")}|bbb`, new_body: "BBB" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("replace_symbol only replaces a named declaration");
    expect(result.text).toContain(anchor(r.text, "bbb"));
    expect(s.bytes()).toBe("aaa\nbbb\nccc\n");
  });
});
