export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	if (maxLength < 3) {
		return "...";
	}

	return text.slice(0, maxLength - 3) + "...";
}

export function truncateLines(text: string, maxLines: number): string {
	const lines = text.split("\n");
	if (lines.length <= maxLines) {
		return text;
	}

	const keepLines = Math.floor(maxLines / 2);
	const result = [
		...lines.slice(0, keepLines),
		`\n... ${lines.length - maxLines} lines omitted ...\n`,
		...lines.slice(-keepLines),
	];

	return result.join("\n");
}
