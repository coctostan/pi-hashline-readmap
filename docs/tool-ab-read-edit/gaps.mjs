// The read-and-edit run's analysis record (unmaintained, not tested): rulings 0008's and 0009's spread rule on this run,
// reported, not ruled. Per set and model, Hashline's three tools (`no-ls-find`) against each alternative arm, each
// metric's gap counting only beyond the larger of the two arms' repeat spreads. Only gaps beyond it are printed.
// Usage: node gaps.mjs <out dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeRuns } from "../../scripts/bench/tool-ab.mjs";

const out = process.argv[2];
const results = readFileSync(join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const rows = summarizeRuns(results);
const HASHLINE = "no-ls-find";
const OTHERS = ["pi-edit", "pi-read", "pi-read-edit", "bash-read-edit", "stock"];
// Higher is better for pass; lower for the rest. Edit calls are left out: their number is neither, and bash arms have none.
const METRICS = ["pass", "inputTokens", "cost", "errors", "callsBeforeTouch", "anchor", "text", "arguments", "other", "callsPerLandedEdit", "readsBeforeEdit"];
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : String(Number(v.toPrecision(3))));
console.log(`| set | model | against | metric | ${HASHLINE} | other | gap | bar | ${HASHLINE} |\n|---|---|---|---|---:|---:|---:|---:|---|`);
for (const set of ["locate", "edit"]) for (const model of [...new Set(rows.map((r) => r.model))]) for (const other of OTHERS) {
	const a = rows.find((r) => r.set === set && r.model === model && r.arm === HASHLINE);
	const b = rows.find((r) => r.set === set && r.model === model && r.arm === other);
	if (!a || !b) continue;
	for (const metric of METRICS) {
		const [x, y] = [a.metrics[metric], b.metrics[metric]];
		if (x.mean === null || y.mean === null) continue;
		const gap = x.mean - y.mean;
		const bar = Math.max(x.spread ?? 0, y.spread ?? 0);
		// The tolerance keeps a gap equal to the bar a tie despite float residue.
		if (Math.abs(gap) <= bar + 1e-9) continue;
		const better = metric === "pass" ? gap > 0 : gap < 0;
		console.log(`| ${set} | ${model.split("/")[1]} | ${other} | ${metric} | ${fmt(x.mean)} | ${fmt(y.mean)} | ${fmt(gap)} | ${fmt(bar)} | ${better ? "better" : "worse"} |`);
	}
}
