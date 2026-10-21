/** Shared size/duration formatting for history reports. */

export function historyBytes(bytes: number): string {
	if (bytes < 1000) return `${Math.round(bytes)} B`;
	if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
	if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
	return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function historyDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
	return `${(ms / 60_000).toFixed(1)} min`;
}
