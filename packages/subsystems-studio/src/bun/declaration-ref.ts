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
import { dirtyFingerprint, gitHeadSha } from "./graphify-store";

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

export function buildDeclarationRef(input: {
	file: string;
	startLine: number;
	lineHash: string;
	graphifyNodeId?: string;
	repoRoot?: string | null;
}): SubsystemDeclarationRef {
	const ref: SubsystemDeclarationRef = {
		file: input.file,
		startLine: input.startLine,
		lineHash: input.lineHash,
		capturedAt: new Date().toISOString(),
	};
	if (input.graphifyNodeId) ref.graphifyNodeId = input.graphifyNodeId;
	if (input.repoRoot) {
		const headSha = gitHeadSha(input.repoRoot);
		if (headSha) {
			ref.revision = {
				headSha,
				dirtyHash: dirtyFingerprint(input.repoRoot),
			};
		}
	}
	return ref;
}
