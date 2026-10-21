/**
 * ConstructsDrilldown — repo overview that drills into ONE repo's constructs.
 *
 * Mirrors the Subsystems tab's `FilesDrilldown`: a single repo-row overview
 * that slides sideways into the focused repo's content. The focused row uses
 * the shared `RepoRow` chrome (avatar, GitHub link, X to go back), so the
 * Constructs sidebar reads exactly like the subsystem-models sidebar instead
 * of stacking a repo rail beside a second construct column.
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type { ConstructInventoryRepo } from "../../shared/contract";
import { RepoRow } from "./RepoRow";

/** Verified constructs in a repo (sum across its package groups). */
function repoConstructCount(repo: ConstructInventoryRepo): number {
	return repo.packages.reduce((n, pkg) => n + pkg.constructs.length, 0);
}

export interface ConstructsDrilldownProps {
	repos: ConstructInventoryRepo[];
	/** Drilled-in repo key, or null for the repo overview. */
	focusedRepoKey: string | null;
	/** Toggle drill-down (same key unfocuses). */
	onFocusRepo: (repoKey: string) => void;
	/** Content for the focused repo (search, timeline controls, construct list). */
	renderFocused: (repo: ConstructInventoryRepo) => React.ReactNode;
	/** Single repo: skip the one-row overview and show its constructs. */
	autoFocusSingleRepo?: boolean;
}

export function ConstructsDrilldown({
	repos,
	focusedRepoKey,
	onFocusRepo,
	renderFocused,
	autoFocusSingleRepo = true,
}: ConstructsDrilldownProps) {
	const { theme } = useTheme();

	// A one-repo overview is just a single row — go straight to the list.
	const autoKey =
		autoFocusSingleRepo && repos.length === 1 ? repos[0]!.repoKey : null;
	const focused =
		focusedRepoKey != null
			? (repos.find((repo) => repo.repoKey === focusedRepoKey) ?? null)
			: autoKey != null
				? (repos.find((repo) => repo.repoKey === autoKey) ?? null)
				: null;

	// Sync the auto-focused repo up so the timeline hook and list use it.
	// `onFocusRepo` toggles, so apply once (StrictMode would toggle it back).
	const autoFocusApplied = useRef(false);
	useEffect(() => {
		if (autoKey == null || focusedRepoKey != null || autoFocusApplied.current) return;
		autoFocusApplied.current = true;
		onFocusRepo(autoKey);
	}, [autoKey, focusedRepoKey, onFocusRepo]);

	// The focused repo can disappear after a refresh — return to the overview.
	useEffect(() => {
		if (focusedRepoKey && !focused) onFocusRepo(focusedRepoKey);
	}, [focusedRepoKey, focused, onFocusRepo]);

	// Keep the exiting pane mounted until the slide-back finishes.
	const [slideRepo, setSlideRepo] = useState<ConstructInventoryRepo | null>(null);
	useEffect(() => {
		if (focused) {
			setSlideRepo(focused);
			return;
		}
		if (slideRepo) {
			const timer = window.setTimeout(() => setSlideRepo(null), 220);
			return () => window.clearTimeout(timer);
		}
	}, [focused, slideRepo]);
	const shown = focused ?? slideRepo;

	return (
		<div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
			<div
				style={{
					display: "flex",
					height: "100%",
					width: "200%",
					flexShrink: 0,
					transform: focused ? "translateX(-50%)" : "translateX(0)",
					transition: "transform 200ms ease",
				}}
			>
				<div
					style={{
						width: "50%",
						flexShrink: 0,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
						overflowY: "auto",
						paddingBottom: 8,
					}}
				>
					{repos.map((repo, index) => {
						const count = repoConstructCount(repo);
						return (
							<div
								key={repo.repoKey}
								style={{
									flexShrink: 0,
									display: "flex",
									flexDirection: "column",
									borderTop:
										index > 0
											? `1px solid ${theme.colors.border ?? "#333"}`
											: undefined,
								}}
							>
								<RepoRow
									avatarUrl={repoAvatarUrl(repo.repoKey)}
									label={repo.name}
									title={`${repo.owner}/${repo.name}`}
									badge={count}
									badgeTitle={`${count} analyzed construct${count === 1 ? "" : "s"}`}
									onPress={() => onFocusRepo(repo.repoKey)}
								/>
							</div>
						);
					})}
				</div>
				<div
					style={{
						width: "50%",
						flexShrink: 0,
						minHeight: 0,
						height: "100%",
						overflow: "hidden",
						display: "flex",
						flexDirection: "column",
					}}
				>
					{shown && (
						<>
							<RepoRow
								avatarUrl={repoAvatarUrl(shown.repoKey)}
								label={shown.name}
								title={`${shown.owner}/${shown.name}`}
								showGithub={Boolean(shown.owner && shown.name)}
								githubUrl={
									shown.owner && shown.name
										? `https://github.com/${shown.owner}/${shown.name}`
										: undefined
								}
								onBack={
									autoKey
										? undefined
										: () => onFocusRepo(shown.repoKey)
								}
							/>
							{renderFocused(shown)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
