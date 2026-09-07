/**
 * TourViewer (active tab content) — renders a File City introduction tour via
 * the panel library's FileCityGuidePanel, the sibling of the trail explorer.
 * Tour steps drive the city's focusDirectory + highlight layers; the panel
 * derives its own layers per step, so the host highlightLayers slice is left
 * null. Audio is disabled (no fetchAudioUrls action) for the standalone viewer.
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
	FileCityGuidePanel,
	type FileCityGuidePanelActions,
	type FileCityGuidePanelContext,
	type FileCityGuideRepository,
	type HighlightLayer,
} from "@industry-theme/file-city-panel";
import type { IntroductionTour } from "@principal-ai/file-city-builder";
import { electrobun } from "../rpc";
import { nullSlice } from "../types";
import { GithubMark } from "../components/TrailHeader";

// TourHeader — slim chrome for tour tabs. Tours aren't published or annotated
// (the tour panel exposes no notes / sign-offs), so this drops the Trail
// header's Publish / Share / notes affordances and keeps just the owner/repo
// crumbs plus a GitHub link when the repo has a remote.
function TourHeader({
	owner,
	repo,
	githubUrl,
}: {
	owner: string;
	repo: string;
	githubUrl?: string;
}) {
	const { theme } = useTheme();
	const onOpenGithub = useCallback(() => {
		if (!githubUrl) return;
		void electrobun.rpc!.request.openExternal({ url: githubUrl });
	}, [githubUrl]);

	return (
		<header
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "8px 16px",
				background: theme.colors.surface,
				borderBottom: `1px solid ${theme.colors.border}`,
				flexShrink: 0,
				fontFamily: theme.fonts.body,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
				<span
					style={{
						flexShrink: 0,
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						letterSpacing: 0.3,
						textTransform: "uppercase",
						padding: "2px 7px",
						borderRadius: 999,
						background: theme.colors.accent ?? theme.colors.primary,
						color: theme.colors.background,
					}}
				>
					Tour
				</span>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{owner}
				</span>
				<span style={{ color: theme.colors.textMuted }} aria-hidden>
					/
				</span>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{repo}
				</span>
			</div>
			{githubUrl && (
				<button
					type="button"
					onClick={onOpenGithub}
					title={`Open ${owner}/${repo} on GitHub`}
					aria-label={`Open ${owner}/${repo} on GitHub`}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 32,
						height: 32,
						borderRadius: 6,
						background: "transparent",
						border: "none",
						color: theme.colors.text,
						cursor: "pointer",
						flexShrink: 0,
					}}
				>
					<GithubMark size={20} />
				</button>
			)}
		</header>
	);
}

export function TourViewer({
	tour,
	fileTree,
	repoRoot,
	hostOwner,
	hostRepo,
}: {
	tabId: string;
	tour: IntroductionTour;
	fileTree: FileTree;
	repoRoot: string;
	hostOwner?: string;
	hostRepo?: string;
}) {
	const { theme } = useTheme();

	const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	const header = useMemo(() => {
		const basename = repoRoot.split("/").filter(Boolean).pop() ?? "repo";
		if (hostOwner && hostOwner !== "local" && hostRepo) {
			return {
				owner: hostOwner,
				repo: hostRepo,
				githubUrl: `https://github.com/${hostOwner}/${hostRepo}`,
			};
		}
		return { owner: "local", repo: hostRepo ?? basename, githubUrl: undefined };
	}, [repoRoot, hostOwner, hostRepo]);

	const repository = useMemo<FileCityGuideRepository>(
		() => ({
			id: createLocalRepoPurl(repoRoot),
			path: repoRoot,
			owner: header.owner === "local" ? null : header.owner,
			name: header.repo,
		}),
		[repoRoot, header],
	);

	const context = useMemo<
		PanelContextValue<FileCityGuidePanelContext>
	>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: fileTree,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		const tourSlice: DataSlice<IntroductionTour | null> = {
			scope: "repository",
			name: "tour",
			data: tour,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		return {
			currentScope: { type: "repository" },
			refresh: async () => {},
			fileTree: fileTreeSlice,
			lineCounts: nullSlice("lineCounts"),
			tour: tourSlice,
			highlightLayers: nullSlice<HighlightLayer[]>("highlightLayers"),
			repository,
		};
	}, [fileTree, tour, repository]);

	const actions = useMemo<FileCityGuidePanelActions>(
		// No editor to open into in the standalone viewer, and audio is disabled
		// (omitting fetchAudioUrls hides the panel's Play / Auto-play controls).
		() => ({ openFile: () => {} }),
		[],
	);

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
			<TourHeader owner={header.owner} repo={header.repo} githubUrl={header.githubUrl} />
			<div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
				<FileCityGuidePanel
					context={context}
					actions={actions}
					events={events}
				/>
			</div>
		</div>
	);
}
