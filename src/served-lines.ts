import { diffArrays } from "diff";
import { computeLineHash, escapeControlCharsForDisplay, parseLineRef } from "./hashline.js";
import type { PtcLine } from "./ptc-value.js";

/**
 * What the model was last shown of each file, as `line -> hash`.
 *
 * Anchors already verify the lines they name, but a range or a text `replace` also overwrites
 * lines between or around its anchors. If one of those lines changed on disk after the model saw
 * it, the edit would silently discard that change. This registry lets `edit` refuse such writes
 * and answer with the current rows instead.
 *
 * Line numbers drift when lines are added above, so a line counts as current when its hash was
 * shown anywhere within `SHIFT_WINDOW` lines. A line is stale only when the model was shown a
 * different hash at that exact line and the current hash was not shown nearby. Lines the model
 * was never shown are not judged.
 */
const SHIFT_WINDOW = 20;
const ROW_RE = /^(\d+):([0-9a-f]{3})(?:\|.*)?$/;

export interface StaleLine {
	line: number;
	hash: string;
	raw: string;
}

export class ServedLines {
	private readonly files = new Map<string, Map<number, string>>();

	/** Record shown rows. `complete` replaces what was known (a full-file view). */
	record(path: string, rows: Iterable<{ line: number; hash: string }>, complete = false): void {
		let served = this.files.get(path);
		if (!served || complete) {
			served = new Map();
			this.files.set(path, served);
		}
		for (const row of rows) {
			if (Number.isInteger(row.line) && row.line > 0 && typeof row.hash === "string") served.set(row.line, row.hash.toLowerCase());
		}
	}

	/** Record rows given as `LINE:HASH` anchors (grep records, error feedback). */
	recordAnchors(path: string, anchors: Iterable<string>): void {
		const rows: Array<{ line: number; hash: string }> = [];
		for (const anchor of anchors) {
			const match = ROW_RE.exec(anchor);
			if (match) rows.push({ line: Number(match[1]), hash: match[2] });
		}
		if (rows.length) this.record(path, rows);
	}

	has(path: string): boolean {
		return (this.files.get(path)?.size ?? 0) > 0;
	}

	forget(path: string): void {
		this.files.delete(path);
	}

	/** Lines in `lineNumbers` (1-based, of `currentLines`) that changed since the model saw them. */
	findStale(path: string, currentLines: readonly string[], lineNumbers: Iterable<number>): StaleLine[] {
		const served = this.files.get(path);
		if (!served?.size) return [];
		const stale: StaleLine[] = [];
		for (const line of lineNumbers) {
			const raw = currentLines[line - 1];
			if (raw === undefined) continue;
			const shownHere = served.get(line);
			if (shownHere === undefined) continue;
			const hash = computeLineHash(line, raw);
			if (shownHere === hash) continue;
			let shownNearby = false;
			for (let other = Math.max(1, line - SHIFT_WINDOW); other <= line + SHIFT_WINDOW && !shownNearby; other++) {
				shownNearby = served.get(other) === hash;
			}
			if (!shownNearby) stale.push({ line, hash, raw });
		}
		return stale;
	}

	/**
	 * After this tool wrote `newLines`, carry unchanged lines' served hashes to their new line
	 * numbers and mark written lines as served: the model authored them and saw the diff.
	 */
	remapAfterWrite(path: string, oldLines: readonly string[], newLines: readonly string[]): void {
		const served = this.files.get(path);
		const next = new Map<number, string>();
		let oldLine = 1;
		let newLine = 1;
		for (const part of diffArrays(oldLines as string[], newLines as string[])) {
			const count = part.value.length;
			if (part.added) {
				for (let i = 0; i < count; i++) next.set(newLine + i, computeLineHash(newLine + i, newLines[newLine + i - 1]));
				newLine += count;
			} else if (part.removed) {
				oldLine += count;
			} else {
				for (let i = 0; i < count; i++) {
					const shown = served?.get(oldLine + i);
					if (shown !== undefined) next.set(newLine + i, shown);
				}
				oldLine += count;
				newLine += count;
			}
		}
		this.files.set(path, next);
	}
}

/** Changed or removed original lines (1-based) between two versions of a file. */
export function overwrittenLines(oldLines: readonly string[], newLines: readonly string[]): number[] {
	const touched: number[] = [];
	let oldLine = 1;
	for (const part of diffArrays(oldLines as string[], newLines as string[])) {
		const count = part.value.length;
		if (part.removed) for (let i = 0; i < count; i++) touched.push(oldLine + i);
		if (!part.added) oldLine += count;
	}
	return touched;
}

/** Rows to show for stale lines: each with one line of context, as fresh LINE:HASH rows. */
export function formatStaleRows(currentLines: readonly string[], stale: readonly StaleLine[]): { text: string; rows: PtcLine[] } {
	const staleSet = new Set(stale.map((entry) => entry.line));
	const show = new Set<number>();
	for (const { line } of stale) {
		for (let other = Math.max(1, line - 1); other <= Math.min(currentLines.length, line + 1); other++) show.add(other);
	}
	const rows: PtcLine[] = [];
	const out: string[] = [];
	let previous = -1;
	for (const line of [...show].sort((a, b) => a - b)) {
		const raw = currentLines[line - 1] ?? "";
		const hash = computeLineHash(line, raw);
		const display = escapeControlCharsForDisplay(raw);
		if (previous !== -1 && line > previous + 1) out.push("    ...");
		previous = line;
		out.push(`${staleSet.has(line) ? ">>> " : "    "}${line}:${hash}|${display}`);
		rows.push({ line, hash, anchor: `${line}:${hash}`, raw, display });
	}
	return { text: out.join("\n"), rows };
}

/** Parse anchors out of arbitrary `LINE:HASH` strings, ignoring the malformed ones. */
export function anchorsToRows(anchors: Iterable<string>): Array<{ line: number; hash: string }> {
	const rows: Array<{ line: number; hash: string }> = [];
	for (const anchor of anchors) {
		try {
			const parsed = parseLineRef(anchor);
			if (parsed.line > 0) rows.push({ line: parsed.line, hash: parsed.hash });
		} catch {
			// not an anchor
		}
	}
	return rows;
}

type ResolvePath = (path: string) => string;

function lineRows(value: unknown): Array<{ line: number; hash: string }> {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(row): row is { line: number; hash: string } =>
			!!row && typeof row === "object" && typeof (row as any).line === "number" && typeof (row as any).hash === "string",
	);
}

/**
 * Record the rows a successful read, grep, ast_search, or write result showed, from its
 * structured `details.ptcValue`.
 */
export function recordServedFromResult(served: ServedLines, toolName: string, details: unknown, resolvePath: ResolvePath): void {
	const ptc = details && typeof details === "object" ? (details as { ptcValue?: any }).ptcValue : undefined;
	if (!ptc || typeof ptc !== "object" || ptc.ok === false || ptc.error) return;
	if (toolName === "read" && typeof ptc.path === "string") {
		const range = ptc.range ?? {};
		const complete = range.startLine === 1 && range.endLine === range.totalLines && !ptc.truncation && !ptc.symbol;
		const rows = lineRows(ptc.lines);
		const bundleAnchors: string[] = Array.isArray(ptc.bundle?.localSupport)
			? ptc.bundle.localSupport.flatMap((item: any) => (Array.isArray(item?.lineAnchors) ? item.lineAnchors : []))
			: [];
		if (rows.length || complete) served.record(resolvePath(ptc.path), rows, complete);
		if (bundleAnchors.length) served.recordAnchors(resolvePath(ptc.path), bundleAnchors);
	} else if (toolName === "write" && typeof ptc.path === "string") {
		served.record(resolvePath(ptc.path), lineRows(ptc.lines), true);
	} else if (toolName === "grep" && Array.isArray(ptc.records)) {
		const byPath = new Map<string, string[]>();
		for (const record of ptc.records) {
			if (typeof record?.path !== "string" || typeof record?.anchor !== "string") continue;
			const list = byPath.get(record.path) ?? [];
			list.push(record.anchor);
			byPath.set(record.path, list);
		}
		for (const [path, anchors] of byPath) served.recordAnchors(resolvePath(path), anchors);
	} else if (toolName === "ast_search" && Array.isArray(ptc.files)) {
		for (const file of ptc.files) {
			if (typeof file?.path === "string") served.record(resolvePath(file.path), lineRows(file.lines));
		}
	}
}
