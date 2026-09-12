/**
 * Convert a subsystem component graph into an Excalidraw scene.
 *
 * Layout is the same ELK pass the React Flow view uses (layered, left-to-right,
 * orthogonal routes). Nodes become labeled rectangles; edges become bound
 * arrows so the user can drag boxes and keep the connections.
 */

import {
	computeElkLayout,
	CONSTRUCT_COLOR,
	MECHANISM_COLOR,
	MECHANISM_STYLE,
} from "@principal-ai/subsystems-react";
import type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemComponentConstruct,
	SubsystemComponentRole,
	SubsystemEdgeMechanism,
} from "@principal-ai/subsystems-react";
import type { Edge, Node } from "@xyflow/react";

export interface ExcalidrawScene {
	type: "excalidraw";
	version: 2;
	source: "subsystem-model";
	elements: unknown[];
	appState: { name: string; theme: "dark" };
	files: Record<string, never>;
}

/** Translate elements so the group's bounding-box center sits at (0, 0). */
export function centerExcalidrawElements<
	T extends { x: number; y: number; width?: number; height?: number; isDeleted?: boolean },
>(elements: readonly T[]): T[] {
	const live = elements.filter((e) => !e.isDeleted);
	if (live.length === 0) return elements.slice();
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const e of live) {
		minX = Math.min(minX, e.x);
		minY = Math.min(minY, e.y);
		maxX = Math.max(maxX, e.x + (e.width ?? 0));
		maxY = Math.max(maxY, e.y + (e.height ?? 0));
	}
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return elements.map((e) => (e.isDeleted ? e : { ...e, x: e.x - cx, y: e.y - cy }));
}

function asConstruct(construct: string): SubsystemComponentConstruct {
	if (
		construct === "class" ||
		construct === "function" ||
		construct === "method" ||
		construct === "type" ||
		construct === "module" ||
		construct === "store" ||
		construct === "external" ||
		construct === "custom_entity"
	) {
		return construct;
	}
	return "module";
}

function asMechanism(mechanism: string): SubsystemEdgeMechanism {
	if (mechanism in MECHANISM_COLOR) return mechanism as SubsystemEdgeMechanism;
	return "uses";
}

function displayName(c: SubsystemComponent): string {
	if (c.symbol && c.symbol.trim()) return c.symbol;
	if (c.construct === "module" && c.file) {
		const base = c.file.split("/").pop() ?? "";
		const clean = base.replace(/\.[^.]+$/, "");
		if (clean) return clean;
	}
	return c.name || "untitled";
}

function estimateSize(c: SubsystemComponent): { width: number; height: number } {
	const text = [c.symbol, c.name, c.file.split("/").pop() ?? ""]
		.filter((t): t is string => !!t)
		.sort((a, b) => b.length - a.length)[0];
	const textWidth = Math.min(300, Math.max(60, (text?.length ?? 10) * 8));
	const width = Math.max(150, Math.min(300, textWidth + 24));
	return { width, height: 84 };
}

function nodeLabel(c: SubsystemComponent): string {
	return displayName(c);
}

export interface LaidOutNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	component: SubsystemComponent;
}

export interface LaidOutEdge {
	id: string;
	from: string;
	to: string;
	mechanism: SubsystemEdgeMechanism;
	refs?: string[];
	points: Array<{ x: number; y: number }>;
}

/** Namespace for round-trip metadata on generated Excalidraw elements. */
export const PRINCIPAL_META_KEY = "principal" as const;

export type PrincipalComponentMeta = {
	type: "subsystem-component";
	id: string;
	name: string;
	construct: SubsystemComponentConstruct;
	file: string;
	purl: string;
	symbol?: string;
	purpose?: string;
	role?: SubsystemComponentRole;
	proposed?: boolean;
	layer?: number;
};

export type PrincipalEdgeMeta = {
	type: "subsystem-edge";
	id: string;
	from: string;
	to: string;
	mechanism: SubsystemEdgeMechanism;
	refs?: string[];
};

export type PrincipalCustomData =
	| { [PRINCIPAL_META_KEY]: PrincipalComponentMeta }
	| { [PRINCIPAL_META_KEY]: PrincipalEdgeMeta };

function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
	return Object.fromEntries(
		Object.entries(obj).filter(([, v]) => v !== undefined),
	) as T;
}

export function principalMetaForComponent(c: SubsystemComponent): PrincipalComponentMeta {
	return omitUndefined({
		type: "subsystem-component",
		id: c.id,
		name: c.name,
		construct: asConstruct(c.construct),
		file: c.file,
		purl: c.purl,
		symbol: c.symbol,
		purpose: c.purpose,
		role: c.role,
		proposed: c.proposed === true ? true : undefined,
		layer: c.layer,
	});
}

export function principalMetaForEdge(e: LaidOutEdge): PrincipalEdgeMeta {
	return omitUndefined({
		type: "subsystem-edge",
		id: e.id,
		from: e.from,
		to: e.to,
		mechanism: e.mechanism,
		refs: e.refs && e.refs.length > 0 ? e.refs : undefined,
	});
}

function attachPrincipalCustomData<T extends { id: string; customData?: unknown }>(
	elements: readonly T[],
	nodes: LaidOutNode[],
	edges: LaidOutEdge[],
): T[] {
	const byId = new Map<string, PrincipalCustomData>();
	for (const n of nodes) {
		byId.set(n.id, { [PRINCIPAL_META_KEY]: principalMetaForComponent(n.component) });
	}
	for (const e of edges) {
		byId.set(e.id, { [PRINCIPAL_META_KEY]: principalMetaForEdge(e) });
	}
	return elements.map((el) => {
		const meta = byId.get(el.id);
		return meta ? { ...el, customData: meta } : el;
	});
}

export async function layoutSubsystemForExcalidraw(
	components: SubsystemComponent[],
	edges: SubsystemComponentEdge[],
): Promise<{ nodes: LaidOutNode[]; edges: LaidOutEdge[] }> {
	const nodes: Node[] = components.map((c, i) => {
		const size = estimateSize(c);
		return {
			id: c.id,
			position: { x: 40 + i * 280, y: 40 },
			width: size.width,
			height: size.height,
			data: { component: c },
		};
	});

	const realIds = new Set(components.map((c) => c.id));
	for (const e of edges) {
		if (realIds.has(e.to)) continue;
		const extId = `external:${e.to}`;
		if (realIds.has(extId)) continue;
		realIds.add(extId);
		const label = e.to;
		const width = Math.max(150, Math.min(300, label.length * 8 + 24));
		nodes.push({
			id: extId,
			position: { x: 40 + nodes.length * 280, y: 40 },
			width,
			height: 60,
			data: {
				component: {
					id: extId,
					name: label,
					construct: "external",
					purl: "external",
					file: "",
					purpose: "cross-package integration target",
				} satisfies SubsystemComponent,
			},
		});
	}

	const flowEdges: Edge[] = edges.map((e) => ({
		id: e.id,
		source: realIds.has(e.from) ? e.from : `external:${e.from}`,
		target: realIds.has(e.to) ? e.to : `external:${e.to}`,
		label: e.mechanism,
		data: { mechanism: e.mechanism, refs: e.refs },
	}));

	if (nodes.length === 0) return { nodes: [], edges: [] };

	let laidNodes = nodes;
	let pathPoints = new Map<string, Array<{ x: number; y: number }>>();
	try {
		const laid = await computeElkLayout(nodes, flowEdges, {
			routingStyle: "orthogonal",
			direction: "RIGHT",
			nodeSpacing: 60,
			edgeSpacing: 30,
			edgeNodeSpacing: 60,
			interLayerSpacing: 120,
			preserveNodePositions: false,
			edgeLabels: { enabled: true, placement: "CENTER" },
		});
		laidNodes = laid.nodes;
		pathPoints = laid.edgePathPoints;
	} catch (err) {
		console.warn("[subsystem-excalidraw] ELK layout failed, using grid positions:", err);
	}

	const outNodes: LaidOutNode[] = laidNodes.map((n) => {
		const component = (n.data as { component: SubsystemComponent }).component;
		return {
			id: n.id,
			x: n.position.x,
			y: n.position.y,
			width: n.width ?? 150,
			height: n.height ?? 84,
			component,
		};
	});

	const outEdges: LaidOutEdge[] = flowEdges.map((e) => {
		const pts = pathPoints.get(e.id) ?? [];
		const data = e.data as { mechanism?: string; refs?: string[] } | undefined;
		return {
			id: e.id,
			from: e.source,
			to: e.target,
			mechanism: asMechanism(String(data?.mechanism ?? e.label ?? "uses")),
			refs: data?.refs,
			points: pts,
		};
	});

	return { nodes: outNodes, edges: outEdges };
}

export async function subsystemModelToExcalidrawScene(
	components: SubsystemComponent[],
	edges: SubsystemComponentEdge[],
	name: string,
): Promise<ExcalidrawScene> {
	const { convertToExcalidrawElements, FONT_FAMILY } = await import("@excalidraw/excalidraw");
	const laid = await layoutSubsystemForExcalidraw(components, edges);
	const skeletons: unknown[] = [];
	// Subsystem names are near-white. Excalidraw dark theme inverts scene
	// colors, so store Excalidraw black — it renders as white on the canvas.
	// Helvetica is the closest built-in sans to Inter.
	const labelFont = FONT_FAMILY.Helvetica;
	const labelColor = "#1e1e1e";

	for (const n of laid.nodes) {
		const construct = asConstruct(n.component.construct);
		skeletons.push({
			id: n.id,
			type: "rectangle",
			x: n.x,
			y: n.y,
			width: n.width,
			height: n.height,
			strokeColor: CONSTRUCT_COLOR[construct],
			backgroundColor: "transparent",
			fillStyle: "solid",
			strokeWidth: 2,
			roughness: 0,
			roundness: { type: 3 },
			label: {
				text: nodeLabel(n.component),
				fontSize: 16,
				fontFamily: labelFont,
				strokeColor: labelColor,
				textAlign: "center",
				verticalAlign: "middle",
			},
			customData: { [PRINCIPAL_META_KEY]: principalMetaForComponent(n.component) },
		});
	}

	for (const e of laid.edges) {
		const pts = e.points;
		const origin = pts[0] ?? { x: 0, y: 0 };
		const points =
			pts.length >= 2
				? pts.map((p) => [p.x - origin.x, p.y - origin.y] as [number, number])
				: undefined;
		skeletons.push({
			id: e.id,
			type: "arrow",
			x: origin.x,
			y: origin.y,
			strokeColor: MECHANISM_COLOR[e.mechanism],
			strokeStyle: MECHANISM_STYLE[e.mechanism],
			strokeWidth: 2,
			roughness: 0,
			endArrowhead: "arrow",
			label: {
				text: e.mechanism,
				fontSize: 14,
				fontFamily: labelFont,
				strokeColor: MECHANISM_COLOR[e.mechanism],
			},
			start: { id: e.from },
			end: { id: e.to },
			customData: { [PRINCIPAL_META_KEY]: principalMetaForEdge(e) },
			...(points ? { points } : {}),
		});
	}
	const elements = centerExcalidrawElements(
		attachPrincipalCustomData(
			convertToExcalidrawElements(
				skeletons as Parameters<typeof convertToExcalidrawElements>[0],
				{ regenerateIds: false },
			),
			laid.nodes,
			laid.edges,
		),
	);

	return {
		type: "excalidraw",
		version: 2,
		source: "subsystem-model",
		elements,
		appState: { name, theme: "dark" },
		files: {},
	};
}
