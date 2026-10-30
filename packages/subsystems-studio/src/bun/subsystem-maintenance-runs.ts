/**
 * Durable parent attempts, separate from the existing per-agent run log.
 * Atomic, serialized writes retain full stage history even after that log's
 * 50-row retention expires. Terminal outcomes may carry a bounded delivery
 * checkpoint, committed atomically with the outcome. No OpenBot state lives here.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	assertOutcomeDelivery, createOutcomeDelivery, deliveryStatus,
	DELIVERY_BACKOFF_MS, DELIVERY_MAX_ATTEMPTS, DELIVERY_TIMEOUT_MS,
	type DeliveryFailure, type OutcomeDelivery,
} from "./maintenance-outcome-delivery";
import type {
	SubsystemMaintenanceCounts,
	SubsystemMaintenanceOutcome,
	SubsystemMaintenanceSnapshot,
	SubsystemMaintenanceStage,
} from "../shared/contract";

type SavedSnapshot = Omit<SubsystemMaintenanceSnapshot, "observedAt">;
interface Entry {
	owner: string;
	pid: number;
	snapshot: SavedSnapshot;
	delivery?: OutcomeDelivery;
}
interface RunsFile {
	version: 1;
	graphId: string;
	runs: Entry[];
}

const hostOwner = randomUUID();
const writes = new Map<string, Promise<unknown>>();
const MAX_ATTEMPTS = 20;

function validCounts(value: SubsystemMaintenanceCounts | undefined): boolean {
	return !!value && ["proposalsCreated", "proposalsApplied", "proposalsPending"].every((key) => {
		const count = value[key as keyof SubsystemMaintenanceCounts];
		return count === null || (Number.isSafeInteger(count) && count >= 0);
	});
}

function validCommits(value: unknown): boolean {
	return value === null || (
		typeof value === "object" && !Array.isArray(value) &&
		Object.values(value).every((sha) => typeof sha === "string" && sha.length > 0)
	);
}

export function unreportedProposalCounts(): SubsystemMaintenanceCounts {
	return {
		proposalsCreated: null,
		proposalsApplied: null,
		proposalsPending: null,
	};
}

function totalCounts(stages: SubsystemMaintenanceStage[]): SavedSnapshot["counts"] {
	const sum = (key: keyof SubsystemMaintenanceCounts): number | null =>
		stages.some((stage) => stage.counts[key] === null)
			? null
			: stages.reduce((total, stage) => total + (stage.counts[key] ?? 0), 0);
	return {
		proposalsCreated: sum("proposalsCreated"),
		proposalsApplied: sum("proposalsApplied"),
		proposalsPending: sum("proposalsPending"),
		stagesFinished: stages.filter((stage) => stage.status !== "running").length,
	};
}

/** A malformed existing file is an error, never an empty/successful history. */
function assertFile(value: RunsFile, graphId: string): void {
	if (value?.version !== 1 || value.graphId !== graphId || !Array.isArray(value.runs)) {
		throw new Error("Invalid maintenance run store");
	}
	const parents = new Set<string>();
	for (const entry of value.runs) {
		const s = entry?.snapshot;
		const sequence = s?.sequence;
		if (
			typeof entry?.owner !== "string" ||
			!Number.isSafeInteger(entry.pid) || entry.pid < 1 ||
			s?.schemaVersion !== 1 ||
			s.model?.id !== graphId ||
			typeof s.model.title !== "string" ||
			typeof sequence?.id !== "string" || !sequence.id || parents.has(sequence.id) ||
			!Number.isFinite(Date.parse(sequence.startedAt)) ||
			!Number.isInteger(s.revision) || s.revision < 1 ||
			!Number.isFinite(Date.parse(s.updatedAt)) ||
			!Array.isArray(s.stages) ||
			!["running", "unknown", "finished"].includes(sequence.status) ||
			!validCounts(s.counts) ||
			!Number.isSafeInteger(s.counts.stagesFinished) || s.counts.stagesFinished < 0 ||
			!validCommits(s.commitsAtStart) || !validCommits(s.verifiedAtCommits) ||
			(s.summary !== null && typeof s.summary !== "string") ||
			(s.blocker !== null && typeof s.blocker !== "string")
		) throw new Error("Invalid maintenance run record");
		parents.add(sequence.id);
		if (entry.delivery !== undefined) assertOutcomeDelivery(entry.delivery, s);
		if (s.verification !== null && (
			!s.verification ||
			!Number.isFinite(Date.parse(s.verification.checkedAt)) ||
			typeof s.verification.stale !== "boolean" ||
			!["construct", "static-topology", "dynamic-topology", "trail"].every((lane) =>
				["verified", "partial", "issues", "blocked", "none"].includes(
					s.verification?.lanes?.[lane as keyof NonNullable<SavedSnapshot["verification"]>["lanes"]] ?? "",
				),
			)
		)) throw new Error("Invalid maintenance audit evidence");
		if (sequence.status === "finished") {
			if (
				!["converged", "needs_unblock", "stalled", "cap", "error"].includes(sequence.outcome) ||
				!Number.isFinite(Date.parse(sequence.endedAt))
			) throw new Error("Invalid terminal maintenance outcome");
		} else if (sequence.outcome !== null || sequence.endedAt !== null) {
			throw new Error("Nonterminal maintenance run has a terminal outcome");
		}
		const ids = new Set<string>();
		for (const stage of s.stages) {
			if (
				typeof stage.runId !== "string" || !stage.runId || ids.has(stage.runId) ||
				typeof stage.agent !== "string" ||
				(stage.sessionId !== null && typeof stage.sessionId !== "string") ||
				!validCommits(stage.commitsAtStart) ||
				!["construct", "static-topology", "dynamic-topology", "trail"].includes(stage.layer) ||
				!Number.isFinite(Date.parse(stage.startedAt)) ||
				!["running", "done", "error", "skipped"].includes(stage.status) ||
				(stage.status === "running"
					? stage.endedAt !== null
					: !stage.endedAt || !Number.isFinite(Date.parse(stage.endedAt))) ||
				!validCounts(stage.counts)
			) throw new Error("Invalid maintenance agent history");
			ids.add(stage.runId);
		}
	}
}

export function createMaintenanceRunStore(opts: {
	root?: string;
	owner?: string;
	now?: () => string;
	id?: () => string;
	delivery?: (snapshot: SavedSnapshot) => OutcomeDelivery | undefined;
} = {}) {
	const owner = opts.owner ?? hostOwner;
	const now = opts.now ?? (() => new Date().toISOString());
	const id = opts.id ?? randomUUID;
	const deliveryListeners = new Set<() => void>();
	const root = () => opts.root ?? join(
		process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"]?.trim() || homedir(),
		".principal", "subsystem-maintenance-runs",
	);
	const path = (graphId: string) => join(root(), `${encodeURIComponent(graphId)}.json`);

	async function load(graphId: string): Promise<RunsFile> {
		try {
			const value = JSON.parse(await fs.readFile(path(graphId), "utf8")) as RunsFile;
			assertFile(value, graphId);
			return value;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return { version: 1, graphId, runs: [] };
			}
			throw error;
		}
	}

	async function save(file: RunsFile): Promise<void> {
		assertFile(file, file.graphId);
		await fs.mkdir(root(), { recursive: true });
		const target = path(file.graphId);
		const tmp = `${target}.${randomUUID()}.tmp`;
		try {
			await fs.writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
			await fs.rename(tmp, target);
		} catch (error) {
			await fs.unlink(tmp).catch(() => {});
			throw error;
		}
	}

	function serial<T>(graphId: string, work: () => Promise<T>): Promise<T> {
		const key = path(graphId);
		const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
		writes.set(key, pending);
		void pending.finally(() => {
			if (writes.get(key) === pending) writes.delete(key);
		}).catch(() => {});
		return pending;
	}

	const observed = (s: SavedSnapshot): SubsystemMaintenanceSnapshot =>
		({ ...structuredClone(s), observedAt: now() });

	function otherOwnerAlive(entry: Entry): boolean {
		if (entry.owner === owner || entry.pid === process.pid) return false;
		try {
			process.kill(entry.pid, 0);
			return true;
		} catch (error) {
			return (error as NodeJS.ErrnoException).code !== "ESRCH";
		}
	}

	function recover(entry: Entry, active?: boolean): boolean {
		const s = entry.snapshot;
		if (s.sequence.status !== "running") return false;
		if (entry.owner === owner && active !== false) return false;
		// Another live Studio process may still own the attempt. A different
		// token at our own pid means the pid was reused (or a simulated restart).
		if (otherOwnerAlive(entry)) return false;
		s.sequence = { ...s.sequence, status: "unknown", outcome: null, endedAt: null };
		s.blocker = entry.owner === owner
			? "Studio no longer tracks this maintenance sequence; the outcome is unknown. Agent sessions may still exist."
			: "Studio restarted; the maintenance outcome is unknown. Agent sessions may still exist.";
		s.revision++;
		s.updatedAt = now();
		return true;
	}

	async function mutate(
		graphId: string,
		runId: string,
		update: (s: SavedSnapshot) => void,
		latestOnly = false,
		expectedRevision?: number,
	): Promise<SubsystemMaintenanceSnapshot | null> {
		return serial(graphId, async () => {
			const file = await load(graphId);
			const entry = latestOnly
				? file.runs[0]
				: file.runs.find((r) => r.snapshot.sequence.id === runId);
			if (!entry || entry.snapshot.sequence.id !== runId) {
				if (latestOnly) return null;
				throw new Error("Unknown maintenance run");
			}
			if (expectedRevision !== undefined && entry.snapshot.revision !== expectedRevision) return null;
			const recovered = recover(entry);
			if (otherOwnerAlive(entry)) {
				throw new Error("Maintenance run is owned by another Studio host");
			}
			const before = JSON.stringify(entry.snapshot);
			const wasFinished = entry.snapshot.sequence.status === "finished";
			update(entry.snapshot);
			if (before !== JSON.stringify(entry.snapshot)) {
				entry.snapshot.revision++;
				entry.snapshot.updatedAt = now();
				let deliveryCreated = false;
				if (!wasFinished && entry.snapshot.sequence.status === "finished" && !entry.delivery) {
					entry.delivery = opts.delivery?.(structuredClone(entry.snapshot));
					if (entry.delivery) {
						if (entry.delivery.status === "pending" && file.runs.filter((r) => r !== entry && r.delivery?.status === "pending").length >= MAX_ATTEMPTS) {
							entry.delivery.status = "failed";
							entry.delivery.nextAttemptAt = null;
							entry.delivery.failure = "backlog_full";
						}
						deliveryCreated = true;
					}
				}
				await save(file);
				if (deliveryCreated) for (const listener of deliveryListeners) {
					try { listener(); } catch { /* Notification cannot undo a committed outcome. */ }
				}
			} else if (recovered) {
				await save(file);
			}
			return observed(entry.snapshot);
		});
	}

	return {
		async start(input: { graphId: string; title: string }): Promise<SubsystemMaintenanceSnapshot> {
			return serial(input.graphId, async () => {
				const file = await load(input.graphId);
				const previous = file.runs[0];
				if (previous) {
					recover(previous);
					if (previous.snapshot.sequence.status === "running") {
						throw new Error("Maintenance is already running for this model");
					}
				}
				const timestamp = now();
				const snapshot: SavedSnapshot = {
					schemaVersion: 1,
					model: { id: input.graphId, title: input.title },
					sequence: { id: id(), startedAt: timestamp, status: "running", outcome: null, endedAt: null },
					revision: 1,
					updatedAt: timestamp,
					stages: [],
					counts: { ...unreportedProposalCounts(), stagesFinished: 0 },
					commitsAtStart: null,
					verifiedAtCommits: null,
					verification: null,
					summary: null,
					blocker: null,
				};
				file.runs.unshift({ owner, pid: process.pid, snapshot });
				// Never evict pending deliveries. Keep at most 20 pending + 20
				// recent other records; additional outcomes fail visibly, not silently.
				let recent = 0;
				file.runs = file.runs.filter((entry) => entry.delivery?.status === "pending" || recent++ < MAX_ATTEMPTS);
				await save(file);
				return observed(snapshot);
			});
		},
		async latest(graphId: string, input?: { active?: boolean }): Promise<SubsystemMaintenanceSnapshot | null> {
			return serial(graphId, async () => {
				const file = await load(graphId);
				const entry = file.runs[0];
				if (!entry) return null;
				if (recover(entry, input?.active)) await save(file);
				return observed(entry.snapshot);
			});
		},
		onDeliveryReady(listener: () => void) {
			deliveryListeners.add(listener);
			return () => { deliveryListeners.delete(listener); };
		},
		async deliveryStatus(graphId: string) {
			return serial(graphId, async () => {
				const file = await load(graphId);
				return {
					latest: file.runs[0]?.delivery ? deliveryStatus(file.runs[0].delivery) : null,
					pending: file.runs.filter((r) => r.delivery?.status === "pending").length,
					failed: file.runs.filter((r) => r.delivery?.status === "failed").length,
				};
			});
		},
		async pendingDeliveries() {
			let names: string[];
			try { names = await fs.readdir(root()); } catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
				throw error;
			}
			const results: Array<{ graphId: string; runId: string; delivery: OutcomeDelivery }> = [];
			let corrupt = false;
			for (const name of names.filter((n) => n.endsWith(".json"))) {
				try {
					const graphId = decodeURIComponent(name.slice(0, -5));
					const file = await load(graphId);
					for (const entry of file.runs) if (entry.delivery?.status === "pending") {
						results.push({ graphId, runId: entry.snapshot.sequence.id, delivery: structuredClone(entry.delivery) });
					}
				} catch { corrupt = true; }
			}
			// Still process healthy files. A bad file must not starve other models.
			if (corrupt) console.warn("[principal-studio] A maintenance delivery checkpoint could not be read.");
			return results.sort((a, b) => Date.parse(a.delivery.nextAttemptAt!) - Date.parse(b.delivery.nextAttemptAt!));
		},
		async reserveDelivery(graphId: string, runId: string, attempts: number, timestamp: number) {
			return serial(graphId, async () => {
				const file = await load(graphId);
				const entry = file.runs.find((r) => r.snapshot.sequence.id === runId);
				const d = entry?.delivery;
				if (!entry || !d || otherOwnerAlive(entry) || d.status !== "pending" ||
					d.attempts !== attempts || Date.parse(d.nextAttemptAt!) > timestamp) return null;
				if (d.attempts >= DELIVERY_MAX_ATTEMPTS) {
					d.status = "failed"; d.failure = "attempts_exhausted"; d.nextAttemptAt = null;
					await save(file);
					return null;
				}
				d.attempts++;
				d.lastAttemptAt = new Date(timestamp).toISOString();
				// Durable crash window: do not immediately resend an ambiguous attempt.
				d.nextAttemptAt = new Date(timestamp + DELIVERY_TIMEOUT_MS + (DELIVERY_BACKOFF_MS[d.attempts - 1] ?? 0)).toISOString();
				entry.owner = owner; entry.pid = process.pid;
				await save(file);
				return structuredClone(d);
			});
		},
		async completeDelivery(graphId: string, runId: string, attempts: number, result: {
			receipt?: OutcomeDelivery["receipt"]; failure?: DeliveryFailure; httpStatus?: number;
		}, timestamp: number) {
			return serial(graphId, async () => {
				const file = await load(graphId);
				const entry = file.runs.find((r) => r.snapshot.sequence.id === runId);
				const d = entry?.delivery;
				if (!entry || !d || entry.owner !== owner || d.status !== "pending" || d.attempts !== attempts) return;
				d.httpStatus = result.httpStatus ?? null;
				d.receipt = result.receipt ?? null;
				d.failure = result.failure ?? null;
				if (d.receipt) { d.status = d.receipt === "filtered" ? "ignored" : "delivered"; d.nextAttemptAt = null; }
				else {
					const retryable = ["network", "http_retryable", "invalid_receipt"].includes(d.failure ?? "");
					d.status = retryable && attempts < DELIVERY_MAX_ATTEMPTS ? "pending" : "failed";
					d.nextAttemptAt = d.status === "pending"
						? new Date(timestamp + DELIVERY_BACKOFF_MS[attempts - 1]!).toISOString() : null;
				}
				await save(file);
			});
		},
		async context(graphId: string, runId: string, input: {
			title: string;
			commitsAtStart: SavedSnapshot["commitsAtStart"];
		}) {
			return mutate(graphId, runId, (s) => {
				if (s.sequence.status !== "running") throw new Error("Maintenance run is not active");
				s.model.title = input.title;
				s.commitsAtStart = input.commitsAtStart;
			});
		},
		async stage(graphId: string, runId: string, stage: SubsystemMaintenanceStage) {
			return mutate(graphId, runId, (s) => {
				if (s.sequence.status !== "running") throw new Error("Maintenance run is not active");
				const index = s.stages.findIndex((r) => r.runId === stage.runId);
				if (index < 0) s.stages.push(structuredClone(stage));
				else {
					if (s.stages[index]!.status !== "running" && stage.status === "running") {
						throw new Error("Cannot restart a completed agent run");
					}
					s.stages[index] = { ...structuredClone(stage), counts: s.stages[index]!.counts };
				}
				s.counts = totalCounts(s.stages);
			});
		},
		async evidence(graphId: string, runId: string, input: {
			counts: Record<string, SubsystemMaintenanceCounts> | null;
			verification: SavedSnapshot["verification"];
			verifiedAtCommits: SavedSnapshot["verifiedAtCommits"];
			expectedRevision?: number;
		}) {
			return mutate(graphId, runId, (s) => {
				for (const stage of s.stages) {
					stage.counts = structuredClone(input.counts?.[stage.runId] ?? unreportedProposalCounts());
				}
				s.counts = totalCounts(s.stages);
				s.verification = structuredClone(input.verification);
				s.verifiedAtCommits = structuredClone(input.verifiedAtCommits);
			}, true, input.expectedRevision);
		},
		async finish(graphId: string, runId: string, input: {
			outcome: SubsystemMaintenanceOutcome;
			summary?: string | null;
			blocker?: string | null;
		}) {
			return mutate(graphId, runId, (s) => {
				if (s.sequence.status === "finished") {
					if (s.sequence.outcome !== input.outcome) throw new Error("Maintenance outcome is already recorded");
					return;
				}
				if (s.sequence.status !== "running") throw new Error("Cannot finish an interrupted maintenance run");
				if (input.outcome !== "error" && s.stages.some((stage) => stage.status === "running")) {
					throw new Error("Cannot finish maintenance while an agent run is still active");
				}
				s.sequence = { ...s.sequence, status: "finished", outcome: input.outcome, endedAt: now() };
				s.summary = input.summary ?? null;
				s.blocker = input.blocker ?? null;
			});
		},
	};
}

export type MaintenanceRunStore = ReturnType<typeof createMaintenanceRunStore>;
export const maintenanceRuns = createMaintenanceRunStore({ delivery: (snapshot) => createOutcomeDelivery(snapshot) });

export interface MaintenanceRecorder {
	id: string;
	context: (input: {
		title: string;
		commitsAtStart: SubsystemMaintenanceSnapshot["commitsAtStart"];
	}) => Promise<unknown>;
	stage: (stage: SubsystemMaintenanceStage) => Promise<unknown>;
}

/** Shared by the real runner and isolated orchestration tests; no LLM polling. */
export async function recordMaintenanceSequence<T extends {
	outcome: SubsystemMaintenanceOutcome;
	error?: string;
	stages: Array<{ summary?: string }>;
	blockedAt?: { agent: string };
}>(input: {
	graphId: string;
	runId?: string;
	store?: MaintenanceRunStore;
	execute: (recorder: MaintenanceRecorder) => Promise<T>;
	refresh?: () => Promise<unknown>;
}): Promise<T & { maintenanceRunId: string }> {
	const store = input.store ?? maintenanceRuns;
	const initial = input.runId
		? await store.latest(input.graphId)
		: await store.start({ graphId: input.graphId, title: input.graphId });
	if (!initial || (input.runId && initial.sequence.id !== input.runId) || initial.sequence.status !== "running") {
		throw new Error("Maintenance run is not active");
	}
	const runId = initial.sequence.id;
	try {
		const result = await input.execute({
			id: runId,
			context: (context) => store.context(input.graphId, runId, context),
			stage: (stage) => store.stage(input.graphId, runId, stage),
		});
		await input.refresh?.();
		await store.finish(input.graphId, runId, {
			outcome: result.outcome,
			summary: result.error ?? result.stages.at(-1)?.summary ?? null,
			blocker: result.blockedAt ? `Maintenance stopped at ${result.blockedAt.agent}: ${result.outcome}` : null,
		});
		return { ...result, maintenanceRunId: runId };
	} catch (error) {
		await store.finish(input.graphId, runId, {
			outcome: "error",
			summary: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
