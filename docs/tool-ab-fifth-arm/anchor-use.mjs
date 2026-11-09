// The fifth arm's analysis record (unmaintained, not tested): per model and arm, how bash grep anchors were used.
// An edit's anchor counts as from bash only when a bash grep printed its `N:HASH` and no read or grep tool did,
// matched as text, so an anchor shared with a read counts as not from bash. Usage: node anchor-use.mjs <out dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const out = process.argv[2];
const rows = {};
for (const model of readdirSync(join(out, "traces"))) for (const arm of readdirSync(join(out, "traces", model))) {
  const r = rows[`${model}|${arm}`] = { runs: 0, bashGrepWithAnchors: 0, bashResultsAnchored: 0, edits: 0, anchoredEdits: 0, anchorFromBashOnly: 0, editsNoPriorRead: 0, runsEditNoRead: 0 };
  for (const file of readdirSync(join(out, "traces", model, arm))) {
    r.runs++;
    const events = readFileSync(join(out, "traces", model, arm, file), "utf8").split("\n").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    const reads = new Set(); const bashAnchors = new Set(); const readAnchors = new Set(); let noRead = false;
    const starts = new Map();
    for (const e of events) {
      if (e.type === "tool_execution_start") starts.set(e.toolCallId, e);
      if (e.type !== "tool_execution_end") continue;
      const s = starts.get(e.toolCallId); if (!s) continue;
      const text = (e.result?.content ?? []).map((c) => c.text ?? "").join("");
      if (s.toolName === "bash" && /\b(rg|grep)\b/.test(s.args?.command ?? "")) {
        const m = [...text.matchAll(/^(?:[^\n:]*:)?(\d+):([0-9a-f]{3})\|/gm)];
        if (m.length) { r.bashResultsAnchored++; for (const x of m) bashAnchors.add(`${x[1]}:${x[2]}`); }
      }
      if (s.toolName === "read") { reads.add(String(s.args?.path).replace(/^\.\//, "")); for (const x of text.matchAll(/^(\d+):([0-9a-f]{3})\|/gm)) readAnchors.add(`${x[1]}:${x[2]}`); }
      if (s.toolName === "grep") for (const x of text.matchAll(/(\d+):([0-9a-f]{3})\|/g)) readAnchors.add(`${x[1]}:${x[2]}`);
      if (s.toolName === "edit") {
        r.edits++;
        const argText = JSON.stringify(s.args);
        const used = [...argText.matchAll(/"(?:anchor|start_anchor|end_anchor|after_anchor)":"(\d+):([0-9a-f]{3})/g)].map((x) => `${x[1]}:${x[2]}`);
        if (used.length) { r.anchoredEdits++; if (used.every((a) => bashAnchors.has(a) && !readAnchors.has(a))) r.anchorFromBashOnly++; }
        const p = String(s.args?.path).replace(/^\.\//, "");
        if (!reads.has(p)) { r.editsNoPriorRead++; noRead = true; }
      }
    }
    if (noRead) r.runsEditNoRead++;
  }
}
console.log("| model | arm | runs | bash grep results anchored | edits | anchored edits | anchors only from bash | edits with no prior read | runs with such an edit |\n|---|---|---:|---:|---:|---:|---:|---:|---:|");
for (const [k, r] of Object.entries(rows)) { const [m, a] = k.split("|"); console.log(`| ${m} | ${a} | ${r.runs} | ${r.bashResultsAnchored} | ${r.edits} | ${r.anchoredEdits} | ${r.anchorFromBashOnly} | ${r.editsNoPriorRead} | ${r.runsEditNoRead} |`); }
