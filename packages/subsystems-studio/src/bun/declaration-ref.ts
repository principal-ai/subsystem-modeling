/**
 * Host-side declaration line hashing (Node crypto).
 *
 * Must stay aligned with {@link normalizeDeclarationLine} in
 * `@principal-ai/subsystems-react` (algo v1).
 */

import { createHash } from "node:crypto";
import {
	extractDeclarationLine,
	normalizeDeclarationLine,
	parseSourceLocation,
	type SubsystemDeclarationRef,
} from "../../../subsystems-react/src/subsystem/declarationRef";

export {
	extractDeclarationLine,
	normalizeDeclarationLine,
	parseSourceLocation,
};
export type { SubsystemDeclarationRef };

export function hashDeclarationLine(line: string): string {
	const normalized = normalizeDeclarationLine(line);
	return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 32);
}

export function hashDeclarationLineFromContent(
	content: string,
	lineNumber: number,
): string | null {
	const raw = extractDeclarationLine(content, lineNumber);
	if (raw == null) return null;
	return hashDeclarationLine(raw);
}

/**
 * Hash a range of lines (1-based, inclusive) for call site verification.
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

export async function buildDeclarationRef(input: {
	file: string;
	startLine: number;
	lineHash: string;
	graphifyNodeId?: string;
	/** Accepted for call-site compatibility; commit provenance now lives on
	 *  the model-level per-purl commit maps, not per declaration. */
	repoRoot?: string | null;
}): Promise<SubsystemDeclarationRef> {
	const ref: SubsystemDeclarationRef = {
		file: input.file,
		startLine: input.startLine,
		lineHash: input.lineHash,
		capturedAt: new Date().toISOString(),
	};
	if (input.graphifyNodeId) ref.graphifyNodeId = input.graphifyNodeId;
	return ref;
}
