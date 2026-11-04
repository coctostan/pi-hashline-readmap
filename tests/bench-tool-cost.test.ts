import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { accountDeclarations, findCrossReferences, formatDeclarationReport } from "../scripts/bench/tool-cost.mjs";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";

const bytes = (text: string) => Buffer.byteLength(text);
const alpha = {
	name: "alpha",
	description: "Alpha does a; prefer beta for b.",
	parameters: { type: "object", properties: { x: { type: "string", description: "Not betamax, but the beta-ready path." } } },
};
const beta = { name: "beta", description: "Beta — not alphabet.", parameters: { type: "object", properties: {} } };
const systemPrompt = [
	"Intro.",
	"<tools>",
	"- alpha: Alpha snippet",
	"- beta: Beta snippet naming alpha",
	"</tools>",
	"<rules>",
	"- Use alpha for a.",
	"- Shared rule names beta.",
	"</rules>",
	"",
].join("\n");
const capture = {
	systemPrompt,
	tools: [alpha, beta],
	prompts: {
		alpha: { snippet: "Alpha snippet", guidelines: ["Use alpha for a.", "Shared rule names beta."] },
		// Pi renders a guideline two tools share once; it counts toward the first tool that declares it.
		beta: { snippet: "Beta snippet naming alpha", guidelines: ["Shared rule names beta."] },
	},
};

describe("accountDeclarations", () => {
	it("attributes declaration, snippet and guideline bytes to each tool and the rest to the shared prompt", () => {
		const report = accountDeclarations(capture);
		const alphaDeclaration = bytes(JSON.stringify(alpha));
		const betaDeclaration = bytes(JSON.stringify(beta));
		expect(report.tools.map(({ name, declarationBytes, snippetBytes, guidelineBytes, bytes }) =>
			({ name, declarationBytes, snippetBytes, guidelineBytes, bytes }))).toEqual([
			{ name: "alpha", declarationBytes: alphaDeclaration, snippetBytes: 23, guidelineBytes: 45, bytes: alphaDeclaration + 68 },
			{ name: "beta", declarationBytes: betaDeclaration, snippetBytes: 34, guidelineBytes: 0, bytes: betaDeclaration + 34 },
		]);
		expect(report.shared.bytes).toBe(bytes(systemPrompt) - 102);
		expect(report.total.bytes).toBe(bytes(systemPrompt) + alphaDeclaration + betaDeclaration);
	});

	it("estimates tokens as characters / 4, which undercounts bytes for non-ASCII text", () => {
		const row = accountDeclarations(capture).tools[1];
		const chars = JSON.stringify(beta).length + 34;
		expect(row.bytes).toBe(chars + 2); // the em dash is one character, three bytes
		expect(row.tokens).toBe(Math.round(chars / 4));
	});

	it("refuses a snippet or guideline the prompt does not carry instead of counting it as zero", () => {
		expect(() => accountDeclarations({ ...capture, prompts: { ...capture.prompts, beta: { snippet: "Renamed", guidelines: [] } } }))
			.toThrow(/beta snippet/);
		expect(() => accountDeclarations({ ...capture, prompts: { ...capture.prompts, beta: { snippet: "Beta snippet naming alpha", guidelines: ["Missing."] } } }))
			.toThrow(/beta guideline/);
	});
});

describe("findCrossReferences", () => {
	it("lists each provider-visible text of one tool naming another, as a whole case-sensitive word", () => {
		expect(findCrossReferences(capture)).toEqual([
			{ tool: "alpha", where: "description", names: ["beta"], text: "Alpha does a; prefer beta for b." },
			{ tool: "alpha", where: "$.properties.x", names: ["beta"], text: "Not betamax, but the beta-ready path." },
			{ tool: "alpha", where: "guideline", names: ["beta"], text: "Shared rule names beta." },
			{ tool: "beta", where: "snippet", names: ["alpha"], text: "Beta snippet naming alpha" },
		]);
	});
});

describe("formatDeclarationReport", () => {
	it("prints a row per tool, the shared prompt, the total and the cross-references", () => {
		const report = { host: "/host", version: "9.9.9", ...accountDeclarations(capture), crossReferences: findCrossReferences(capture) };
		const text = formatDeclarationReport(report);
		expect(text).toContain("Pi 9.9.9 (/host)");
		expect(text).toMatch(/^alpha\s+\d+\s+23\s+45\s+\d+\s+\d+$/m);
		const lines = text.split("\n");
		const header = lines.find((line) => line.startsWith("tool ")) ?? "";
		const bytesEnd = header.indexOf("bytes") + "bytes".length;
		for (const [label, cost] of [["shared system prompt", report.shared], ["total", report.total]] as const) {
			const line = lines.find((candidate) => candidate.startsWith(label)) ?? "";
			expect(line.length, label).toBe(header.length);
			expect(line.slice(bytesEnd - 11, bytesEnd).trim(), label).toBe(String(cost.bytes));
			expect(line.slice(bytesEnd).trim(), label).toBe(String(cost.tokens));
		}
		expect(text).toContain("beta snippet names alpha: Beta snippet naming alpha");
	});
});

describe("tool-cost.mjs --declarations on the selected host", () => {
	it("measures every tool this extension declares, and the parts add up to the total", () => {
		const stdout = execFileSync(process.execPath, ["scripts/bench/tool-cost.mjs", "--declarations", "--json"], {
			encoding: "utf8", timeout: 90_000, maxBuffer: 10 * 1024 * 1024,
		});
		const report = JSON.parse(stdout);
		expect(report.version).toBe(selectCompatHost().version);
		const names = report.tools.map((tool: { name: string }) => tool.name);
		expect(names).toEqual(expect.arrayContaining(["read", "bash", "edit", "write", "grep", "ast_search", "ls", "find"]));
		for (const tool of report.tools) {
			expect(tool.declarationBytes, tool.name).toBeGreaterThan(0);
			expect(tool.snippetBytes, tool.name).toBeGreaterThan(0);
		}
		const sum = report.tools.reduce((total: number, tool: { bytes: number }) => total + tool.bytes, report.shared.bytes);
		expect(sum).toBe(report.total.bytes);
		const bashGuideline = report.crossReferences.find((ref: { tool: string; text: string }) =>
			ref.tool === "bash" && ref.text === "Do not use bash cat/head/tail/grep/rg/find/ls/tree/sed/awk for repo files.");
		expect(bashGuideline?.names).toEqual(expect.arrayContaining(["grep", "find", "ls"]));
	}, 120_000);
});
