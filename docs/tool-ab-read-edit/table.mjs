// The read-and-edit run's analysis record (unmaintained, not tested): per task set, model and arm, the mean per run and
// the spread between the repeats' means (summarizeRuns' rule) of the figures summary.md leaves out or rounds: pass rate,
// input and output tokens, cost, wall time, calls before the first touch; then passes per task where any run failed.
// Output tokens are `tokens` minus `inputTokens`.
// Usage: node table.mjs <out dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
const results = readFileSync(join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const arms = JSON.parse(readFileSync(join(out, "run.json"), "utf8")).arms;
const metrics = [
	["Pass", (r) => Number(r.pass), (v) => `${(v * 100).toFixed(0)}%`],
	["Input tokens", (r) => r.inputTokens, (v) => Math.round(v).toLocaleString("en-US")],
	["Output tokens", (r) => r.tokens - r.inputTokens, (v) => Math.round(v).toLocaleString("en-US")],
	["Cost", (r) => r.cost, (v) => `$${v.toFixed(4)}`],
	["Wall s", (r) => r.durationMs / 1000, (v) => v.toFixed(1)],
	["Calls before touch", (r) => r.confusion.callsBeforeTouch, (v) => v.toFixed(2)],
];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
console.log(`| set | model | arm | runs | ${metrics.map(([h]) => `${h} (Δ)`).join(" | ")} |`);
console.log(`|---|---|---|---:|${metrics.map(() => "---:").join("|")}|`);
for (const set of ["locate", "edit"]) for (const model of [...new Set(results.map((r) => r.model))]) for (const arm of arms) {
	const runs = results.filter((r) => r.set === set && r.model === model && r.arm === arm);
	if (!runs.length) continue;
	const cells = metrics.map(([, of, fmt]) => {
		const values = (subset) => subset.map(of).filter((v) => v !== null);
		const perRepeat = [...new Set(runs.map((r) => r.attempt))].map((a) => mean(values(runs.filter((r) => r.attempt === a)))).filter((v) => v !== null);
		const m = mean(values(runs));
		return m === null ? "-" : `${fmt(m)} (${perRepeat.length > 1 ? fmt(Math.max(...perRepeat) - Math.min(...perRepeat)) : "-"})`;
	});
	console.log(`| ${set} | ${model.split("/")[1]} | ${arm} | ${runs.length} | ${cells.join(" | ")} |`);
}
// Passes per task out of the repeats, for each task whose arms did not all pass every repeat.
console.log(`\n| set | model | task | ${arms.join(" | ")} |\n|---|---|---|${arms.map(() => "---:").join("|")}|`);
for (const set of ["locate", "edit"]) for (const model of [...new Set(results.map((r) => r.model))]) for (const task of [...new Set(results.filter((r) => r.set === set).map((r) => r.task))]) {
	const runs = results.filter((r) => r.set === set && r.model === model && r.task === task);
	if (runs.every((r) => r.pass)) continue;
	console.log(`| ${set} | ${model.split("/")[1]} | ${task} | ${arms.map((arm) => runs.filter((r) => r.arm === arm && r.pass).length).join(" | ")} |`);
}
