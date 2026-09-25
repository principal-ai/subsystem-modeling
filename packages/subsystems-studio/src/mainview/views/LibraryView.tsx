/**
 * LibraryView — the "Tours" tab: a list of cached File City introduction tours
 * with repo identity and relative mtime. Registers its refresh with the
 * AppHeader so the header's refresh button re-fetches this list.
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { LibraryEntry } from "../../shared/contract";
import { electrobun, libraryRefreshers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";

export function LibraryView() {
	const { theme } = useTheme();
	const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listTours({});
			setEntries(result.entries);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
		// Expose this refresh to the top-level AppHeader's refresh button.
		libraryRefreshers.add(refresh);
		return () => {
			libraryRefreshers.delete(refresh);
		};
	}, [refresh]);

	const onOpen = useCallback(async (entry: LibraryEntry) => {
		// Tours can only render against a local working tree (they reference whole
		// directories). We don't pass a repoRoot — the host resolves the tour's
		// repo from the Alexandria registry and surfaces a clear message if it
		// can't find a local checkout.
		await electrobun.rpc!.request.openTourFromCache({ file: entry.file });
	}, []);

	if (error) {
		return <CenteredMessage title="Could not load tours" detail={error} />;
	}
	if (entries === null) {
		return <CenteredMessage title="Loading tours…" />;
	}
	if (entries.length === 0) {
		return (
			<CenteredMessage
				title="No tours yet"
				detail="Run `principal-ai tour view <file-or-id>` to open one, or `principal-ai tour init` to scaffold a new tour."
			/>
		);
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: "16px 24px",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{entries.map((entry) => (
					<div
						key={entry.file}
						onClick={() => onOpen(entry)}
						style={{
							display: "flex",
							alignItems: "baseline",
							gap: 12,
							padding: "8px 12px",
							borderRadius: 4,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							background: theme.colors.backgroundSecondary ?? "transparent",
							cursor: "pointer",
							fontSize: theme.fontSizes[2],
						}}
					>
						<span
							style={{
								flexShrink: 0,
								boxSizing: "border-box",
								minWidth: 76,
								textAlign: "center",
								fontSize: theme.fontSizes[0],
								fontWeight: 600,
								letterSpacing: 0.3,
								textTransform: "uppercase",
								padding: "2px 7px",
								borderRadius: 999,
								background: theme.colors.primary,
								color: theme.colors.background,
							}}
						>
							Tour
						</span>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							{entry.title}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.textSecondary,
								fontFamily: theme.fonts.monospace,
								flexShrink: 0,
							}}
						>
							{entry.owner && entry.repo
								? `${entry.owner}/${entry.repo}`
								: entry.anchor}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.textMuted ?? theme.colors.textSecondary,
								flexShrink: 0,
								minWidth: 60,
								textAlign: "right",
							}}
						>
							{relativeTime(entry.mtimeMs)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
