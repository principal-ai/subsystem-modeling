/**
 * Small shared UI helpers for the principal-studio mainview.
 */

import type { ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";

export function relativeTime(ms: number): string {
	const delta = Date.now() - ms;
	if (delta < 60_000) return "just now";
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
	return `${Math.floor(delta / 86_400_000)}d ago`;
}

/** Human label for "last loaded N seconds ago" refresh headers. */
export function lastLoadedLabel(ms: number): string {
	const sec = Math.floor((Date.now() - ms) / 1000);
	if (sec <= 0) return "just now";
	if (sec === 1) return "1 second ago";
	return `${sec} seconds ago`;
}

export function CenteredMessage({
	title,
	detail,
	children,
}: {
	title: string;
	detail?: string;
	children?: ReactNode;
}) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<div style={{ textAlign: "center", maxWidth: 640, padding: 24 }}>
				<div style={{ fontSize: theme.fontSizes[3], marginBottom: 8 }}>{title}</div>
				{detail && (
					<div
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textMuted ?? theme.colors.textSecondary,
							fontFamily: theme.fonts.monospace,
							whiteSpace: "pre-wrap",
						}}
					>
						{detail}
					</div>
				)}
				{children}
			</div>
		</div>
	);
}
