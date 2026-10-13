/**
 * Host-side source-span hashing (Node crypto).
 *
 * Must stay aligned with {@link normalizeDeclarationLine} in
 * `@principal-ai/subsystems-react` (algo v1).
 */

import { createHash } from "node:crypto";
import {
	normalizeDeclarationLine,
	parseSourceLocation,
	type SubsystemSourceSpan,
} from "@principal-ai/subsystems-react";

export { normalizeDeclarationLine, parseSourceLocation };
export type { SubsystemSourceSpan };

/**
 * Hash a range of lines (1-based, inclusive) — the span's content fingerprint.
 * Returns null if the range is invalid or out of bounds.
 */
export function hashContentRange(
	content: string,
	start: number,
	end: number,
): string | null {
	const lines = content.split(/\r?\n/);
	if (start < 1 || end < start || end > lines.length) return null;
	const slice = lines
		.slice(start - 1, end)
		.map(normalizeDeclarationLine)
		.join("\n");
	return createHash("sha256").update(slice, "utf8").digest("hex").slice(0, 32);
}

/** Assemble a span from its parts (no I/O). */
export function buildSourceSpan(input: {
	startLine: number;
	endLine: number;
	contentHash: string;
}): SubsystemSourceSpan {
	return {
		startLine: input.startLine,
		endLine: input.endLine,
		contentHash: input.contentHash,
	};
}
