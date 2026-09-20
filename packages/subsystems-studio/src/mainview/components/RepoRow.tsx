import type { ReactNode } from "react";
import { Network as NetworkIcon } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun } from "../rpc";
import { GithubMark } from "./TrailHeader";

/**
 * The shared repo-row look every sidebar uses: leading avatar tile, monospace
 * owner/name label, right-aligned muted count, and optional GitHub / combined
 * toggle actions. Used by the Subsystems tab's `FilesDrilldown` and the
 * Maintenance tab's repo filter so both sides stay pixel-identical.
 */
export interface RepoRowProps {
	/** GitHub owner-avatar URL for the leading tile. */
	avatarUrl?: string;
	/** Leading tile content when no avatar is available. */
	avatarFallback?: ReactNode;
	/** Primary label (repo name or a synthetic row like "All repos"). */
	label: string;
	/** Tooltip for the label. */
	title?: string;
	/** Right-aligned count badge (model count, etc). */
	badge?: string | number;
	/** Tooltip for the badge. */
	badgeTitle?: string;
	/** Active/selected highlight across the whole row. */
	active?: boolean;
	/** When set, the label area renders as a clickable button. */
	onPress?: () => void;
	/** Render the "Open on GitHub" action button. */
	showGithub?: boolean;
	/** GitHub URL opened by the action button. */
	githubUrl?: string;
	/** Show the list ↔ combined-graph toggle next to the GitHub button. */
	showCombinedToggle?: boolean;
	combinedActive?: boolean;
	onToggleCombined?: () => void;
}

export function RepoRow({
	avatarUrl,
	avatarFallback,
	label,
	title,
	badge,
	badgeTitle,
	active = false,
	onPress,
	showGithub = false,
	githubUrl,
	showCombinedToggle = false,
	combinedActive = false,
	onToggleCombined,
}: RepoRowProps) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const hoverBg = theme.colors.border ?? "#333";

	const identity = (
		<>
			{avatarUrl ? (
				<img
					src={avatarUrl}
					alt=""
					width={28}
					height={28}
					style={{ borderRadius: 6, flexShrink: 0 }}
				/>
			) : avatarFallback ? (
				<span
					style={{
						width: 28,
						height: 28,
						borderRadius: 6,
						flexShrink: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: theme.colors.background,
						border: `1px solid ${hoverBg}`,
						color: muted,
					}}
				>
					{avatarFallback}
				</span>
			) : null}
			<span
				style={{
					fontSize: theme.fontSizes[2],
					fontFamily: theme.fonts.monospace,
					color: theme.colors.text,
					fontWeight: 600,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
				title={title}
			>
				{label}
			</span>
			{badge != null && (
				<span
					style={{
						marginLeft: "auto",
						flexShrink: 0,
						fontSize: theme.fontSizes[0],
						fontFamily: theme.fonts.monospace,
						color: muted,
					}}
					title={badgeTitle}
				>
					{badge}
				</span>
			)}
		</>
	);

	return (
		<div
			onMouseEnter={
				onPress
					? (e) => {
							e.currentTarget.style.background = hoverBg;
						}
					: undefined
			}
			onMouseLeave={
				onPress
					? (e) => {
							e.currentTarget.style.background = active ? hoverBg : "transparent";
						}
					: undefined
			}
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "8px 8px 4px",
				borderRadius: 4,
				background: active ? hoverBg : "transparent",
				minWidth: 0,
				cursor: onPress ? "pointer" : "default",
				transition: "background 120ms ease",
			}}
		>
			{onPress ? (
				<button
					type="button"
					onClick={onPress}
					title={title}
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						cursor: "pointer",
						fontFamily: theme.fonts.body,
						textAlign: "left",
					}}
				>
					{identity}
				</button>
			) : (
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					{identity}
				</div>
			)}
			{showCombinedToggle && onToggleCombined && (
				<button
					type="button"
					title={combinedActive ? "Show model list" : "Show combined graph"}
					aria-label={combinedActive ? "Show model list" : "Show combined graph"}
					aria-pressed={combinedActive}
					onClick={(e) => {
						e.stopPropagation();
						onToggleCombined();
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = hoverBg;
						e.currentTarget.style.color = theme.colors.text;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = combinedActive ? hoverBg : "transparent";
						e.currentTarget.style.color = combinedActive
							? theme.colors.text
							: muted;
					}}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 4,
						flexShrink: 0,
						border: "none",
						borderRadius: 4,
						background: combinedActive ? hoverBg : "transparent",
						cursor: "pointer",
						color: combinedActive ? theme.colors.text : muted,
						transition: "color 120ms ease",
					}}
				>
					<NetworkIcon size={18} />
				</button>
			)}
			{showGithub && githubUrl && (
				<button
					type="button"
					title="Open on GitHub"
					onClick={(e) => {
						e.stopPropagation();
						void electrobun.rpc!.request.openExternal({ url: githubUrl });
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = hoverBg;
						e.currentTarget.style.color = theme.colors.text;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent";
						e.currentTarget.style.color = muted;
					}}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 4,
						flexShrink: 0,
						border: "none",
						borderRadius: 4,
						background: "transparent",
						cursor: "pointer",
						color: muted,
						transition: "color 120ms ease",
					}}
				>
					<GithubMark size={18} />
				</button>
			)}
		</div>
	);
}