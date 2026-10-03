import { detectLineEnding } from "./edit-diff.js";

/** Physical storage for logical row splices; untouched separators retain their provenance. */
export class PhysicalLineBuffer {
	readonly lines: string[] = [];
	readonly endings: string[] = [];
	private readonly fallback: string;

	constructor(content: string) {
		this.fallback = detectLineEnding(content);
		let start = 0;
		for (const match of content.matchAll(/\r\n|\n|\r/g)) {
			const index = match.index!;
			this.lines.push(content.slice(start, index));
			this.endings.push(match[0]);
			start = index + match[0].length;
		}
		this.lines.push(content.slice(start));
		this.endings.push("");
	}

	splice(index: number, deleteCount: number, newLines: readonly string[], copiedEndings?: readonly string[]): void {
		const local = (deleteCount ? this.endings[index] : this.endings[index - 1]) || this.endings[index] || this.fallback;
		const boundary = deleteCount ? this.endings[index + deleteCount - 1] : local;
		const hasSuffix = index + deleteCount < this.lines.length;
		// Copied provenance affects internal separators only; the join back belongs to the target.
		const endings = newLines.map((_, offset) => offset + 1 < newLines.length
			? copiedEndings?.[offset] || local
			: hasSuffix ? boundary || local : "");
		if (index > 0 && newLines.length && !this.endings[index - 1]) this.endings[index - 1] = local;
		this.lines.splice(index, deleteCount, ...newLines);
		this.endings.splice(index, deleteCount, ...endings);
	}

	toString(): string {
		return this.lines.map((line, index) => line + (index + 1 < this.lines.length ? this.endings[index] || this.fallback : "")).join("");
	}
}
