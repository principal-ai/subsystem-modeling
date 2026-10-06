/**
 * SubsystemModelCard — one stored subsystem model as a row in the Subsystems
 * tab: title, description toggle, copy-path / gist / delete actions, and two
 * collapsible sections — the trails using the open file (when a file is
 * selected) and, failing that, the components declared in it, or the model's
 * full trail list when the row itself is expanded.
 *
 * Presentational: it derives the file → trail / component expansion from the
 * `graph` summary and the selected file, and reports every interaction through
 * a callback. Extracted from `SubsystemModelsView` so the row can be reviewed
 * in isolation in Storybook (see `SubsystemModelCard.stories.tsx`).
 */

import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
	Check,
	Copy,
	ExternalLink,
	FileText,
	LayoutDashboard,
	Route as RouteIcon,
	Box,
	Share2,
	X,
} from "lucide-react";
import { IndustryMarkdownSlide } from "themed-markdown";
import { useTheme } from "@principal-ade/industry-theme";
import type { SubsystemModelSummary } from "../../shared/contract";
import {
	componentsInFile,
	stepReferencesFile,
	trailsUsingFile,
	type SummaryTrail,
} from "../subsystemModelFiles";

/** A component declared in a file, as the summary carries it. */
export type SubsystemModelFileComponent = {
	alias: string;
	name: string;
	construct: string;
	startLine?: number;
};

export interface SubsystemModelCardProps {
	graph: SubsystemModelSummary;
	/**
	 * The file selected for THIS row (the file tree click). Drives the
	 * trail / component expansion; `null` when no file is open on this row.
	 */
	selectedFile?: { repoKey: string | undefined; displayPath: string } | null;
	/** The previewed file, used to light up trail step segments (any row). */
	openFile?: { repoKey: string | undefined; displayPath: string } | null;
	/** The row's own trail list is expanded (disclosure toggle). */
	rowExpanded?: boolean;
	/** The copy-path action just landed. */
	copied?: boolean;
	/** A gist share is in flight. */
	sharing?: boolean;
	onRowClick?: (e: ReactMouseEvent) => void;
	onRowDoubleClick?: () => void;
	/** Open the model in its own tab. */
	onOpen?: () => void;
	onCopyPath?: () => void;
	onShareGist?: () => void;
	onDelete?: () => void;
	/** Open the graph in a tab with this trail selected. */
	onOpenTrail?: (trailId: string) => void;
	/** Open a component's declaration file, focused on its line. */
	onOpenComponent?: (component: SubsystemModelFileComponent) => void;
}

/**
 * One trail row: wrapping title plus a step-bar strip (one segment per
 * step) underneath. Segments sited in the open file light up in primary;
 * the rest stay muted. Clicking opens the graph with this trail selected.
 */
function TrailButton({
	graphTitle,
	trail,
	openFile,
	onOpen,
}: {
	graphTitle: string;
	trail: SummaryTrail;
	openFile: { repoKey: string | undefined; displayPath: string } | null;
	onOpen: () => void;
}) {
	const { theme } = useTheme();
	const inactive = theme.colors.border ?? "#333";
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onOpen();
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			aria-label={`Open ${graphTitle} · ${trail.title}`}
			style={{
				border: "none",
				background: hover ? (theme.colors.border ?? "#333") : "transparent",
				padding: "6px 4px",
				borderRadius: 4,
				cursor: "pointer",
				color: "inherit",
				font: "inherit",
				textAlign: "left",
				width: "100%",
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				gap: 4,
				fontSize: theme.fontSizes[1],
				transition: "background 120ms ease",
			}}
		>
			<span
				style={{
					whiteSpace: "normal",
					overflowWrap: "break-word",
					wordBreak: "break-word",
				}}
			>
				{trail.title}
			</span>
			{trail.steps.length > 0 && (
				<span style={{ display: "flex", gap: 3 }} aria-hidden="true">
					{trail.steps.map((s, i) => {
						const active = openFile != null && stepReferencesFile(s, openFile);
						return (
							<span
								key={i}
								style={{
									flex: "1 1 0",
									minWidth: 4,
									height: 4,
									borderRadius: 2,
									background: active ? theme.colors.primary : inactive,
								}}
							/>
						);
					})}
				</span>
			)}
		</button>
	);
}

/**
 * A header action pill. Neutral (muted border/text) at rest; on hover it takes
 * the action's accent color — primary for the brand actions, success for share,
 * error for delete. An `active` action (copied / delete-armed) stays accented,
 * optionally filled with the accent.
 */
function ActionButton({
	icon,
	label,
	title,
	ariaLabel,
	accent,
	active = false,
	fillWhenActive = false,
	disabled = false,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	title: string;
	ariaLabel: string;
	/** Hover accent, and the color the sticky `active` state uses. */
	accent: string;
	/** The action's sticky state — copied, delete-armed. */
	active?: boolean;
	/** Fill the button with the accent while `active` (vs just border/text). */
	fillWhenActive?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [hover, setHover] = useState(false);
	const highlight = active || hover;
	const filled = active && fillWhenActive;
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			disabled={disabled}
			title={title}
			aria-label={ariaLabel}
			style={{
				flexShrink: 0,
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "4px 8px",
				borderRadius: 4,
				border: `1px solid ${highlight ? accent : (theme.colors.border ?? "#333")}`,
				background: filled ? accent : "transparent",
				color: filled ? theme.colors.background : highlight ? accent : muted,
				cursor: disabled ? "default" : "pointer",
				fontSize: theme.fontSizes[0],
				fontFamily: theme.fonts.body,
				opacity: disabled ? 0.7 : 1,
				transition:
					"color 120ms ease, border-color 120ms ease, background-color 120ms ease",
			}}
		>
			{icon}
			{label}
		</button>
	);
}

export function SubsystemModelCard({
	graph,
	selectedFile,
	openFile,
	rowExpanded = false,
	copied = false,
	sharing = false,
	onRowClick,
	onRowDoubleClick,
	onOpen,
	onCopyPath,
	onShareGist,
	onDelete,
	onOpenTrail,
	onOpenComponent,
}: SubsystemModelCardProps) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const isExpanded = selectedFile != null;
	const isRowExpanded = rowExpanded && !isExpanded;
	const isOpen = isExpanded || rowExpanded;
	const fileTrails =
		isExpanded && selectedFile
			? trailsUsingFile(graph, selectedFile.repoKey, selectedFile.displayPath)
			: [];
	const fileComponents =
		isExpanded && selectedFile && fileTrails.length === 0
			? componentsInFile(graph, selectedFile.repoKey, selectedFile.displayPath)
			: [];

	/**
	 * Mount the expanded body only after the card has been opened once. The body
	 * stays mounted afterwards so the collapse can animate, but never-opened
	 * cards mount nothing — otherwise every row in the list would parse its
	 * description markdown and stand up a ResizeObserver up front, which made
	 * the whole tab sluggish.
	 */
	const [bodyEverOpen, setBodyEverOpen] = useState(false);
	useEffect(() => {
		if (isOpen) setBodyEverOpen(true);
	}, [isOpen]);
	const bodyMounted = isOpen || bodyEverOpen;

	return (
		<div
			data-subsystem-row={graph.id}
			onClick={onRowClick}
			onDoubleClick={onRowDoubleClick}
			onMouseEnter={(e) => {
				e.currentTarget.style.borderColor = theme.colors.textMuted ?? "#555";
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.borderColor = theme.colors.border ?? "#333";
			}}
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				padding: "8px 12px",
				borderRadius: 4,
				border: `1px solid ${theme.colors.border ?? "#333"}`,
				background: theme.colors.backgroundSecondary ?? "transparent",
				cursor: "pointer",
				fontSize: theme.fontSizes[2],
				transition: "border-color 0.15s ease",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					flexWrap: "wrap",
					gap: 8,
					rowGap: 8,
				}}
			>
				<div
					style={{
						flex: "1 1 180px",
						minWidth: 0,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<LayoutDashboard
						size={14}
						style={{ flexShrink: 0, color: muted }}
						aria-hidden="true"
					/>
					<div
						style={{
							flex: 1,
							minWidth: 0,
							whiteSpace: "normal",
							overflowWrap: "break-word",
							wordBreak: "break-word",
						}}
					>
						{graph.title}
					</div>
				</div>
				<ActionButton
					icon={<ExternalLink size={12} />}
					label="Open"
					title={`Open ${graph.title} in a tab`}
					ariaLabel={`Open ${graph.title}`}
					accent={theme.colors.primary}
					onClick={() => onOpen?.()}
				/>
				<ActionButton
					icon={copied ? <Check size={12} /> : <Copy size={12} />}
					label={copied ? "Copied" : "Copy path"}
					title={`Copy path: ${graph.path}`}
					ariaLabel={`Copy path for ${graph.title}`}
					accent={theme.colors.primary}
					active={copied}
					fillWhenActive
					onClick={() => onCopyPath?.()}
				/>
				<ActionButton
					icon={<Share2 size={12} />}
					label={sharing ? "Sharing…" : graph.gist ? "Update gist" : "Gist"}
					title={
						graph.gist
							? `Update gist ${graph.gist.id}`
							: "Share as a public GitHub gist"
					}
					ariaLabel={
						graph.gist
							? `Update gist for ${graph.title}`
							: `Share ${graph.title} as gist`
					}
					accent={theme.colors.success ?? "#10b981"}
					disabled={sharing}
					onClick={() => onShareGist?.()}
				/>
				<ActionButton
					icon={<X size={12} />}
					label="Delete"
					title={`Delete ${graph.title}`}
					ariaLabel={`Delete ${graph.title}`}
					accent={theme.colors.error ?? "#e5534b"}
					onClick={() => onDelete?.()}
				/>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateRows: isOpen ? "1fr" : "0fr",
					transition: "grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1)",
				}}
			>
				<div
					inert={!isOpen}
					style={{ minHeight: 0, overflow: "hidden" }}
				>
					{bodyMounted && (
						<div
							onClick={(e) => e.stopPropagation()}
							style={{
								marginTop: 8,
								borderTop: `1px solid ${theme.colors.border ?? "#333"}`,
								paddingTop: 6,
								display: "flex",
								gap: 16,
								alignItems: "flex-start",
							}}
						>
							{graph.description && (
								<div
									style={{
										flex: "1.5 1 0",
										minWidth: 0,
										display: "flex",
										flexDirection: "column",
										gap: 2,
										fontSize: theme.fontSizes[1],
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											fontSize: theme.fontSizes[0],
											color: muted,
										}}
									>
										<FileText size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
										Description
									</div>
									<IndustryMarkdownSlide
										content={graph.description}
										theme={theme}
										slideIdPrefix={`subsystem-model-desc-${graph.id}`}
										slideIndex={0}
										isVisible
										transparentBackground
										disableBasePadding
									/>
								</div>
							)}
							<div
								style={{
									flex: "1 1 0",
									minWidth: 0,
									display: "flex",
									flexDirection: "column",
									gap: 2,
								}}
							>
								{isExpanded && selectedFile ? (
									<>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												fontSize: theme.fontSizes[0],
												color: muted,
											}}
										>
											{fileTrails.length > 0 ? (
												<RouteIcon size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
											) : (
												<Box size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
											)}
											{fileTrails.length > 0 ? `Trails` : `Component`}
										</div>
										{fileTrails.length === 0 && fileComponents.length === 0 ? (
											<div
												style={{
													fontSize: theme.fontSizes[1],
													color: muted,
												}}
											>
												No trails use this file.
											</div>
										) : fileTrails.length > 0 ? (
											fileTrails.map((w) => (
												<TrailButton
													key={w.id}
													graphTitle={graph.title}
													trail={w}
													openFile={openFile ?? null}
													onOpen={() => onOpenTrail?.(w.id)}
												/>
											))
										) : (
											fileComponents.map((m) => (
												<button
													key={m.alias}
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														onOpenComponent?.(m);
													}}
													onMouseEnter={(e) => {
														e.currentTarget.style.background = theme.colors.border ?? "#333";
													}}
													onMouseLeave={(e) => {
														e.currentTarget.style.background = "transparent";
													}}
													style={{
														border: "none",
														background: "transparent",
														padding: "2px 4px",
														cursor: "pointer",
														color: "inherit",
														font: "inherit",
														textAlign: "left",
														fontSize: theme.fontSizes[1],
														whiteSpace: "nowrap",
														overflow: "hidden",
														textOverflow: "ellipsis",
														borderRadius: 4,
													}}
												>
													{m.name}
													<span style={{ color: muted }}> · {m.construct}</span>
												</button>
											))
										)}
									</>
								) : isRowExpanded ? (
									<>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												fontSize: theme.fontSizes[0],
												color: muted,
											}}
										>
											<RouteIcon size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
											Trails
										</div>
										{(graph.trails ?? []).length === 0 ? (
											<div
												style={{
													fontSize: theme.fontSizes[1],
													color: muted,
												}}
											>
												No trails yet.
											</div>
										) : (
											(graph.trails ?? []).map((w) => (
												<TrailButton
													key={w.id}
													graphTitle={graph.title}
													trail={w}
													openFile={openFile ?? null}
													onOpen={() => onOpenTrail?.(w.id)}
												/>
											))
										)}
									</>
								) : null}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
