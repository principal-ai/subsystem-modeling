/**
 * Renderer-only types for the mainview's active-tab content. The RPC payload
 * types used across the renderer live in src/shared/contract.ts (shared with
 * the bun host); this file holds the view-side state machine and helpers.
 */

import type { DataSlice } from "@principal-ade/panel-framework-core";
import type { FileTree } from "@principal-ai/repository-abstraction";
import type { IntroductionTour } from "@principal-ai/file-city-builder";

export type TabState =
	| { kind: "loading" }
	| { kind: "library" }
	| { kind: "agent-sessions" }
	| { kind: "maintenance-sessions" }
	| { kind: "subsystems" }
	| { kind: "maintenance" }
	| { kind: "graphify" }
	| { kind: "package-layers" }
	| { kind: "opencode-v2" }
	| { kind: "session-events"; id: string; sessionId: string }
	| {
			kind: "subsystem-model";
			id: string;
			graphId: string;
			walkthroughId?: string;
			/** Open the sidebar's issues view on mount. */
			showIssues?: boolean;
			/** With `showIssues`, land focused on this verification layer. */
			focusIssueCategory?: string;
			/** Live Maintain session whose collapsible event panel overlays the
			 *  graph (opened from the Maintenance tab's live strip). */
			liveSessionId?: string;
			liveTitle?: string;
			liveAgent?: string;
	  }
	| { kind: "subsystem-showcase"; id: string; title: string; ids: string[] }
	| { kind: "error"; message: string }
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
