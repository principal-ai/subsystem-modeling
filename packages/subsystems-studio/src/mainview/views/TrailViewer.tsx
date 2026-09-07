/**
 * TrailViewer (active tab content) — renders a trail via the panel library's
 * FileCityTrailExplorerPanel, with the TrailHeader chrome above it.
 */

import { useCallback, useMemo } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	PanelEventBus,
	type DataSlice,
	type PanelContextValue,
	type PanelEventEmitter,
} from "@principal-ade/panel-framework-core";
import { createLocalRepoPurl } from "@principal-ai/alexandria-core-library";
import { type FileTree } from "@principal-ai/repository-abstraction";
import {
	FileCityTrailExplorerPanel,
	type FileCityTrailExplorerPanelActions,
	type FileCityTrailExplorerPanelContext,
	type FileCityTrailExplorerRepository,
	type HighlightLayer,
	type TrailNote,
	type TrailPayload,
} from "@industry-theme/file-city-panel";
import { electrobun, callReadFile } from "../rpc";
import { nullSlice } from "../types";
import { TrailHeader } from "../components/TrailHeader";

export function TrailViewer({
	tabId,
	payload,
	fileTree,
	repoRoot,
	hostOwner,
	hostRepo,
}: {
	tabId: string;
	payload: TrailPayload;
	fileTree: FileTree;
	repoRoot: string;
	/** Repo identity the bun host resolved (git origin / explicit remote).
	 *  Preferred over the payload so the header matches the library rows. */
	hostOwner?: string;
	hostRepo?: string;
}) {
	const { theme } = useTheme();

	const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	const repository = useMemo<FileCityTrailExplorerRepository>(() => {
		const repoEntry = payload.repos?.[0];
		const owner = repoEntry?.remote?.owner ?? "local";
		const name = repoEntry?.remote?.name ?? repoEntry?.name ?? "repo";
		const id = repoEntry?.id ?? createLocalRepoPurl(repoRoot);
		return { id, owner, name };
	}, [payload, repoRoot]);

	const context = useMemo<
		PanelContextValue<FileCityTrailExplorerPanelContext>
	>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: fileTree,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		const trailSlice: DataSlice<TrailPayload | null> = {
			scope: "repository",
			name: "trail",
			data: payload,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		return {
			currentScope: { type: "repository" },
			refresh: async () => {},
			fileTree: fileTreeSlice,
			lineCounts: nullSlice("lineCounts"),
			trail: trailSlice,
			highlightLayers: nullSlice<HighlightLayer[]>("highlightLayers"),
			repository,
		};
	}, [fileTree, payload, repository]);

	const readFile = useCallback((path: string) => callReadFile(tabId, path), [tabId]);

	const actions = useMemo<FileCityTrailExplorerPanelActions>(
		() => ({
			openFile: () => {},
			readFile,
			createTrailNote: async (_payloadId, draft) => {
				const res = await electrobun.rpc!.request.createTrailNote({
					tabId,
					draft,
				});
				if (!res.ok) {
					console.warn("[principal-studio] createTrailNote failed:", res.error);
					return null;
				}
				return (res.note ?? null) as TrailNote | null;
			},
			updateTrailNote: async (_payloadId, noteId, body) => {
				const res = await electrobun.rpc!.request.updateTrailNote({
					tabId,
					noteId,
					body,
				});
				if (!res.ok) {
					console.warn("[principal-studio] updateTrailNote failed:", res.error);
					return null;
				}
				return (res.note ?? null) as TrailNote | null;
			},
			deleteTrailNote: async (_payloadId, noteId) => {
				const res = await electrobun.rpc!.request.deleteTrailNote({
					tabId,
					noteId,
				});
				if (!res.ok) {
					console.warn("[principal-studio] deleteTrailNote failed:", res.error);
				}
			},
			createTrailSignOff: async () => null,
			deleteTrailSignOff: async () => {},
		}),
		[readFile, tabId],
	);

	const header = useMemo(() => {
		const repoEntry = payload.repos?.[0];
		// Prefer the identity the bun host resolved — it mirrors the library rows
		// by recovering `owner/name` from the working tree's git origin, which
		// the payload almost never carries for local trails. The host returns the
		// `"local"` sentinel when there's no GitHub origin, so only treat a
		// non-"local" owner as a real remote. Fall back to the payload's own
		// remote (older trails / web-ade) before the local label.
		const githubOwner =
			hostOwner && hostOwner !== "local" ? hostOwner : repoEntry?.remote?.owner;
		const githubName =
			hostOwner && hostOwner !== "local" ? hostRepo : repoEntry?.remote?.name;
		// For trails with a remote, mirror web-ade's `<owner>/<repo>` crumbs and
		// link to the matching GitHub URL. For local-only trails (no GitHub
		// origin), fall back to `local / <repo-folder>` and hide the GitHub
		// button — there's no URL to point at.
		if (githubOwner && githubName) {
			return {
				owner: githubOwner,
				repo: githubName,
				githubUrl: `https://github.com/${githubOwner}/${githubName}`,
			};
		}
		const basename = repoRoot.split("/").filter(Boolean).pop() ?? "repo";
		return {
			owner: "local",
			// `hostRepo` is the working-tree folder name when there's no origin —
			// nicer than the dash-encoded path some payloads carry.
			repo: hostRepo ?? repoEntry?.name ?? basename,
			githubUrl: undefined,
		};
	}, [payload, repoRoot, hostOwner, hostRepo]);

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
			}}
		>
			<TrailHeader
				tabId={tabId}
				owner={header.owner}
				repo={header.repo}
				share={payload.share}
				githubUrl={header.githubUrl}
			/>
			<div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
				<FileCityTrailExplorerPanel
					context={context}
					actions={actions}
					events={events}
					briefSide="leading"
				/>
			</div>
		</div>
	);
}
