/** Output a compactor left out, reported beside the marker that names it: `count` of `unit` (`lines`, `files`, …). */
export type Drop = { count: number; unit: string };

/** Records a drop and returns its marker, so no marker is emitted without its drop. */
export function dropMarker(drops: Drop[], count: number, unit: string, marker: string): string {
	drops.push({ count, unit });
	return marker;
}

/** The output's lines; a trailing newline is not a line, so no drop count includes it. */
export function outputLines(output: string): string[] {
	const lines = output.split("\n");
	if (output.endsWith("\n")) lines.pop();
	return lines;
}
