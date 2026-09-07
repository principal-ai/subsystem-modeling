/**
 * Renderer-only types for the mainview's active-tab content. The RPC payload
 * types used across the renderer live in src/shared/contract.ts (shared with
 * the bun host); this file holds the view-side state machine and helpers.
 */

import type { DataSlice } from "@principal-ade/panel-framework-core";
import type { FileTree } from "@principal-ai/repository-abstraction";
import type { TrailPayload } from "@industry-theme/file-city-panel";
import type { IntroductionTour } from "@principal-ai/file-city-builder";

export type TabState =
	| { kind: "loading" }
	| { kind: "library" }
	| { kind: "agent-sessions" }
	| { kind: "subsystems" }
	| { kind: "graphify" }
	| { kind: "analysis"; id: string; analysisId: string }
	| { kind: "session-events"; id: string; sessionId: string }
	| { kind: "prompt"; id: string }
	| { kind: "subsystem-model"; id: string; graphId: string }
	| { kind: "error"; message: string }
	| {
			kind: "ready";
			id: string;
			payload: TrailPayload;
			fileTree: FileTree;
			repoRoot: string;
			owner?: string;
			repo?: string;
		}
	| {
			kind: "ready-tour";
			id: string;
			tour: IntroductionTour;
			fileTree: FileTree;
			repoRoot: string;
			owner?: string;
			repo?: string;
		};

export function nullSlice<T>(name: string): DataSlice<T | null> {
	return {
		scope: "repository",
		name,
		data: null,
		loading: false,
		error: null,
		refresh: async () => {},
	};
}
