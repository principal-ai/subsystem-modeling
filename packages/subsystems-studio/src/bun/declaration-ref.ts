/**
 * Host-side source-span hashing.
 *
 * The hashing algorithm and span helpers live in the shared core audit layer so
 * Studio and the CLI produce identical fingerprints.
 */

export {
	buildSourceSpan,
	hashContentRange,
	normalizeDeclarationLine,
	parseSourceLocation,
} from "../../../subsystems-core/src/audit/hash";
export type { SubsystemSourceSpan } from "@principal-ai/subsystems-react";
