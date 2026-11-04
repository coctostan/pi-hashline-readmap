export function stripAnsi(text: string): string {
	// eslint-disable-next-line no-control-regex
	return (
		text
			// Standard ANSI escape sequences
			.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
			// OSC sequences (covers both numeric-param and arbitrary-content forms)
			.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
	);
}
