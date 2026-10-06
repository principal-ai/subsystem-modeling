#!/usr/bin/env bun
/**
 * Guard internal cross-package dependencies against drift.
 *
 * This monorepo has no workspaces and its packages publish independently, but
 * they release together. A dependent's internal ref must therefore *accept* the
 * sibling's current on-disk version — otherwise `npm publish` ships a package
 * that pulls a stale sibling (the CLI pinned `@principal-ai/subsystems-studio`
 * at 0.6.16 while studio was 0.17.0).
 *
 *   bun scripts/internal-deps.mjs          # check; exit 1 on drift
 *   bun scripts/internal-deps.mjs --fix    # rewrite drifted refs to ^<version>
 *
 * Ranges that already accept the sibling version are left alone, so a publish
 * only forces a dependent bump when the sibling actually moved out of range.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIELDS = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
	"devDependencies",
];
const EXACT = /^\d+\.\d+\.\d+(?:[-+].*)?$/;
const FORBIDDEN = /^(workspace:|file:|link:|portal:|git\+|https?:)/;

/** True when `spec` accepts `version` (exact match or semver range). */
function accepts(spec, version) {
	if (EXACT.test(spec)) return spec === version;
	try {
		return Bun.semver.satisfies(version, spec);
	} catch {
		return false;
	}
}

function readPackages() {
	const dir = join(repo, "packages");
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const file = join(dir, entry.name, "package.json");
		if (!existsSync(file)) continue;
		const json = JSON.parse(readFileSync(file, "utf8"));
		if (!json.name) continue;
		out.push({ dir: `packages/${entry.name}`, file, raw: readFileSync(file, "utf8"), json });
	}
	return out;
}

const fix = process.argv.includes("--fix");
const pkgs = readPackages();
const byName = new Map(pkgs.map((p) => [p.json.name, p]));

const problems = [];
const fixes = [];

for (const pkg of pkgs) {
	for (const field of FIELDS) {
		const deps = pkg.json[field];
		if (!deps) continue;
		for (const [dep, spec] of Object.entries(deps)) {
			const sibling = byName.get(dep);
			if (!sibling) continue; // external package — not our concern
			if (FORBIDDEN.test(spec)) {
				problems.push(
					`${pkg.json.name} ${field} ${dep}@${spec}: must reference a published version, not ${spec}`,
				);
				continue;
			}
			if (accepts(spec, sibling.json.version)) continue;

			const target = `^${sibling.json.version}`;
			if (fix) {
				// Targeted text replace so the rest of the file keeps its formatting.
				pkg.raw = pkg.raw.replace(`"${dep}": "${spec}"`, `"${dep}": "${target}"`);
				fixes.push(`${pkg.json.name} ${field} ${dep}: ${spec} -> ${target}`);
			} else {
				problems.push(
					`${pkg.json.name} ${field} ${dep}@${spec} does not accept sibling ${dep}@${sibling.json.version}`,
				);
			}
		}
	}
}

if (fix) {
	for (const pkg of pkgs) {
		const original = readFileSync(pkg.file, "utf8");
		if (pkg.raw !== original) writeFileSync(pkg.file, pkg.raw);
	}
	if (fixes.length === 0) {
		console.log("internal deps: in sync, nothing to fix.");
	} else {
		console.log(`internal deps: synced ${fixes.length} ref(s)`);
		for (const f of fixes) console.log(`  ${f}`);
	}
	process.exit(0);
}

if (problems.length > 0) {
	console.error(`internal deps: drift detected (${problems.length})`);
	for (const p of problems) console.error(`  ${p}`);
	console.error(
		"\nRun `bun run sync:internal-deps`, then republish the dependents that changed.",
	);
	process.exit(1);
}
console.log("internal deps: every internal ref accepts its sibling version.");
