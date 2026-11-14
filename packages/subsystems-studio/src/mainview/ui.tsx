/**
 * Small shared UI helpers for the principal-studio mainview.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";

export function relativeTime(ms: number): string {
	const delta = Date.now() - ms;
	if (delta < 60_000) return "just now";
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
	return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function CenteredMessage({
	title,
	detail,
	children,
	loading = false,
}: {
	title: string;
	detail?: string;
	children?: ReactNode;
	/** Show an animated spinner above the copy. */
	loading?: boolean;
}) {
	const { theme } = useTheme();
	return (
		<div
			role={loading ? "status" : undefined}
			aria-live={loading ? "polite" : undefined}
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
				{loading && (
					<Loader2
						size={20}
						className="principal-studio-spin"
						aria-hidden="true"
						style={{
							display: "block",
							margin: "0 auto 10px",
							color: theme.colors.primary,
						}}
					/>
				)}
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
