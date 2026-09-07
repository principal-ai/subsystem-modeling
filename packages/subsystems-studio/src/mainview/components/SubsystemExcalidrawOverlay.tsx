/**
 * Full-pane overlay that fades the Excalidraw editor over a subsystem graph.
 *
 * The graph stays mounted underneath so closing restores it immediately.
 * Conversion happens while the overlay is already fading in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type {
	ExcalidrawImperativeAPI,
	ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	SubsystemComponent,
	SubsystemComponentEdge,
} from "@principal-ai/subsystems-react";
import {
	subsystemModelToExcalidrawScene,
	type ExcalidrawScene,
} from "../excalidraw/subsystemToExcalidraw";
import {
	resolveExcalidrawSelection,
	type ExcalidrawSelectionInfo,
} from "../excalidraw/excalidrawToSubsystem";

const FADE_MS = 280;

export function SubsystemExcalidrawOverlay({
	open,
	title,
	components,
	edges,
	onSelectionChange,
}: {
	open: boolean;
	title: string;
	components: SubsystemComponent[];
	edges: SubsystemComponentEdge[];
	onSelectionChange?: (selection: ExcalidrawSelectionInfo | null) => void;
}) {
	const { theme } = useTheme();
	const [mounted, setMounted] = useState(open);
	const [visible, setVisible] = useState(false);
	const [scene, setScene] = useState<ExcalidrawScene | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setMounted(true);
			setScene(null);
			setError(null);
			const show = requestAnimationFrame(() => setVisible(true));
			let cancelled = false;
			void subsystemModelToExcalidrawScene(components, edges, title)
				.then((s) => {
					if (!cancelled) setScene(s);
				})
				.catch((err: unknown) => {
					if (!cancelled) {
						setError(err instanceof Error ? err.message : String(err));
					}
				});
			return () => {
				cancelled = true;
				cancelAnimationFrame(show);
			};
		}
		setVisible(false);
		const t = window.setTimeout(() => {
			setMounted(false);
			setScene(null);
		}, FADE_MS);
		return () => window.clearTimeout(t);
	}, [open, components, edges, title]);

	useEffect(() => {
		if (!open) onSelectionChange?.(null);
	}, [open, onSelectionChange]);

	if (!mounted) return null;

	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 20,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				opacity: visible ? 1 : 0,
				transform: visible ? "scale(1)" : "scale(0.985)",
				transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
			}}
		>
			<div style={{ flex: 1, minHeight: 0, position: "relative" }}>
				{error ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
							color: "#f87171",
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[1],
							padding: 24,
							textAlign: "center",
						}}
					>
						Could not convert graph: {error}
					</div>
				) : scene ? (
					<CenteredExcalidrawScene scene={scene} onSelectionChange={onSelectionChange} />
				) : (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
							color: muted,
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[1],
						}}
					>
						Building drawing…
					</div>
				)}
			</div>
		</div>
	);
}

function CenteredExcalidrawScene({
	scene,
	onSelectionChange,
}: {
	scene: ExcalidrawScene;
	onSelectionChange?: (selection: ExcalidrawSelectionInfo | null) => void;
}) {
	const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
	const selectionKeyRef = useRef("");

	const fit = useCallback(() => {
		apiRef.current?.scrollToContent(undefined, {
			fitToContent: true,
			animate: false,
		});
	}, []);

	return (
		<Excalidraw
			excalidrawAPI={(api) => {
				apiRef.current = api;
				window.setTimeout(fit, 0);
				window.setTimeout(fit, 160);
			}}
			theme="dark"
			initialData={{
				elements: scene.elements as ExcalidrawInitialDataState["elements"],
				appState: {
					name: scene.appState.name,
					theme: "dark",
					collaborators: new Map(),
				},
				scrollToContent: true,
				files: scene.files,
			}}
			onChange={(elements, appState) => {
				const info = resolveExcalidrawSelection(elements, appState.selectedElementIds);
				const key = info ? `${info.count}:${info.elementId}` : "";
				if (key === selectionKeyRef.current) return;
				selectionKeyRef.current = key;
				onSelectionChange?.(info);
			}}
			UIOptions={{
				canvasActions: {
					loadScene: false,
					saveToActiveFile: false,
				},
			}}
		/>
	);
}
