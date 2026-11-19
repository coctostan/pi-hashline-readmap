// The read-and-edit run's analysis record (unmaintained, not tested): per task set, model, arm and tool, the mean errors
// per run and the spread between the repeats' means (summarizeRuns' rule), over the run's traces. A run that never
// called a tool counts 0 for it; a cell where no run called the tool is `-`. Bash calls running tests are split out as
// in ../tool-ab-pilot/errors.mjs, since they fail in every arm without node_modules.
// Usage: node errors-table.mjs <out dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreSession } from "../../scripts/bench/confusion.mjs";

const out = process.argv[2];
const results = readFileSync(join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const arms = JSON.parse(readFileSync(join(out, "run.json"), "utf8")).arms;
const setOf = new Map(results.map((r) => [r.task, r.set]));
const TESTS = /\b(npm (run )?test|npx|vitest|tsc|npm run typecheck)\b/;

// One entry per trace: its set, model, arm, repeat, and per tool its calls and errors.
const runs = [];
for (const model of readdirSync(join(out, "traces"))) for (const arm of readdirSync(join(out, "traces", model))) {
	for (const file of readdirSync(join(out, "traces", model, arm))) {
		const [task, attempt] = file.replace(/\.jsonl$/, "").split("#");
		const text = readFileSync(join(out, "traces", model, arm, file), "utf8");
		const commands = new Map();
		for (const line of text.split("\n")) {
			try {
				const e = JSON.parse(line);
				if (e.type === "message_end" && e.message?.role === "assistant") for (const b of e.message.content ?? []) if (b.type === "toolCall" && b.name === "bash") commands.set(b.id, b.arguments?.command ?? "");
			} catch {}
		}
		const tools = {};
		for (const call of scoreSession(text).calls) {
			const tool = call.tool === "bash" && TESTS.test(commands.get(call.id) ?? "") ? "bash (tests)" : call.tool;
			tools[tool] ??= { calls: 0, errors: 0 };
			tools[tool].calls++;
			tools[tool].errors += call.error ? 1 : 0;
		}
		runs.push({ set: setOf.get(task), model: model.split("_")[1], arm, attempt: Number(attempt), tools });
	}
}

const COLUMNS = ["read", "edit", "write", "grep", "bash", "bash (tests)"];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const cell = (cellRuns, tool) => {
	if (!cellRuns.some((r) => r.tools[tool])) return "-";
	const errors = (subset) => subset.map((r) => r.tools[tool]?.errors ?? 0);
	const perRepeat = [...new Set(cellRuns.map((r) => r.attempt))].map((a) => mean(errors(cellRuns.filter((r) => r.attempt === a))));
	return `${mean(errors(cellRuns)).toFixed(2)} (${(Math.max(...perRepeat) - Math.min(...perRepeat)).toFixed(2)})`;
};
console.log(`| set | model | arm | runs | ${COLUMNS.join(" | ")} | other |\n|---|---|---|---:|${COLUMNS.map(() => "---:").join("|")}|---|`);
for (const set of ["locate", "edit"]) for (const model of [...new Set(runs.map((r) => r.model))].sort().reverse()) for (const arm of arms) {
	const cellRuns = runs.filter((r) => r.set === set && r.model === model && r.arm === arm);
	if (!cellRuns.length) continue;
	const others = [...new Set(cellRuns.flatMap((r) => Object.keys(r.tools)))].filter((t) => !COLUMNS.includes(t)).sort();
	const other = others.map((t) => `${t} ${cell(cellRuns, t)}`).join(", ") || "-";
	console.log(`| ${set} | ${model} | ${arm} | ${cellRuns.length} | ${COLUMNS.map((t) => cell(cellRuns, t)).join(" | ")} | ${other} |`);
}
