/**
 * Boundary (process / module) audit helpers — membership for frames.
 * Mechanical checks only; no Graphify.
 *
 * Soft rule: module≠file and process-nest disagreement are gaps (never hard
 * fails). Module without a file anchor on a grounded component is an issue.
 */

import type { SubsystemComponent } from "@principal-ai/subsystems-core";
import { getSubsystemProcessRegions } from "@principal-ai/subsystems-core";
import { purlRepoKey, verifyProcessBoundaries } from "@principal-ai/subsystems-react";
import type { C4Element } from "@principal-ai/subsystems-react";

export type BoundaryCheckKind =
	| "module_file"
	| "process_nest"
	| "process_claim"
	| "process_container"
	| "skipped";

export type BoundaryCheckVerdict = "ok" | "issue" | "gap" | "skipped";

export interface BoundaryComponentCheck {
	componentAlias: string;
	componentName?: string;
	kind: BoundaryCheckKind;
	module?: string;
	file?: string;
	process?: string;
	verdict: BoundaryCheckVerdict;
	note?: string;
}

export interface BoundaryAuditFinding {
	kind:
		| "boundary_module_file_mismatch"
		| "boundary_process_nest_disagree"
		| "boundary_process_missing"
		| "boundary_process_unassigned"
		| "boundary_process_proposed"
		| "boundary_process_rejected"
		| "boundary_process_unbacked";
	severity: "error" | "info";
	componentAlias?: string;
	componentName?: string;
	/** Module key when the finding is about a multi-member module group. */
	moduleKey?: string;
	/** Process key when the finding is about a process boundary as a whole. */
	processKey?: string;
	message: string;
}

export interface BoundaryAuditResult {
	checks: BoundaryComponentCheck[];
	findings: BoundaryAuditFinding[];
	summary: {
		/** Components with a non-empty module claim. */
		modulesClaimed: number;
		moduleFileOk: number;
		moduleFileMismatch: number;
		/** Multi-member module groups inspected for process nest. */
		processNestsChecked: number;
		processNestOk: number;
		processNestDisagree: number;
		/** Runtime-executing components that must state a deployment unit. */
		processRequired: number;
		processClaimed: number;
		processMissing: number;
	};
}

/** Normalize path-ish strings for module/file comparison. */
export function normalizeBoundaryPath(p: string): string {
	return p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * True when `module` is the file itself or a directory prefix of it
 * (sensible parent path for a frame).
 */
export function moduleAgreesWithFile(module: string, file: string): boolean {
	const m = normalizeBoundaryPath(module);
	const f = normalizeBoundaryPath(file);
	if (!m || !f) return false;
	if (m === f) return true;
	const prefix = m.endsWith("/") ? m : `${m}/`;
	return f.startsWith(prefix);
}

function isUngrounded(c: SubsystemComponent): boolean {
	return c.construct === "external" || c.proposed === true;
}

/**
 * Constructs that must state a deployment unit (`process`).
 *
 * Required — runtime-executing declarations. A reader needs `process` to know
 * where the code actually runs:
 *   function, class, custom_entity
 *
 * Allowed but not required — type-only declarations are erased at compile
 * time, and a shared type is often legitimately reachable from several
 * processes at once, so pinning it to one would be wrong:
 *   interface, type_alias
 *
 * Not enforced — we do not yet have enough information for these to be useful.
 * `external` is third-party (no owner in this repo); `store` is a state
 * container rather than a deployment unit:
 *   external, store
 *
 * Enumerated rather than inferred so a future construct under-enforces (grey /
 * no finding) instead of over-enforcing against something that legitimately
 * cannot have a process.
 */
const PROCESS_REQUIRED_CONSTRUCTS: ReadonlySet<string> = new Set([
	"function",
	"class",
	"custom_entity",
]);

/** True when this component must carry a `process` claim. */
export function requiresProcess(c: SubsystemComponent): boolean {
	if (isUngrounded(c)) return false;
	return PROCESS_REQUIRED_CONSTRUCTS.has(c.construct ?? "");
}

/**
 * Audit process/module membership fields on components.
 *
 * `augmentedModuleAliases` — component aliases with an accepted
 * module-boundary augmentation confirming an intentional module≠file
 * grouping.
 */
export function auditBoundaryFields(
	components: readonly SubsystemComponent[],
	opts?: { augmentedModuleAliases?: ReadonlySet<string> },
): BoundaryAuditResult {
	const checks: BoundaryComponentCheck[] = [];
	const findings: BoundaryAuditFinding[] = [];
	const augmented = opts?.augmentedModuleAliases;

	let modulesClaimed = 0;
	let moduleFileOk = 0;
	let moduleFileMismatch = 0;
	let processNestsChecked = 0;
	let processNestOk = 0;
	let processNestDisagree = 0;
	let processRequired = 0;
	let processClaimed = 0;
	let processMissing = 0;

	const byModule = new Map<string, SubsystemComponent[]>();

	for (const c of components) {
		const moduleRaw = c.module?.trim() ?? "";
		const fileRaw = c.file?.trim() ?? "";
		const processRaw = c.process?.trim() ?? "";

		/*
		 * Dynamic topology, independent of module. A runtime-executing
		 * component must name its deployment unit whether or not it sits in a
		 * module group — otherwise "process present and nothing wrong" and
		 * "no process information at all" both produce zero checks, and the
		 * lane cannot tell them apart. Types are exempt (erased at compile
		 * time, often shared across processes) but may still claim one.
		 */
		if (requiresProcess(c)) {
			processRequired++;
			if (processRaw) {
				processClaimed++;
				checks.push({
					componentAlias: c.alias,
					componentName: c.name,
					kind: "process_claim",
					process: processRaw,
					verdict: "ok",
					note: `process claimed (${processRaw})`,
				});
			} else {
				processMissing++;
				const note = `${c.construct ?? "component"} claims no process — no deployment unit stated`;
				checks.push({
					componentAlias: c.alias,
					componentName: c.name,
					kind: "process_claim",
					verdict: "gap",
					note,
				});
				findings.push({
					kind: "boundary_process_missing",
					severity: "info",
					componentAlias: c.alias,
					componentName: c.name,
					message: note,
				});
			}
		}

		if (!moduleRaw) continue;

		modulesClaimed++;
		const modNorm = normalizeBoundaryPath(moduleRaw);
		const members = byModule.get(modNorm) ?? [];
		members.push(c);
		byModule.set(modNorm, members);

		if (!fileRaw) {
			// A grounded component with a module but no file is rejected at
			// input (findModuleFileProblems). Externals/proposed carry no file
			// by design, so they are skipped rather than flagged.
			if (isUngrounded(c)) {
				checks.push({
					componentAlias: c.alias,
					componentName: c.name,
					kind: "module_file",
					module: moduleRaw,
					file: "",
					process: processRaw || undefined,
					verdict: "skipped",
					note: "module on external/proposed — no file required",
				});
			}
			continue;
		}

		if (moduleAgreesWithFile(moduleRaw, fileRaw)) {
			moduleFileOk++;
			checks.push({
				componentAlias: c.alias,
				componentName: c.name,
				kind: "module_file",
				module: moduleRaw,
				file: fileRaw,
				process: processRaw || undefined,
				verdict: "ok",
				note: "module matches file (or is a path prefix)",
			});
			continue;
		}

		if (augmented?.has(c.alias)) {
			moduleFileOk++;
			checks.push({
				componentAlias: c.alias,
				componentName: c.name,
				kind: "module_file",
				module: moduleRaw,
				file: fileRaw,
				process: processRaw || undefined,
				verdict: "ok",
				note: "module≠file confirmed (augmented)",
			});
			continue;
		}

		moduleFileMismatch++;
		const note = `module ${JSON.stringify(moduleRaw)} does not match file ${JSON.stringify(fileRaw)} (and is not a path prefix)`;
		checks.push({
			componentAlias: c.alias,
			componentName: c.name,
			kind: "module_file",
			module: moduleRaw,
			file: fileRaw,
			process: processRaw || undefined,
			verdict: "gap",
			note,
		});
		findings.push({
			kind: "boundary_module_file_mismatch",
			severity: "info",
			componentAlias: c.alias,
			componentName: c.name,
			moduleKey: modNorm,
			message: note,
		});
	}

	for (const [moduleKey, members] of byModule) {
		if (members.length < 2) continue;
		processNestsChecked++;
		const processes = new Set<string>();
		for (const m of members) {
			const p = m.process?.trim();
			if (p) processes.add(p);
		}
		// Empty process on some members is fine for nest; disagreement is
		// two+ distinct non-empty process values among members.
		if (processes.size <= 1) {
			processNestOk++;
			for (const m of members) {
				checks.push({
					componentAlias: m.alias,
					componentName: m.name,
					kind: "process_nest",
					module: moduleKey,
					process: m.process?.trim() || undefined,
					verdict: "ok",
					note:
						processes.size === 1
							? `module nest agrees under process ${JSON.stringify([...processes][0])}`
							: "multi-member module with no process claims — nest n/a",
				});
			}
			continue;
		}

		processNestDisagree++;
		const list = [...processes].sort().map((p) => JSON.stringify(p)).join(", ");
		const note = `module ${JSON.stringify(moduleKey)} members claim different processes: ${list}`;
		for (const m of members) {
			checks.push({
				componentAlias: m.alias,
				componentName: m.name,
				kind: "process_nest",
				module: moduleKey,
				process: m.process?.trim() || undefined,
				verdict: "gap",
				note,
			});
			findings.push({
				kind: "boundary_process_nest_disagree",
				severity: "info",
				componentAlias: m.alias,
				componentName: m.name,
				moduleKey,
				message: note,
			});
		}
	}

	return {
		checks,
		findings,
		summary: {
			modulesClaimed,
			moduleFileOk,
			moduleFileMismatch,
			processNestsChecked,
			processNestOk,
			processNestDisagree,
			processRequired,
			processClaimed,
			processMissing,
		},
	};
}

/**
 * Which runtime components have NO verified key to assign a process from —
 * a required process claim whose repo's element set holds no accepted
 * container. These are the gaps that must STAY open under the container-first
 * rule: runtime-topology-verifier proposes only verified keys, so an unbacked
 * gap routes to the container-verifier (propose the container, human accepts)
 * instead of an agent coining a deployment-unit key from nothing.
 *
 * `sets` maps a component's repo key (`purlRepoKey`) to that repo's element
 * set. Pure over its inputs.
 */
export function auditProcessBacking(
	components: readonly SubsystemComponent[],
	sets: ReadonlyMap<string, readonly C4Element[]>,
): BoundaryAuditFinding[] {
	const findings: BoundaryAuditFinding[] = [];
	for (const c of components) {
		if (!requiresProcess(c)) continue;
		if (c.process?.trim()) continue;
		const repoKey = purlRepoKey(c.purl);
		const set = repoKey ? sets.get(repoKey) : undefined;
		const hasBackableKey = (set ?? []).some(
			(e) => e.kind === "container" && e.state === "accepted" && e.process?.trim(),
		);
		if (hasBackableKey) continue;
		findings.push({
			kind: "boundary_process_unbacked",
			severity: "info",
			componentAlias: c.alias,
			componentName: c.name,
			message: `${c.construct ?? "component"} ${JSON.stringify(c.alias)} claims no process and no accepted container exists to assign it from — accept a container for this boundary first (container-verifier).`,
		});
	}
	return findings;
}

/**
 * One finding per claim-less component. The verification pass reports every
 * claim-less runtime component as `boundary_process_missing`; the backing pass
 * reports the subset with no accepted container as `boundary_process_unbacked`.
 * Emitting both repeats one gap with two stories, and the missing story
 * ("propose a process claim") is one container-first rules forbid the
 * maintainer from taking yet. This drops the missing finding for any component
 * the backing pass already named as unbacked — missing survives only for
 * backed gaps, where the claim-writer CAN act.
 *
 * Pure over its inputs; returns a new array. Works on the report-level finding
 * shape (a superset of the boundary finding's routing fields).
 */
export function dropUnbackedMissing<F extends { kind: string; componentAlias?: string | null }>(
	findings: readonly F[],
): F[] {
	const unbackedAliases = new Set(
		findings
			.filter((f) => f.kind === "boundary_process_unbacked" && f.componentAlias != null)
			.map((f) => f.componentAlias as string),
	);
	if (unbackedAliases.size === 0) return [...findings];
	return findings.filter(
		(f) =>
			!(
				f.kind === "boundary_process_missing" &&
				f.componentAlias != null &&
				unbackedAliases.has(f.componentAlias)
			),
	);
}

/**
 * Process-boundary verification against the C4 element store — the same read
 * the renderer's issues list does (`verifyProcessBoundaries` over the process
 * rollup), so the audit and the UI speak one vocabulary:
 * `boundary_process_unassigned` / `_proposed` / `_rejected`, one finding per
 * boundary that is NOT verified. `verified` reports nothing — the audit
 * reports absence only, and silence is the good state.
 *
 * Each finding carries a backing `process_container` check per member alias
 * (verdict `gap` when unverified), so the lane tallies — which drive the
 * dynamic-topology icon — see the same state the issues list shows. Without
 * the checks, a model whose process claims are internally consistent tallies
 * green while the boundary has no container at all.
 *
 * Pure over its inputs; the caller reads the element set(s) from disk.
 */
export function auditProcessVerification(
	components: readonly SubsystemComponent[],
	elements: readonly C4Element[],
): { checks: BoundaryComponentCheck[]; findings: BoundaryAuditFinding[] } {
	const rollup = getSubsystemProcessRegions({ components });
	const statuses = verifyProcessBoundaries({ rollup, elements });
	const nameByAlias = new Map(components.map((c) => [c.alias, c.name]));
	const checks: BoundaryComponentCheck[] = [];
	const findings: BoundaryAuditFinding[] = [];
	for (const { key, status, memberAliases, element } of statuses) {
		const verified = status === "verified";
		for (const alias of memberAliases) {
			checks.push({
				componentAlias: alias,
				componentName: nameByAlias.get(alias),
				kind: "process_container",
				process: key,
				verdict: verified ? "ok" : "gap",
				note: verified
					? `boundary ${JSON.stringify(key)} verified by container ${JSON.stringify(element?.label ?? element?.id ?? key)}`
					: `boundary ${JSON.stringify(key)} has no accepted container (${status})`,
			});
		}
		if (verified) continue;
		const label = element?.label ?? key;
		findings.push({
			kind: `boundary_process_${status}`,
			severity: "info",
			processKey: key,
			message:
				status === "unassigned"
					? `No C4 container claims the process boundary ${JSON.stringify(key)} yet — a container-verifier run would assess it.`
					: status === "proposed"
						? `Container ${JSON.stringify(label)} claims the process boundary ${JSON.stringify(key)} and awaits a decision.`
						: `Container ${JSON.stringify(label)} was rejected for the process boundary ${JSON.stringify(key)} — it stays unclaimed until a container is accepted.`,
		});
	}
	return { checks, findings };
}
