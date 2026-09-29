/**
 * Frame-level rollup of a composed subsystem graph for the aggregate view.
 *
 * One node per process / module frame (+ a single ungrouped bucket), with
 * walkthrough steps rebased to frame ids and intra-frame hops dropped. The
 * output document renders as-is in the shared `SubsystemComponentGraph` (with
 * edge labels off) — same implementation as the model views, coarser data.
 *
 * Pure over the merged document (+ optional merge sidecar for member →
 * model attribution), so it is unit-testable beside the view.
 */

import type {
	MergeSidecar,
	SubsystemModelDocument,
	SubsystemWalkthrough,
} from "../../shared/contract";

export interface AggregateMember {
	alias: string;
	name: string;
	file: string;
	construct: string;
	models: string[];
}

export interface AggregateFrame {
	/** Stable key: `module:<key>` | `process:<key>` | `external:<key>` | `ungrouped`. */
	id: string;
	/** How the frame was derived: module membership, process bucket,
	 *  file-less external system, or the homeless bucket. */
	kind: "module" | "process" | "external" | "ungrouped";
	/** Module path / process key / external system key / "" for ungrouped. */
	key: string;
	/** Short display label (basename for modules). */
	label: string;
	/**
	 * Enclosing boundary. Process code frames nest in their process frame;
	 * every external frame nests in the single `external` boundary.
	 * Absent = root-level (module with no process, ungrouped).
	 */
	group?: { key: string; kind: "process" | "external" };
	members: AggregateMember[];
	models: string[];
}

/** Boundary key shared by every external frame. */
export const EXTERNAL_GROUP_KEY = "external";

export interface AggregateEdge {
	from: string;
	to: string;
	mechanisms: string[];
	walkthroughIds: string[];
	steps: number;
	/**
	 * Hub routing: `source`/`target` name the real member frame the hop
	 * started/ended at; `from`/`to` are the drawn endpoints. Hub-stub edges
	 * carry one side only (member → outtake, intake → member); trunk edges
	 * (outtake → intake) carry neither.
	 */
	source?: string;
	target?: string;
}

/** Intake/outtake hub node for a multi-frame boundary. */
export interface AggregateHub {
	id: string;
	/** Enclosing boundary (matches the frames' `group`). */
	group: { key: string; kind: "process" | "external" };
	kind: "intake" | "outtake";
	label: string;
}

export interface AggregateGraph {
	/** Process column order (first-seen); ungrouped renders last. */
	processes: string[];
	frames: AggregateFrame[];
	edges: AggregateEdge[];
	/** Intake/outtake hubs for boundaries with more than one frame. */
	hubs: AggregateHub[];
	/**
	 * Renderable document: one `external` node per frame, walkthrough steps
	 * rebased to frame ids, intra-frame and unresolvable hops dropped.
	 */
	document: {
		components: SubsystemModelDocument["components"];
		walkthroughs: SubsystemWalkthrough[];
	};
}

function shortLabel(kind: AggregateFrame["kind"], key: string): string {
	if (kind === "ungrouped") return "ungrouped";
	if (kind === "process" || kind === "external") return key;
	const base = key.split("/").pop() ?? key;
	return base === "" ? key : base;
}

/**
 * Roll a composed document up to frames. Walkthrough steps map to their
 * endpoint frames; intra-frame steps are internal and skipped; parallel
 * steps collapse into one edge with a step count.
 */
export function aggregateToFrames(
	doc: Pick<SubsystemModelDocument, "components" | "walkthroughs">,
	sidecar?: MergeSidecar | null,
): AggregateGraph {
	const modelsByAlias = new Map<string, string[]>();
	if (sidecar) {
		for (const n of sidecar.nodes) modelsByAlias.set(n.alias, n.sourceModels);
	}

	const frames = new Map<string, AggregateFrame>();
	const frameOrder: string[] = [];
	const getFrame = (id: string, kind: AggregateFrame["kind"], key: string): AggregateFrame => {
		let f = frames.get(id);
		if (!f) {
			f = { id, kind, key, label: shortLabel(kind, key), members: [], models: [] };
			frames.set(id, f);
			frameOrder.push(id);
		}
		return f;
	};

	// Majority process per module decides its column. Maps preserve
	// insertion order and the winner uses strict >, so ties go first-seen.
	const moduleProcessVotes = new Map<string, Map<string, number>>();
	const frameOf = new Map<string, string>();
	const processes: string[] = [];

	for (const c of doc.components ?? []) {
		const module = (c.module ?? "").trim();
		const process = (c.process ?? "").trim();
		const file = (c.file ?? "").trim();
		let frame: AggregateFrame;
		if (module !== "") {
			if (process !== "" && !processes.includes(process)) processes.push(process);
			frame = getFrame(`module:${module}`, "module", module);
			if (process !== "") {
				let votes = moduleProcessVotes.get(module);
				if (!votes) {
					votes = new Map();
					moduleProcessVotes.set(module, votes);
				}
				votes.set(process, (votes.get(process) ?? 0) + 1);
			}
		} else if (file === "" && c.proposed !== true) {
			// File-less, non-placeholder = not code in the repo (external
			// systems, stores, actors). These get their own boundary rather
			// than masquerading as a process's unframed remainder. One frame
			// per system (the process names it); no process = `unassigned`.
			const system = process !== "" ? process : "unassigned";
			frame = getFrame(`external:${system}`, "external", system);
		} else if (process !== "") {
			if (!processes.includes(process)) processes.push(process);
			// Grounded code with no module (or a proposed placeholder):
			// the process boundary holds it as unframed.
			frame = getFrame(`process:${process}`, "process", process);
		} else {
			frame = getFrame("ungrouped", "ungrouped", "");
		}
		frameOf.set(c.alias, frame.id);
		frame.members.push({
			alias: c.alias,
			name: c.name,
			file: c.file,
			construct: c.construct ?? "",
			models: modelsByAlias.get(c.alias) ?? [],
		});
	}

	// Assign enclosing boundaries + roll member/model lists into order.
	for (const id of frameOrder) {
		const f = frames.get(id)!;
		if (f.kind === "module") {
			const votes = moduleProcessVotes.get(f.key);
			if (votes && votes.size > 0) {
				let best = "";
				let bestCount = -1;
				for (const [p, n] of votes) {
					if (n > bestCount) {
						best = p;
						bestCount = n;
					}
				}
				if (best !== "") f.group = { key: best, kind: "process" };
			}
		} else if (f.kind === "process") {
			f.group = { key: f.key, kind: "process" };
		} else if (f.kind === "external") {
			// Every external system shares one boundary.
			f.group = { key: EXTERNAL_GROUP_KEY, kind: "external" };
		}
		const seenModels = new Set<string>();
		const models: string[] = [];
		for (const m of f.members) {
			for (const id of m.models) {
				if (!seenModels.has(id)) {
					seenModels.add(id);
					models.push(id);
				}
			}
		}
		f.models = models;
	}

	const edgeMap = new Map<string, AggregateEdge>();
	for (const w of doc.walkthroughs ?? []) {
		for (const s of w.steps ?? []) {
			const from = frameOf.get(s.from);
			const to = frameOf.get(s.to);
			if (!from || !to || from === to) continue;
			const key = `${from}\0${to}`;
			let e = edgeMap.get(key);
			if (!e) {
				e = { from, to, mechanisms: [], walkthroughIds: [], steps: 0 };
				edgeMap.set(key, e);
			}
			e.steps += 1;
			if (!e.mechanisms.includes(s.mechanism)) e.mechanisms.push(s.mechanism);
			if (!e.walkthroughIds.includes(w.id)) e.walkthroughIds.push(w.id);
		}
	}

	const orderedFrames = frameOrder.map((id) => frames.get(id)!);

	// Boundaries with more than one frame get an intake/outtake hub pair;
	// inter-boundary hops route member → source hub → target hub → member,
	// so crossings collapse to one trunk per boundary pair instead of one
	// line per member pair. Single-frame boundaries connect directly.
	const frameCountByGroup = new Map<string, number>();
	for (const f of orderedFrames) {
		if (!f.group) continue;
		const k = `${f.group.kind}:${f.group.key}`;
		frameCountByGroup.set(k, (frameCountByGroup.get(k) ?? 0) + 1);
	}
	const hubByGroup = new Map<string, { intake: string; outtake: string }>();
	const hubs: AggregateHub[] = [];
	for (const f of orderedFrames) {
		if (!f.group) continue;
		const k = `${f.group.kind}:${f.group.key}`;
		if ((frameCountByGroup.get(k) ?? 0) < 2 || hubByGroup.has(k)) continue;
		const intake = `hub:in:${k}`;
		const outtake = `hub:out:${k}`;
		hubByGroup.set(k, { intake, outtake });
		hubs.push(
			{ id: intake, group: f.group, kind: "intake", label: `${f.group.key} in` },
			{ id: outtake, group: f.group, kind: "outtake", label: `${f.group.key} out` },
		);
	}

	const groupKeyOf = (frameId: string): string | null => {
		const f = frames.get(frameId);
		return f?.group ? `${f.group.kind}:${f.group.key}` : null;
	};

	const routed = new Map<string, AggregateEdge>();
	const addEdge = (
		from: string,
		to: string,
		src: AggregateEdge,
		ends: { source?: string; target?: string },
	) => {
		if (from === to) return;
		const key = `${from}\0${to}`;
		let e = routed.get(key);
		if (!e) {
			e = {
				from,
				to,
				mechanisms: [],
				walkthroughIds: [],
				steps: 0,
				...ends,
			};
			routed.set(key, e);
		}
		// Accumulate the source edge's deduped step count (not 1) so a
		// collapsed member-pair flow keeps its weight through the hub.
		e.steps += src.steps;
		for (const m of src.mechanisms) if (!e.mechanisms.includes(m)) e.mechanisms.push(m);
		for (const w of src.walkthroughIds) {
			if (!e.walkthroughIds.includes(w)) e.walkthroughIds.push(w);
		}
	};

	for (const e of edgeMap.values()) {
		const fromGroup = groupKeyOf(e.from);
		const toGroup = groupKeyOf(e.to);
		const fromHub = fromGroup ? hubByGroup.get(fromGroup) : undefined;
		const toHub = toGroup ? hubByGroup.get(toGroup) : undefined;
		// Only route when the hop actually leaves its boundary.
		if (fromGroup === toGroup) {
			addEdge(e.from, e.to, e, { source: e.from, target: e.to });
			continue;
		}
		if (fromHub) {
			addEdge(e.from, fromHub.outtake, e, { source: e.from });
			if (toHub) addEdge(fromHub.outtake, toHub.intake, e, {});
			else addEdge(fromHub.outtake, e.to, e, { target: e.to });
		} else if (toHub) {
			addEdge(e.from, toHub.intake, e, { source: e.from });
		} else {
			addEdge(e.from, e.to, e, { source: e.from, target: e.to });
		}
		if (toHub) addEdge(toHub.intake, e.to, e, { target: e.to });
	}

	const edges = [...routed.values()];

	const components: SubsystemModelDocument["components"] = orderedFrames.map((f) => ({
		alias: f.id,
		name: f.label,
		construct: "external" as const,
		file: "",
		purl: "external",
		purpose:
			f.models.length > 0
				? `${f.members.length} member${f.members.length === 1 ? "" : "s"} · ${f.models.length} model${f.models.length === 1 ? "" : "s"}`
				: `${f.members.length} member${f.members.length === 1 ? "" : "s"}`,
	}));
	// Hub nodes ride the same document so the drawn edges resolve; the
	// renderer swaps their chrome for a compact pill.
	for (const h of hubs) {
		components.push({
			alias: h.id,
			name: h.label,
			construct: "external" as const,
			file: "",
			purl: "external",
			purpose: h.kind === "intake" ? "boundary intake" : "boundary outtake",
		});
	}

	const walkthroughs: SubsystemWalkthrough[] = [];
	for (const w of doc.walkthroughs ?? []) {
		const steps = (w.steps ?? []).flatMap((s) => {
			const from = frameOf.get(s.from);
			const to = frameOf.get(s.to);
			if (!from || !to || from === to) return [];
			return [{ ...s, from, to }];
		});
		if (steps.length === 0) continue;
		walkthroughs.push({ ...w, steps });
	}

	return {
		processes,
		frames: orderedFrames,
		edges,
		hubs,
		document: { components, walkthroughs },
	};
}
