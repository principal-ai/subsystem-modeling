/**
 * TabStrip — the tab bar above the active view. Renders permanent tabs
 * (Agent Sessions, Tours) plus per-tour tabs, with a close affordance on the
 * non-permanent ones. Non-permanent tabs can be dragged out of the window to
 * open them in their own window.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	Activity,
	Bot,
	Braces,
	Boxes,
	Container,
	FileText,
	Gauge,
	GitPullRequest,
	LayoutDashboard,
	LayoutGrid,
	Library,
	PencilRuler,
	Route,
	Share2,
	Terminal,
	Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TabSummary } from "../../shared/contract";

const COPY_FEEDBACK_MS = 1500;

const KIND_ICONS: Partial<Record<TabSummary["kind"], LucideIcon>> = {
	library: Library,
	tour: Route,
	"agent-sessions": Bot,
	"maintenance-sessions": Wrench,
	"session-events": Activity,
	"subsystem-model": LayoutDashboard,
	"subsystem-c4": Boxes,
	"c4-sketch": PencilRuler,
	"subsystem-showcase": LayoutGrid,
	subsystems: LayoutDashboard,
	"shared-subsystems": Share2,
	"remote-subsystem-model": LayoutDashboard,
	constructs: Braces,
	maintenance: Gauge,
	graphify: Share2,
	"package-layers": Container,
	"opencode-v2": Terminal,
	"merged-pull-requests": GitPullRequest,
};

export interface TabDropPoint {
	screenX: number;
	screenY: number;
}

interface TabDrag {
	tabId: string;
	title: string;
	outside: boolean;
}

export function TabStrip({
	tabs,
	activeTabId,
	onSelect,
	onClose,
	onDetach,
}: {
	tabs: TabSummary[];
	activeTabId: string | null;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	/** Drag a tab out of the window: called with the release point in screen
	 *  coordinates. Omit to disable dragging. */
	onDetach?: (id: string, dropPoint: TabDropPoint) => void;
}) {
	const { theme } = useTheme();
	const [drag, setDrag] = useState<TabDrag | null>(null);
	const dragRef = useRef<TabDrag | null>(null);
	const dragImageRef = useRef<HTMLElement | null>(null);

	const updateDrag = useCallback((next: TabDrag | null) => {
		dragRef.current = next;
		setDrag(next);
	}, []);

	// WebKit stops delivering drag events once the pointer leaves the window, so
	// "outside" is inferred: a dragleave with no relatedTarget means the pointer
	// left the document; any later dragover inside flips it back.
	useEffect(() => {
		if (!drag) return;
		const onLeave = (e: DragEvent) => {
			if (e.relatedTarget !== null) return;
			const cur = dragRef.current;
			if (cur && !cur.outside) updateDrag({ ...cur, outside: true });
		};
		const onOver = (e: DragEvent) => {
			// Allow the tab to be dropped back where it came from without the
			// "not allowed" cursor.
			e.preventDefault();
			const cur = dragRef.current;
			if (cur?.outside) updateDrag({ ...cur, outside: false });
		};
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("dragover", onOver);
		return () => {
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("dragover", onOver);
		};
	}, [drag, updateDrag]);

	const removeDragImage = useCallback(() => {
		dragImageRef.current?.remove();
		dragImageRef.current = null;
	}, []);
	useEffect(() => removeDragImage, [removeDragImage]);
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
				alignItems: "stretch",
				gap: 2,
				padding: 0,
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
					tab.kind === "maintenance-sessions" ||
					tab.kind === "subsystems" ||
					tab.kind === "shared-subsystems" ||
					tab.kind === "constructs" ||
					tab.kind === "maintenance" ||
					tab.kind === "graphify" ||
					tab.kind === "package-layers" ||
					tab.kind === "opencode-v2" ||
					tab.kind === "merged-pull-requests";
				const canCopyPath =
					tab.kind === "subsystem-model" && typeof tab.path === "string";
				const canDetach = !isPermanent && onDetach !== undefined;
				const justCopied = copiedTabId === tab.id;
				const Icon = KIND_ICONS[tab.kind] ?? FileText;
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
						draggable={canDetach}
						onDragStart={(e) => {
							if (!canDetach) return;
							e.dataTransfer.setData("text/plain", tab.id);
							e.dataTransfer.effectAllowed = "move";
							// Drag a copy of the tab so the ghost is the full tab, not
							// just the text the pointer happened to grab.
							const source = e.currentTarget;
							const ghost = source.cloneNode(true) as HTMLElement;
							const rect = source.getBoundingClientRect();
							Object.assign(ghost.style, {
								position: "fixed",
								top: "-1000px",
								left: "-1000px",
								width: `${rect.width}px`,
								opacity: "0.9",
								pointerEvents: "none",
							});
							document.body.appendChild(ghost);
							removeDragImage();
							dragImageRef.current = ghost;
							e.dataTransfer.setDragImage(
								ghost,
								e.clientX - rect.left,
								e.clientY - rect.top,
							);
							updateDrag({ tabId: tab.id, title: tab.title, outside: false });
						}}
						onDragEnd={(e) => {
							const cur = dragRef.current;
							removeDragImage();
							updateDrag(null);
							if (!cur || cur.tabId !== tab.id || !onDetach) return;
							// dragend fires inside the window even when released outside
							// it; the client point then lands past the viewport edge.
							const outOfBounds =
								e.clientX < 0 ||
								e.clientY < 0 ||
								e.clientX > window.innerWidth ||
								e.clientY > window.innerHeight;
							if (!cur.outside && !outOfBounds) return;
							onDetach(tab.id, { screenX: e.screenX, screenY: e.screenY });
						}}
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
							gap: 8,
							padding: "8px 14px",
							borderRadius: 0,
							background: isActive
								? theme.colors.background
								: theme.colors.backgroundSecondary ?? "transparent",
							color: justCopied
								? (theme.colors.success ?? theme.colors.text)
								: isActive
									? theme.colors.text
									: theme.colors.textSecondary,
							borderTop: "transparent",
							borderLeft: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							borderRight: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							cursor: "pointer",
							fontSize: theme.fontSizes[2],
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
						<Icon
							size={16}
							style={{ flexShrink: 0 }}
							color={
								justCopied
									? (theme.colors.success ?? theme.colors.text)
									: isActive
										? theme.colors.text
										: theme.colors.textSecondary
							}
							aria-hidden="true"
						/>
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
			{drag?.outside && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 1000,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(0, 0, 0, 0.35)",
						pointerEvents: "none",
						fontFamily: theme.fonts.body,
					}}
				>
					<div
						style={{
							padding: "12px 18px",
							borderRadius: 8,
							background: theme.colors.backgroundSecondary ?? theme.colors.background,
							border: `1px solid ${theme.colors.border ?? "#444"}`,
							color: theme.colors.text,
							fontSize: theme.fontSizes[2],
							boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
						}}
					>
						Release to open “{drag.title}” in a new window
					</div>
				</div>
			)}
		</div>
	);
}
