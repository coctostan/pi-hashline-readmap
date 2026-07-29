import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { registerEditTool } from "../src/edit.js";
import { registerGrepTool } from "../src/grep.js";

function captureTool(register: (pi: any, options?: any) => unknown, options?: any): any {
	let tool: any;
	register({ registerTool(def: any) { tool = def; } } as any, options);
	return tool;
}

describe("repro #226: grep content containing :digits:", () => {
	it("keeps match path, line, text, hash, and subsequent edit on the same source line", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-grep-wrong-anchor-"));
		const filePath = join(dir, "linter.ts");
		const originalLine5 = '\t"pylint",';
		const originalLine47 = "\t// Pylint: /path/to/file.py:10:5: E0001: Error message (rule-id)";
		const correctedLine47 = "\t// corrected Pylint: /path/to/file.py:10:5: example";
		const lines = Array.from({ length: 47 }, (_, index) => `// filler ${index + 1}`);
		lines[4] = originalLine5;
		lines[46] = originalLine47;
		writeFileSync(filePath, lines.join("\n"), "utf8");

		const grep = captureTool(registerGrepTool);
		const grepResult = await grep.execute(
			"grep-repro",
			{ pattern: "Pylint", path: filePath, literal: true },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);
		const match = grepResult.details.ptcValue.records.find((record: any) => record.kind === "match");

		const edit = captureTool(registerEditTool, { wasReadInSession: () => true, syntaxValidate: "off" });
		const editResult = await edit.execute(
			"edit-repro",
			{ path: filePath, edits: [{ set_line: { anchor: match.anchor, new_text: correctedLine47 } }] },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);
		const updated = readFileSync(filePath, "utf8").split("\n");

		expect({
			emittedRecord: { line: match.line, anchor: match.anchor },
			editIsError: editResult.isError ?? false,
			line5: updated[4],
			line47: updated[46],
		}).toEqual({
			emittedRecord: { line: 47, anchor: expect.stringMatching(/^47:[0-9a-f]{3}$/) },
			editIsError: false,
			line5: originalLine5,
			line47: correctedLine47,
		});

		const { collectMatchCandidates } = await import("../src/grep.js");
		expect(collectMatchCandidates(String.raw`C:\repo\file.ts:47: needle`)).toEqual([
			{ kind: "match", displayPath: String.raw`C:\repo\file.ts`, lineNumber: 47, text: "needle" },
		]);

		const ordinaryPath = join(dir, "ordinary.ts");
		writeFileSync(ordinaryPath, "// ordinary\n// Pylint ordinary match\n", "utf8");
		let delimiterPath: string | undefined;
		if (process.platform !== "win32") {
			delimiterPath = join(dir, "report:10: file.ts");
			writeFileSync(delimiterPath, "// Pylint: /path/to/file.py:10:5: message\n", "utf8");
		}

		const directoryResult = await grep.execute(
			"grep-directory-repro",
			{ pattern: "Pylint", path: dir, literal: true },
			new AbortController().signal,
			() => {},
			{ cwd: process.cwd() },
		);
		const directoryRecords = directoryResult.details.ptcValue.records
			.filter((record: any) => record.kind === "match")
			.map((record: any) => ({ path: record.path, line: record.line }))
			.sort((a: any, b: any) => a.path.localeCompare(b.path));
		const expectedRecords = [
			{ path: filePath, line: 47 },
			{ path: ordinaryPath, line: 2 },
		];
		if (delimiterPath) expectedRecords.push({ path: delimiterPath, line: 1 });
		expect(directoryRecords).toEqual(expectedRecords.sort((a, b) => a.path.localeCompare(b.path)));

		const text = directoryResult.content.find((item: any) => item.type === "text")?.text ?? "";
		expect(text).toContain(`${basename(filePath)}:>>47:`);
		expect(text).toContain(correctedLine47);
		expect(text).toContain(`${basename(ordinaryPath)}:>>2:`);
		if (delimiterPath) expect(text).toContain(`${basename(delimiterPath)}:>>1:`);
	});
});
