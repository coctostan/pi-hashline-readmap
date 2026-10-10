import { expect, it } from "vitest";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { applyCodemodeIntegration } from "../src/codemode-integration.js";

const wrap = (result: any): any => applyCodemodeIntegration({
  name: "read", label: "Read", description: "", parameters: Type.Object({}),
  async execute() { return result; },
});

it.each([false, true])("normalizes read attachments without persistence (native=%s)", async native => {
  const image = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
  const warning = { code: "params-adjusted", message: "[Read params adjusted: ignored offset 0]" };
  const text = warning.message + "\n\nRead image file [image/png]";
  const original: any = {
    content: [{ type: "text", text }, image],
    details: { ptcValue: { tool: "read", path: "image.png", warnings: [warning] } },
    ...(native ? { structuredContent: { ...image, note: "Read image file [image/png]" } } : {}),
  };
  const before = JSON.stringify(original);
  const tool = wrap(original);
  const result = await tool.execute();
  if (result.structuredContent?.type !== "image") throw new Error("Read attachment has no script image value");
  expect(result.structuredContent).toMatchObject({ ...image, text, note: text });
  expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
  expect(result.content).toBe(original.content);
  expect(result.details).toBe(original.details);
  expect(JSON.stringify(result.details)).not.toContain(image.data);
  expect(JSON.stringify(original)).toBe(before);
});

it.each([undefined, { type: "image", data: "", mimeType: "image/png" }])(
  "represents an omitted or empty image as a notice (%j)", async attachment => {
    const tool = wrap({
      content: [{ type: "text", text: "Image omitted" }, ...(attachment ? [attachment] : [])],
      details: {},
    });
    const result = await tool.execute();
    expect(result.structuredContent).toEqual({ text: "Image omitted", kind: "notice", warnings: [] });
    expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
    expect("data" in result.structuredContent).toBe(false);
  },
);

it("preserves the successful interactive ambiguity variant", async () => {
  const tool = wrap({ content: [{ type: "text", text: "Choose a symbol" }], details: {
    ptcValue: { tool: "read", ok: true, path: "a.ts", ambiguity: { query: "run", totalCandidates: 2 } },
  } });
  const choices = await tool.execute();
  expect(choices.structuredContent.ambiguity.totalCandidates).toBe(2);
  expect(Value.Check(tool.outputSchema, choices.structuredContent)).toBe(true);
});
