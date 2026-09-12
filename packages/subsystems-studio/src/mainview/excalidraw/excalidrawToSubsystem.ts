/**
 * Rebuild a subsystem graph from an Excalidraw scene that was produced by
 * `subsystemModelToExcalidrawScene` (elements carry `customData.principal`).
 */

import type {
	SubsystemComponent,
	SubsystemComponentEdge,
} from "@principal-ai/subsystems-react";
import {
	PRINCIPAL_META_KEY,
	type PrincipalComponentMeta,
	type PrincipalEdgeMeta,
} from "./subsystemToExcalidraw";

export interface ExcalidrawLikeScene {
	elements?: unknown[];
	appState?: { name?: string | null };
}

export interface RebuiltSubsystemModel {
	title: string;
	components: SubsystemComponent[];
	edges: SubsystemComponentEdge[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function principalMeta(el: unknown): Record<string, unknown> | null {
	if (!isRecord(el) || el["isDeleted"] === true) return null;
	const data = el["customData"];
	if (!isRecord(data)) return null;
	const meta = data[PRINCIPAL_META_KEY];
	if (!isRecord(meta) || typeof meta["type"] !== "string") return null;
	return meta;
}

function asString(v: unknown, fallback = ""): string {
	return typeof v === "string" ? v : fallback;
}

function componentFromMeta(meta: Record<string, unknown>): SubsystemComponent {
	const layer = meta["layer"];
	const role = meta["role"];
	const proposed = meta["proposed"];
	return {
		id: asString(meta["id"]),
		name: asString(meta["name"], asString(meta["id"])),
		construct: (asString(meta["construct"], "module") as SubsystemComponent["construct"]),
		file: asString(meta["file"]),
		purl: asString(meta["purl"]),
		symbol: typeof meta["symbol"] === "string" ? meta["symbol"] : undefined,
		purpose: typeof meta["purpose"] === "string" ? meta["purpose"] : undefined,
		role: role === "entry" || role === "service" ? role : undefined,
		proposed: proposed === true ? true : undefined,
		layer: typeof layer === "number" ? layer : undefined,
	};
}

function edgeFromMeta(meta: Record<string, unknown>): SubsystemComponentEdge {
	const refs = meta["refs"];
	return {
		id: asString(meta["id"]),
		from: asString(meta["from"]),
		to: asString(meta["to"]),
		mechanism: asString(meta["mechanism"], "uses") as SubsystemComponentEdge["mechanism"],
		refs: Array.isArray(refs) ? refs.filter((r): r is string => typeof r === "string") : undefined,
	};
}

export interface ExcalidrawSelectionInfo {
	count: number;
	elementId: string;
	elementType: string;
	label: string;
	principal: Record<string, unknown> | null;
}

function elementById(
	elements: readonly unknown[],
	id: string,
): Record<string, unknown> | null {
	for (const el of elements) {
		if (isRecord(el) && el["id"] === id && el["isDeleted"] !== true) return el;
	}
	return null;
}

function resolveSelectedElement(
	elements: readonly unknown[],
	selectedId: string,
): Record<string, unknown> | null {
	const el = elementById(elements, selectedId);
	if (!el) return null;
	if (el["type"] === "text" && typeof el["containerId"] === "string") {
		return elementById(elements, el["containerId"]) ?? el;
	}
	return el;
}

function selectionLabel(el: Record<string, unknown>, meta: Record<string, unknown> | null): string {
	if (meta) {
		if (meta["type"] === "subsystem-component") {
			return asString(meta["symbol"] || meta["name"] || meta["id"], "component");
		}
		if (meta["type"] === "subsystem-edge") {
			return asString(meta["mechanism"], "edge");
		}
	}
	return asString(el["type"], "element");
}

/** Map Excalidraw's selectedElementIds to our principal metadata (follows bound text). */
export function resolveExcalidrawSelection(
	elements: readonly unknown[],
	selectedElementIds: Readonly<Record<string, boolean>>,
): ExcalidrawSelectionInfo | null {
	const ids = Object.keys(selectedElementIds).filter((id) => selectedElementIds[id]);
	if (ids.length === 0) return null;
	const firstId = ids[0];
	if (!firstId) return null;
	const el = resolveSelectedElement(elements, firstId);
	if (!el) return { count: ids.length, elementId: firstId, elementType: "unknown", label: "unknown", principal: null };
	const meta = principalMeta(el);
	return {
		count: ids.length,
		elementId: asString(el["id"], firstId),
		elementType: asString(el["type"], "unknown"),
		label: selectionLabel(el, meta),
		principal: meta,
	};
}

export function excalidrawSceneToSubsystemModel(
	scene: ExcalidrawLikeScene,
): RebuiltSubsystemModel {
	const components: SubsystemComponent[] = [];
	const edges: SubsystemComponentEdge[] = [];
	const seenComp = new Set<string>();
	const seenEdge = new Set<string>();

	for (const el of scene.elements ?? []) {
		const meta = principalMeta(el);
		if (!meta) continue;
		if (meta["type"] === "subsystem-component") {
			const c = componentFromMeta(meta);
			if (!c.id || seenComp.has(c.id)) continue;
			seenComp.add(c.id);
			components.push(c);
		} else if (meta["type"] === "subsystem-edge") {
			const e = edgeFromMeta(meta);
			if (!e.id || seenEdge.has(e.id)) continue;
			seenEdge.add(e.id);
			edges.push(e);
		}
	}

	const title =
		typeof scene.appState?.name === "string" && scene.appState.name.trim()
			? scene.appState.name
			: "Untitled subsystem";

	return { title, components, edges };
}

export type { PrincipalComponentMeta, PrincipalEdgeMeta };
