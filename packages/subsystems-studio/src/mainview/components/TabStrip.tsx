/**
 * TabStrip — the tab bar above the active view. Renders permanent tabs
 * (Agent Sessions, Trails) plus per-trail tabs, with a close affordance on the
 * non-permanent ones.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { TabSummary } from "../../shared/contract";

const COPY_FEEDBACK_MS = 1500;

export function TabStrip({
	tabs,
	activeTabId,
	onSelect,
	onClose,
}: {
	tabs: TabSummary[];
	activeTabId: string | null;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
}) {
	const { theme } = useTheme();
	// First pointer-down of a (potential) double-click: whether that tab was
	// already active. The second pointer-down must not overwrite this — by then
	// the first click has already activated the tab.
	const copyGestureRef = useRef<{
		tabId: string;
		wasActive: boolean;
		at: number;
	} | null>(null);
	const [copiedTabId, setCopiedTabId] = useState<string | null>(null);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const flashCopied = useCallback((tabId: string) => {
		setCopiedTabId(tabId);
		if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		copyTimeoutRef.current = setTimeout(() => setCopiedTabId(null), COPY_FEEDBACK_MS);
	}, []);

	if (tabs.length === 0) return null;
	return (
		<div
			style={{
				display: "flex",
				gap: 2,
				padding: "4px 6px 0",
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				overflowX: "auto",
				// Pin overflowY: a lone `overflow-x: auto` computes overflow-y to
				// `auto` too, and the tabs' `marginBottom: -1` (overlapping the
				// bottom border) spills 1px vertically → a stray scrollbar here.
				overflowY: "hidden",
				flexShrink: 0,
			}}
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				const isPermanent =
					tab.kind === "library" ||
					tab.kind === "agent-sessions" ||
					tab.kind === "subsystems" ||
					tab.kind === "graphify";
				const canCopyPath =
					tab.kind === "subsystem-model" && typeof tab.path === "string";
				const justCopied = copiedTabId === tab.id;
				return (
					<div
						key={tab.id}
						onPointerDown={() => {
							const now = Date.now();
							const prev = copyGestureRef.current;
							const secondOfDouble =
								prev !== null &&
								prev.tabId === tab.id &&
								now - prev.at < 500;
							if (!secondOfDouble) {
								copyGestureRef.current = {
									tabId: tab.id,
									wasActive: isActive,
									at: now,
								};
							} else {
								copyGestureRef.current = { ...prev, at: now };
							}
						}}
						onClick={() => onSelect(tab.id)}
						onDoubleClick={() => {
							const gesture = copyGestureRef.current;
							const path = tab.path;
							if (
								!canCopyPath ||
								!path ||
								gesture?.tabId !== tab.id ||
								!gesture.wasActive
							) {
								return;
							}
							void navigator.clipboard.writeText(path).then(
								() => flashCopied(tab.id),
								() => {
									// clipboard may be denied — fail quietly
								},
							);
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "6px 10px",
							borderRadius: "6px 6px 0 0",
							background: isActive
								? theme.colors.background
								: theme.colors.backgroundSecondary ?? "transparent",
							color: justCopied
								? (theme.colors.success ?? theme.colors.text)
								: isActive
									? theme.colors.text
									: theme.colors.textSecondary,
							borderTop: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							borderLeft: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							borderRight: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							cursor: "pointer",
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							// Natural width while the strip has room; when tabs
							// collectively overflow, flex-shrink squeezes them and
							// the label ellipsizes (minWidth: 0 unlocks the floor,
							// the span's overflow/ellipsis does the clipping).
							minWidth: 0,
							userSelect: "none",
							marginBottom: -1,
						}}
					>
						<span
							style={{
								position: "relative",
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
								flex: 1,
								minWidth: 0,
							}}
						>
							{/* Title stays in flow so the tab width does not jump when
							    copy feedback overlays it. */}
							<span
								style={{
									visibility: justCopied ? "hidden" : "visible",
								}}
							>
								{tab.title}
							</span>
							{justCopied && (
								<span
									style={{
										position: "absolute",
										inset: 0,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									Copied path
								</span>
							)}
						</span>
						{!isPermanent && (
							<span
								onClick={(e) => {
									e.stopPropagation();
									onClose(tab.id);
								}}
								style={{
									width: 16,
									height: 16,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									borderRadius: 3,
									color: theme.colors.textMuted ?? "#888",
									fontSize: theme.fontSizes[1],
									lineHeight: 1,
									cursor: "pointer",
								}}
								title="Close tab"
							>
								×
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}
