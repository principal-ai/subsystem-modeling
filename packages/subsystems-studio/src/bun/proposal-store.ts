/**
 * Persist agent correction proposals for subsystem models until a human
 * (or auto-accept) applies them.
 *
 * Layout: `~/.principal/subsystem-model-proposals/<graphId>.json`
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemModelProposal,
	SubsystemModelProposalChange,
	SubsystemModelProposalPreviewRow,
} from "../shared/contract";
import { upsertAcceptedConstructAugmentation, upsertAcceptedSignatureAugmentation } from "./augmentation-store";
import {
	getSubsystemModel,
	purlRepoKey,
	updateSubsystemModel,
	type StoredSubsystemModel,
} from "./subsystem-model-store";

const ROOT = join(homedir(), ".principal", "subsystem-model-proposals");

interface ProposalFile {
	version: 1;
	graphId: string;
	proposals: SubsystemModelProposal[];
}

function proposalPath(graphId: string): string {
	return join(ROOT, `${graphId}.json`);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(ROOT, { recursive: true });
}

function newProposalId(): string {
	return `sp-${randomBytes(6).toString("hex")}`;
}

async function readFile(graphId: string): Promise<ProposalFile> {
	try {
		const raw = await fs.readFile(proposalPath(graphId), "utf8");
		const parsed = JSON.parse(raw) as ProposalFile;
		if (!parsed || !Array.isArray(parsed.proposals)) {
			return { version: 1, graphId, proposals: [] };
		}
		return { version: 1, graphId, proposals: parsed.proposals };
	} catch {
		return { version: 1, graphId, proposals: [] };
	}
}

async function writeFile(doc: ProposalFile): Promise<void> {
	await ensureDir();
	await fs.writeFile(
		proposalPath(doc.graphId),
		`${JSON.stringify(doc, null, 2)}\n`,
		"utf8",
	);
}

function componentFieldBefore(
	graph: StoredSubsystemModel,
	componentId: string,
	field: string,
): unknown {
	const c = graph.components.find((x) => x.id === componentId);
	if (!c) return undefined;
	return (c as unknown as Record<string, unknown>)[field];
}

function walkthroughStepBefore(
	graph: StoredSubsystemModel,
	walkthroughId: string,
	stepIndex: number,
	field: string,
): unknown {
	const tl = graph.walkthroughs?.find((t) => t.id === walkthroughId);
	const step = tl?.steps?.[stepIndex];
	if (!step) return undefined;
	return (step as unknown as Record<string, unknown>)[field];
}

function resolveAugmentationTarget(
	graph: StoredSubsystemModel,
	ch: Extract<SubsystemModelProposalChange, { target: "augmentation" }>,
): { file: string; symbol: string; purl: string; componentName: string } | null {
	const c = graph.components.find((x) => x.id === ch.componentId);
	if (!c) return null;
	const file = (ch.file ?? c.file ?? "").trim();
	const symbol = (ch.symbol ?? c.symbol ?? "").trim();
	const purl =
		purlRepoKey(ch.purl ?? c.purl) ||
		(graph.repo
			? `pkg:github/${graph.repo.owner}/${graph.repo.name}`
			: "");
	if (!file || !symbol || !purl) return null;
	return { file, symbol, purl, componentName: c.name };
}

function buildPreview(
	graph: StoredSubsystemModel,
	changes: SubsystemModelProposalChange[],
): SubsystemModelProposalPreviewRow[] {
	const rows: SubsystemModelProposalPreviewRow[] = [];
	for (const ch of changes) {
		if (ch.target === "component") {
			const name =
				graph.components.find((c) => c.id === ch.componentId)?.name ??
				ch.componentId;
			rows.push({
				label: `${name}.${ch.field}`,
				before: componentFieldBefore(graph, ch.componentId, ch.field),
				after: ch.value,
			});
		} else if (ch.target === "walkthrough-step") {
			rows.push({
				label: `walkthrough ${ch.walkthroughId} step ${ch.stepIndex}.${ch.field}`,
				before: walkthroughStepBefore(
					graph,
					ch.walkthroughId,
					ch.stepIndex,
					ch.field,
				),
				after: ch.value,
			});
		} else {
			const resolved = resolveAugmentationTarget(graph, ch);
			const name = resolved?.componentName ?? ch.componentId;
			const where = resolved
				? `${resolved.file}#${resolved.symbol}`
				: ch.componentId;
			if (ch.field === "signature") {
				const sig = ch.value;
				rows.push({
					label: `augment ${name}.signature (${where})`,
					before: "unconfirmed (graphify no signature edges)",
					after: `params [${(sig.parameterTypes ?? []).join(", ")}] → [${(sig.returnTypes ?? []).join(", ")}]`,
				});
			} else {
				rows.push({
					label: `augment ${name}.${ch.field} (${where})`,
					before: "unconfirmed (graphify unknown)",
					after: ch.value,
				});
			}
		}
	}
	return rows;
}

function validateChanges(
	graph: StoredSubsystemModel,
	changes: SubsystemModelProposalChange[],
): string | null {
	if (!Array.isArray(changes) || changes.length === 0) {
		return "changes array is required";
	}
	for (const ch of changes) {
		if (ch.target === "component") {
			if (!graph.components.some((c) => c.id === ch.componentId)) {
				return `unknown component: ${ch.componentId}`;
			}
			if (ch.field === "declarationRef") {
				if (ch.value !== null && typeof ch.value !== "object") {
					return "declarationRef value must be an object or null";
				}
			} else if (ch.value !== null && typeof ch.value !== "string") {
				return `${ch.field} value must be a string or null`;
			}
		} else if (ch.target === "walkthrough-step") {
			const tl = graph.walkthroughs?.find((t) => t.id === ch.walkthroughId);
			if (!tl) return `unknown walkthrough: ${ch.walkthroughId}`;
			if (
				!Number.isInteger(ch.stepIndex) ||
				ch.stepIndex < 0 ||
				ch.stepIndex >= tl.steps.length
			) {
				return `invalid stepIndex ${ch.stepIndex} for walkthrough ${ch.walkthroughId}`;
			}
			if (ch.field === "line") {
				if (
					typeof ch.value !== "number" ||
					!Number.isInteger(ch.value) ||
					ch.value < 1
				) {
					return "line value must be a positive integer";
				}
			} else if (ch.value !== null && typeof ch.value !== "string") {
				return `${ch.field} value must be a string or null`;
			}
		} else if (ch.target === "augmentation") {
			if (ch.field !== "construct" && ch.field !== "signature") {
				return `unsupported augmentation field: ${(ch as { field: string }).field}`;
			}
			if (ch.field === "construct") {
				if (typeof ch.value !== "string" || !ch.value.trim()) {
					return "augmentation construct value must be a non-empty string";
				}
			} else {
				const sig = ch.value;
				if (
					!sig ||
					typeof sig !== "object" ||
					!Array.isArray(sig.parameterTypes) ||
					!Array.isArray(sig.returnTypes)
				) {
					return "augmentation signature value must be { parameterTypes: string[], returnTypes: string[] }";
				}
				const params = sig.parameterTypes.filter(
					(t): t is string => typeof t === "string" && t.trim().length > 0,
				);
				const returns = sig.returnTypes.filter(
					(t): t is string => typeof t === "string" && t.trim().length > 0,
				);
				if (params.length === 0 && returns.length === 0) {
					return "augmentation signature must include at least one named type";
				}
			}
			if (!graph.components.some((c) => c.id === ch.componentId)) {
				return `unknown component: ${ch.componentId}`;
			}
			if (!resolveAugmentationTarget(graph, ch)) {
				return `augmentation for ${ch.componentId} needs file, symbol, and purl (on the change or component)`;
			}
		} else {
			return "invalid change target";
		}
	}
	return null;
}

function applyChangesToGraph(
	graph: StoredSubsystemModel,
	changes: SubsystemModelProposalChange[],
): Pick<StoredSubsystemModel, "components" | "walkthroughs"> | null {
	const graphChanges = changes.filter((ch) => ch.target !== "augmentation");
	if (graphChanges.length === 0) return null;

	const components = graph.components.map((c) => ({ ...c }));
	const walkthroughs = (graph.walkthroughs ?? []).map((t) => ({
		...t,
		steps: t.steps.map((s) => ({ ...s })),
	}));

	for (const ch of graphChanges) {
		if (ch.target === "component") {
			const idx = components.findIndex((c) => c.id === ch.componentId);
			if (idx < 0) continue;
			const next = { ...components[idx]! } as unknown as Record<string, unknown>;
			if (ch.value === null) delete next[ch.field];
			else next[ch.field] = ch.value;
			components[idx] = next as (typeof components)[number];
		} else if (ch.target === "walkthrough-step") {
			const tl = walkthroughs.find((t) => t.id === ch.walkthroughId);
			if (!tl) continue;
			const step = tl.steps[ch.stepIndex];
			if (!step) continue;
			const next = { ...step } as unknown as Record<string, unknown>;
			if (ch.value === null) delete next[ch.field];
			else next[ch.field] = ch.value;
			tl.steps[ch.stepIndex] = next as (typeof tl.steps)[number];
		}
	}

	return {
		components,
		walkthroughs: walkthroughs.length > 0 ? walkthroughs : graph.walkthroughs,
	};
}

async function applyAugmentationChanges(
	graph: StoredSubsystemModel,
	changes: SubsystemModelProposalChange[],
	proposal: SubsystemModelProposal,
): Promise<string | null> {
	for (const ch of changes) {
		if (ch.target !== "augmentation") continue;
		const resolved = resolveAugmentationTarget(graph, ch);
		if (!resolved) {
			return `augmentation for ${ch.componentId} needs file, symbol, and purl`;
		}
		if (ch.field === "construct") {
			const written = await upsertAcceptedConstructAugmentation({
				purl: resolved.purl,
				file: resolved.file,
				symbol: resolved.symbol,
				construct: ch.value,
				source: proposal.author?.trim() || "proposal",
				rationale: proposal.rationale,
				evidence: [
					`proposal ${proposal.id}`,
					`component ${ch.componentId}`,
				],
			});
			if (!written.ok) return written.error;
		} else if (ch.field === "signature") {
			const written = await upsertAcceptedSignatureAugmentation({
				purl: resolved.purl,
				file: resolved.file,
				symbol: resolved.symbol,
				signature: {
					parameterTypes: ch.value.parameterTypes,
					returnTypes: ch.value.returnTypes,
				},
				source: proposal.author?.trim() || "proposal",
				rationale: proposal.rationale,
				evidence: [
					`proposal ${proposal.id}`,
					`component ${ch.componentId}`,
				],
			});
			if (!written.ok) return written.error;
		} else {
			return `unsupported augmentation field: ${(ch as { field: string }).field}`;
		}
	}
	return null;
}

export async function listSubsystemModelProposals(
	graphId: string,
	opts?: { includeResolved?: boolean },
): Promise<SubsystemModelProposal[]> {
	const doc = await readFile(graphId);
	if (opts?.includeResolved) return doc.proposals;
	return doc.proposals.filter((p) => p.status === "pending");
}

export async function pendingProposalCount(graphId: string): Promise<number> {
	const pending = await listSubsystemModelProposals(graphId);
	return pending.length;
}

export async function createSubsystemModelProposal(input: {
	graphId: string;
	rationale: string;
	changes: SubsystemModelProposalChange[];
	finding?: SubsystemModelProposal["finding"];
	author?: string;
}): Promise<
	| { ok: true; proposal: SubsystemModelProposal }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(input.graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${input.graphId}` };
	if (typeof input.rationale !== "string" || !input.rationale.trim()) {
		return { ok: false, error: "rationale is required" };
	}
	const invalid = validateChanges(graph, input.changes);
	if (invalid) return { ok: false, error: invalid };

	const proposal: SubsystemModelProposal = {
		id: newProposalId(),
		graphId: input.graphId,
		status: "pending",
		createdAt: new Date().toISOString(),
		rationale: input.rationale.trim(),
		finding: input.finding,
		changes: input.changes,
		preview: buildPreview(graph, input.changes),
		author: input.author,
	};

	const doc = await readFile(input.graphId);
	doc.proposals.unshift(proposal);
	await writeFile(doc);
	return { ok: true, proposal };
}

export async function acceptSubsystemModelProposal(
	graphId: string,
	proposalId: string,
): Promise<
	| { ok: true; proposal: SubsystemModelProposal }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	const doc = await readFile(graphId);
	const idx = doc.proposals.findIndex((p) => p.id === proposalId);
	if (idx < 0) return { ok: false, error: `unknown proposal: ${proposalId}` };
	const proposal = doc.proposals[idx]!;
	if (proposal.status !== "pending") {
		return { ok: false, error: `proposal is already ${proposal.status}` };
	}

	const invalid = validateChanges(graph, proposal.changes);
	if (invalid) return { ok: false, error: invalid };

	const patch = applyChangesToGraph(graph, proposal.changes);
	if (patch) {
		const updated = await updateSubsystemModel(graphId, patch);
		if (!updated) return { ok: false, error: `failed to update graph: ${graphId}` };
	}

	const augErr = await applyAugmentationChanges(graph, proposal.changes, proposal);
	if (augErr) return { ok: false, error: augErr };

	const resolved: SubsystemModelProposal = {
		...proposal,
		status: "accepted",
		resolvedAt: new Date().toISOString(),
	};
	doc.proposals[idx] = resolved;
	await writeFile(doc);
	return { ok: true, proposal: resolved };
}

export async function rejectSubsystemModelProposal(
	graphId: string,
	proposalId: string,
): Promise<
	| { ok: true; proposal: SubsystemModelProposal }
	| { ok: false; error: string }
> {
	const doc = await readFile(graphId);
	const idx = doc.proposals.findIndex((p) => p.id === proposalId);
	if (idx < 0) return { ok: false, error: `unknown proposal: ${proposalId}` };
	const proposal = doc.proposals[idx]!;
	if (proposal.status !== "pending") {
		return { ok: false, error: `proposal is already ${proposal.status}` };
	}
	const resolved: SubsystemModelProposal = {
		...proposal,
		status: "rejected",
		resolvedAt: new Date().toISOString(),
	};
	doc.proposals[idx] = resolved;
	await writeFile(doc);
	return { ok: true, proposal: resolved };
}

export async function deleteSubsystemModelProposals(
	graphId: string,
): Promise<void> {
	try {
		await fs.unlink(proposalPath(graphId));
	} catch {
		/* absent is fine */
	}
}
