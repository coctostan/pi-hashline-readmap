// The pilot's analysis record (unmaintained, not tested): per model, arm and tool, calls and errors over a tool-ab run's traces. Usage: node errors.mjs <out dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreSession } from "../../scripts/bench/confusion.mjs";

const out = process.argv[2];
const rows = new Map();
for (const model of readdirSync(join(out, "traces"))) for (const arm of readdirSync(join(out, "traces", model))) {
	for (const file of readdirSync(join(out, "traces", model, arm))) {
		const text = readFileSync(join(out, "traces", model, arm, file), "utf8");
		// Bash calls running tests, to tell a missing node_modules from a search error.
		const commands = new Map();
		for (const line of text.split("\n")) {
			try {
				const e = JSON.parse(line);
				if (e.type === "message_end" && e.message?.role === "assistant") for (const b of e.message.content ?? []) if (b.type === "toolCall" && b.name === "bash") commands.set(b.id, b.arguments?.command ?? "");
			} catch {}
		}
		for (const call of scoreSession(text).calls) {
			const tool = call.tool === "bash" && /\b(npm (run )?test|npx|vitest|tsc|npm run typecheck)\b/.test(commands.get(call.id) ?? "") ? "bash (tests)" : call.tool;
			const key = `${model}|${arm}|${tool}`;
			const row = rows.get(key) ?? { model, arm, tool, calls: 0, errors: 0, rejected: 0, wrongTool: 0 };
			row.calls++;
			row.errors += call.error ? 1 : 0;
			row.rejected += call.rejected ? 1 : 0;
			row.wrongTool += call.wrongTool ? 1 : 0;
			rows.set(key, row);
		}
	}
}
console.log("| model | arm | tool | calls | errors | rejected | wrong-tool |\n|---|---|---|---:|---:|---:|---:|");
for (const r of [...rows.values()].sort((a, b) => a.model.localeCompare(b.model) || a.arm.localeCompare(b.arm) || b.calls - a.calls)) {
	console.log(`| ${r.model} | ${r.arm} | ${r.tool} | ${r.calls} | ${r.errors} | ${r.rejected} | ${r.wrongTool} |`);
}
