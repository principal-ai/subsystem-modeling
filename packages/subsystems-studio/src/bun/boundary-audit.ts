/**
 * Boundary (process / module) audit helpers — membership for frames, not
 * relations[]. Mechanical checks only; no Graphify.
 *
 * Soft rule: module≠file and process-nest disagreement are gaps (never hard
 * fails). Module without a file anchor on a grounded component is an issue.
 */

import type { SubsystemComponent } from "@principal-ai/subsystems-core";

export type BoundaryCheckKind =
	| "module_file"
	| "process_nest"
	| "skipped";

export type BoundaryCheckVerdict = "ok" | "issue" | "gap" | "skipped";

export interface BoundaryComponentCheck {
	componentId: string;
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
		| "boundary_process_nest_disagree";
	severity: "error" | "info";
	componentId?: string;
	componentName?: string;
	/** Module key when the finding is about a multi-member module group. */
	moduleKey?: string;
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
 * Audit process/module membership fields on components.
 *
 * `augmentedModuleIds` — component ids with an accepted module-boundary
 * augmentation confirming an intentional module≠file grouping.
 */
export function auditBoundaryFields(
	components: readonly SubsystemComponent[],
	opts?: { augmentedModuleIds?: ReadonlySet<string> },
): BoundaryAuditResult {
	const checks: BoundaryComponentCheck[] = [];
	const findings: BoundaryAuditFinding[] = [];
	const augmented = opts?.augmentedModuleIds;

	let modulesClaimed = 0;
	let moduleFileOk = 0;
	let moduleFileMismatch = 0;
	let processNestsChecked = 0;
	let processNestOk = 0;
	let processNestDisagree = 0;

	const byModule = new Map<string, SubsystemComponent[]>();

	for (const c of components) {
		const moduleRaw = c.module?.trim() ?? "";
		const fileRaw = c.file?.trim() ?? "";
		const processRaw = c.process?.trim() ?? "";

		if (!moduleRaw) {
			if (!processRaw) continue;
			checks.push({
				componentId: c.id,
				componentName: c.name,
				kind: "skipped",
				process: processRaw,
				verdict: "skipped",
				note: "process set without module — no module/file check",
			});
			continue;
		}

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
					componentId: c.id,
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
				componentId: c.id,
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

		if (augmented?.has(c.id)) {
			moduleFileOk++;
			checks.push({
				componentId: c.id,
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
			componentId: c.id,
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
			componentId: c.id,
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
					componentId: m.id,
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
				componentId: m.id,
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
				componentId: m.id,
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
		},
	};
}
