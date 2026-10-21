/**
 * Legacy persisted model-audit inventory, plus shared package/span helpers.
 * The Constructs tab now uses the independent graph-backed construct inventory.
 *
 * Joins stored subsystem models with their *persisted* audit reports and
 * returns every construct whose construct-layer check is fully verified, keyed
 * by repo. No audit is run here: a construct appears once the last audit left a
 * `verified` check behind. Re-deriving the rule is avoided by reusing
 * {@link isVerifiedConstructCheck}, so the tab and the audit ledger can never
 * disagree about what "verified" means.
 *
 * Each construct is also attributed to its **package** using the cached
 * codebase-composition package slice (`~/.principal/package-layers`), so the
 * UI can show package-relative paths under per-package dividers instead of full
 * repo-relative paths. The package cache is only *read* here — never built.
 */

import { promises as fs } from "node:fs";
import type { PackagesSliceData } from "@principal-ai/codebase-composition";
import type {
	VerifiedConstruct,
	VerifiedConstructPackage,
	VerifiedConstructRepo,
} from "../shared/contract";
import {
	isVerifiedConstructCheck,
	loadSubsystemModelAudit,
} from "./audit-report-store";
import { hashContentRange } from "./declaration-ref";
import { getCachedPackageLayers } from "./package-layer-store";
import { loadPackagesSlice } from "./package-layer-runner";
import { resolveSandboxed } from "./sandboxed-path";
import {
	getSubsystemModel,
	isRepoPurl,
	listSubsystemModels,
	purlRepoKey,
	resolveRepoRootForComponent,
} from "./subsystem-model-store";

/** Split `pkg:github/owner/name` into owner + name (empty when malformed). */
function repoParts(repoKey: string): { owner: string; name: string } {
	const parts = repoKey.split("/");
	const name = parts.pop() ?? "";
	const owner = parts.pop() ?? "";
	return { owner, name };
}

function lastSegment(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	const idx = trimmed.lastIndexOf("/");
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/** A package as the divider needs it (subset of codebase-composition's data). */
interface RepoPackage {
	/** Repo-relative package root; "" for the repo root. */
	path: string;
	name: string;
	version?: string;
	packageManager?: string;
	isMonorepoRoot?: boolean;
	description?: string;
	manifestPath?: string;
}

interface RepoPackages {
	packages: RepoPackage[];
	isMonorepo: boolean;
}

/** Normalize a discovery path (`"."` / trailing slash) to a repo-relative root. */
function normalizePackagePath(raw: string | undefined): string {
	const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
	return trimmed === "." ? "" : trimmed;
}

/**
 * Read the *cached* package slice for a repo (never discovers). Null when no
 * cache exists for the current checkout — the caller then shows full paths.
 */
export async function loadRepoPackages(purl: string): Promise<RepoPackages | null> {
	try {
		const cached = await getCachedPackageLayers(purl);
		if (!cached) return null;
		const data = loadPackagesSlice(cached.path) as PackagesSliceData;
		const packages: RepoPackage[] = data.packages.map((p) => {
			const pd = p.packageData;
			const path = normalizePackagePath(pd.path);
			return {
				path,
				name: (pd.name ?? "").trim() || lastSegment(path) || "repo root",
				version: pd.version,
				packageManager: pd.packageManager,
				isMonorepoRoot: pd.isMonorepoRoot || undefined,
				description: pd.description,
				manifestPath: pd.manifestPath,
			};
		});
		return { packages, isMonorepo: data.summary.isMonorepo };
	} catch {
		return null;
	}
}

/** Deepest package whose root contains `file`, or null (owned by no package). */
export function packageForFile(
	file: string,
	packages: RepoPackage[],
): RepoPackage | null {
	let best: RepoPackage | null = null;
	for (const pkg of packages) {
		const matches =
			pkg.path === "" || file === pkg.path || file.startsWith(`${pkg.path}/`);
		if (!matches) continue;
		if (!best || pkg.path.length > best.path.length) best = pkg;
	}
	return best;
}

/** Path shown in the list: relative to the package root when there is one. */
export function packageRelativeFile(
	file: string,
	pkg: RepoPackage | null,
): string {
	if (!pkg || pkg.path === "") return file;
	if (file === pkg.path) return lastSegment(file);
	return file.slice(pkg.path.length + 1);
}

/** One verified construct plus the owning component, before grouping. */
interface RawConstruct {
	row: VerifiedConstruct;
	/** Repo-relative file (the row's `file` is rewritten to be package-relative). */
	repoFile: string;
}

/**
 * Every fully verified construct across all stored models, grouped by repo and
 * then by package. Only repo-anchored constructs are included — an `external:`
 * pseudo-purl is not a checkout.
 */
export async function listVerifiedConstructs(): Promise<VerifiedConstructRepo[]> {
	const entries = await listSubsystemModels();
	const byRepo = new Map<string, { purl: string; rows: RawConstruct[] }>();

	for (const entry of entries) {
		const saved = await loadSubsystemModelAudit(entry.id);
		if (!saved) continue;
		const model = await getSubsystemModel(entry.id);
		if (!model) continue;

		const componentByAlias = new Map(
			model.components.map((c) => [c.alias, c]),
		);
		for (const check of saved.report.checks) {
			if (!isVerifiedConstructCheck(check)) continue;
			const component = componentByAlias.get(check.componentAlias);
			if (!component) continue;
			const span = component.declarationSpan;
			if (!span || !component.file) continue;
			const repoKey = purlRepoKey(component.purl);
			if (!repoKey || !isRepoPurl(repoKey)) continue;

			const row: VerifiedConstruct = {
				modelId: entry.id,
				modelTitle: model.title,
				alias: component.alias,
				name: component.name ?? component.symbol ?? component.alias,
				construct: component.construct,
				symbol: component.symbol,
				file: component.file,
				purl: component.purl ?? repoKey,
				repoKey,
				startLine: span.startLine,
				endLine: span.endLine,
				contentHash: span.contentHash,
				auditedAt: saved.report.checkedAt,
				packageRelativeFile: component.file,
			};

			let repo = byRepo.get(repoKey);
			if (!repo) {
				repo = { purl: component.purl ?? repoKey, rows: [] };
				byRepo.set(repoKey, repo);
			}
			repo.rows.push({ row, repoFile: component.file });
		}
	}

	const repos: VerifiedConstructRepo[] = [];
	for (const [repoKey, { purl, rows }] of byRepo) {
		const { owner, name } = repoParts(repoKey);
		const packageInfo = await loadRepoPackages(purl);

		const groups = new Map<string, VerifiedConstructPackage>();
		const groupFor = (pkg: RepoPackage | null): VerifiedConstructPackage => {
			const key = pkg?.path ?? "";
			let group = groups.get(key);
			if (!group) {
				group = {
					path: key,
					name: pkg?.name ?? "",
					version: pkg?.version,
					packageManager: pkg?.packageManager,
					isMonorepoRoot: pkg?.isMonorepoRoot,
					description: pkg?.description,
					manifestPath: pkg?.manifestPath,
					constructs: [],
				};
				groups.set(key, group);
			}
			return group;
		};

		for (const { row, repoFile } of rows) {
			const pkg = packageInfo
				? packageForFile(repoFile, packageInfo.packages)
				: null;
			row.packageRelativeFile = packageRelativeFile(repoFile, pkg);
			groupFor(pkg).constructs.push(row);
		}

		const packages = [...groups.values()];
		for (const pkg of packages) {
			pkg.constructs.sort(
				(a, b) =>
					a.packageRelativeFile.localeCompare(b.packageRelativeFile) ||
					a.startLine - b.startLine ||
					a.name.localeCompare(b.name),
			);
		}
		// Root group first, then packages by path (name as tiebreak).
		packages.sort(
			(a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name),
		);

		repos.push({
			repoKey,
			owner,
			name,
			hasPackageInfo: packageInfo !== null,
			isMonorepo: packageInfo?.isMonorepo ?? false,
			packages,
		});
	}

	repos.sort(
		(a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name),
	);
	return repos;
}

/**
 * Read one pinned declaration span from its checkout and confirm it against the
 * stored content hash. The text is returned even when the hash no longer
 * matches (so the caller can show drift); `verified` is the authority and a
 * `false` span must not be presented as verified.
 */
export async function readSubsystemSpan(input: {
	purl: string;
	file: string;
	startLine: number;
	endLine: number;
	contentHash: string;
}): Promise<{ ok: boolean; text?: string; verified?: boolean; error?: string }> {
	const root = resolveRepoRootForComponent(input.purl);
	if (!root) return { ok: false, error: "no local checkout for this repo" };
	try {
		const absolute = resolveSandboxed(root, input.file);
		const content = await fs.readFile(absolute, "utf8");
		const lines = content.split(/\r?\n/);
		const { startLine, endLine } = input;
		if (startLine < 1 || endLine < startLine || endLine > lines.length) {
			return { ok: false, error: "declaration span is out of range" };
		}
		const text = lines.slice(startLine - 1, endLine).join("\n");
		const verified =
			hashContentRange(content, startLine, endLine) === input.contentHash;
		return { ok: true, text, verified };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}
