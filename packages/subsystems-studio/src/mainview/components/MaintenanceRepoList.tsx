/**
 * MaintenanceRepoList — the Maintainer tab's left sidebar repo filter. Uses the
 * same visual language as the Subsystems tab's FilesPanel drilldown: repo avatar
 * + name + model count per row. One repo is always selected (the first by
 * default); clicking a repo narrows the model/pending lists to models
 * referencing it. Pure — selection is forwarded to the panel.
 */

import { useTheme } from "@principal-ade/industry-theme";
import { repoAvatarUrl } from "@principal-ai/subsystems-react";
import type { MaintenanceOverview } from "../../shared/contract";
import { RepoRow } from "./RepoRow";

/** Distinct owner/name repos referenced by any model's component purls, with model counts. */
export function repoBreakdown(
	overview: MaintenanceOverview | null,
): Array<{ owner: string; name: string; count: number }> {
	const counts = new Map<string, { owner: string; name: string; count: number }>();
	for (const m of overview?.models ?? []) {
		for (const r of m.repos ?? []) {
			const key = `${r.owner}/${r.name}`.toLowerCase();
			const cur = counts.get(key);
			if (cur) cur.count++;
			else counts.set(key, { owner: r.owner, name: r.name, count: 1 });
		}
	}
	return [...counts.values()].sort((a, b) =>
		`${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`),
	);
}

export function MaintenanceRepoList({
	repoBreaks,
	selectedKey,
	onSelect,
}: {
	repoBreaks: ReturnType<typeof repoBreakdown>;
	selectedKey: string | null;
	onSelect: (repoKey: string) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textSecondary;

	return (
		<div
			style={{
				width: 350,
				flexShrink: 0,
				minHeight: 0,
				overflowY: "auto",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<span
				style={{
					fontSize: theme.fontSizes[1],
					color: muted,
					textTransform: "uppercase",
					letterSpacing: 0.3,
					padding: 12,
				}}
			>
				Repos
			</span>
			{repoBreaks.map((r) => {
				const repoKey = `${r.owner}/${r.name}`.toLowerCase();
				const active = selectedKey === repoKey;
				return (
					<RepoRow
						key={repoKey}
						avatarUrl={repoAvatarUrl(`pkg:github/${r.owner}/${r.name}`)}
						label={r.name}
						title={`${r.owner}/${r.name} — ${r.count} model${r.count === 1 ? "" : "s"}`}
						badge={r.count}
						active={active}
						borderRadius={0}
						onPress={() => onSelect(repoKey)}
					/>
				);
			})}
		</div>
	);
}
