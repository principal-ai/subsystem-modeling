/** Current-checkout graph inventory. Reads caches; never runs an audit/extractor. */
import type { ConstructInventoryPackage, ConstructInventoryRepo, SourceConstruct } from "../shared/contract";
import type { GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import { listGraphifyRepos } from "./graphify-store";
import { loadGraphifyGraph } from "./graphify-runner";
import { verifyGraphConstructs } from "./graph-constructs";
import { getSubsystemModel, isRepoPurl, listSubsystemModels, purlRepoKey } from "./subsystem-model-store";
import { listVerifiedConstructs, loadRepoPackages, packageForFile, packageRelativeFile } from "./verified-constructs";

/** Associations are metadata only; their claims cannot verify a graph candidate. */
async function modelAssociations(): Promise<Map<string, SourceConstruct["models"]>> {
	const associations = new Map<string, SourceConstruct["models"]>();
	for (const entry of await listSubsystemModels()) {
		const model = await getSubsystemModel(entry.id);
		for (const component of model?.components ?? []) {
			const repo = component.purl && purlRepoKey(component.purl);
			if (!repo || !component.file || !component.symbol) continue;
			const key = `${repo}\0${component.file}\0${component.symbol.replace(/::/g, ".")}`;
			const matches = associations.get(key) ?? [];
			matches.push({ modelId: entry.id, modelTitle: model!.title, alias: component.alias });
			associations.set(key, matches);
		}
	}
	return associations;
}

/** Offline tests provide repository/model metadata without touching user stores. */
export interface ConstructInventoryDependencies {
	listRepos?: typeof listGraphifyRepos;
	associations?: typeof modelAssociations;
	loadPackages?: typeof loadRepoPackages;
}

export async function listConstructInventory(
	buildingPurls?: ReadonlySet<string>,
	dependencies: ConstructInventoryDependencies = {},
	onlyPurl?: string,
): Promise<ConstructInventoryRepo[]> {
	const repos = await (dependencies.listRepos ?? listGraphifyRepos)(undefined, buildingPurls, onlyPurl);
	const associations = repos.some((repo) => repo.cached?.matchesCurrent)
		? await (dependencies.associations ?? modelAssociations)() : new Map<string, SourceConstruct["models"]>();
	const result: ConstructInventoryRepo[] = [];
	for (const repo of repos) {
		const inventory: ConstructInventoryRepo = {
			repoKey: repo.purl, owner: repo.owner, name: repo.name,
			graphStatus: repo.status, hasCachedGraph: !!repo.cached, hasPackageInfo: false, isMonorepo: false,
			packages: [], coverage: { verified: 0, unresolved: 0, unsupported: 0, error: 0 },
		};
		result.push(inventory);
		// An older graph must not masquerade as the current symbol inventory.
		if (!repo.cached?.matchesCurrent) continue;
		try {
			const graph = loadGraphifyGraph(repo.cached.graphJsonPath);
			const verified = await verifyGraphConstructs({ repoRoot: repo.path, purl: repo.purl, nodes: graph.nodes as GraphifyNode[] });
			inventory.coverage = verified.coverage;
			const packageInfo = await (dependencies.loadPackages ?? loadRepoPackages)(repo.purl);
			inventory.hasPackageInfo = packageInfo !== null;
			inventory.isMonorepo = packageInfo?.isMonorepo ?? false;
			const groups = new Map<string, ConstructInventoryPackage>();
			for (const row of verified.constructs) {
				const pkg = packageInfo ? packageForFile(row.file, packageInfo.packages) : null;
				row.packageRelativeFile = packageRelativeFile(row.file, pkg);
				row.models = associations.get(`${repo.purl}\0${row.file}\0${row.symbol}`) ?? [];
				const path = pkg?.path ?? "";
				let group = groups.get(path);
				if (!group) {
					group = { ...pkg, path, name: pkg?.name ?? "", constructs: [] };
					groups.set(path, group);
				}
				group.constructs.push(row);
			}
			inventory.packages = [...groups.values()].sort((a, b) => a.path.localeCompare(b.path));
		} catch {
			inventory.error = "Could not load or verify the current graph inventory. Rebuild the graph and retry.";
		}
	}
	return result;
}

export interface ConstructRepositoryDependencies {
	models?: () => Promise<Array<{ components: ReadonlyArray<{ purl?: string }> }>>;
	verified?: typeof listVerifiedConstructs;
}

/** Saved model metadata/audits only. Never discovers, loads, or verifies a graph. */
export async function listConstructRepositories(dependencies: ConstructRepositoryDependencies = {}): Promise<ConstructInventoryRepo[]> {
	const models = dependencies.models ? await dependencies.models() : (
		await Promise.all((await listSubsystemModels()).map((entry) => getSubsystemModel(entry.id)))
	).filter((model) => model !== null);
	const repos = new Map<string, ConstructInventoryRepo>();
	for (const model of models) {
		const keys = new Set(model.components.map((component) => purlRepoKey(component.purl))
			.filter((key): key is string => !!key && isRepoPurl(key)));
		const counted = new Set<string>();
		for (const repoKey of keys) {
			const key = repoKey.toLowerCase();
			if (counted.has(key)) continue;
			counted.add(key);
			let repo = repos.get(key);
			if (!repo) {
				const [owner = "", name = ""] = repoKey.slice("pkg:github/".length).split("/");
				repo = {
					repoKey, owner, name, graphStatus: "unknown", modelCount: 0, inventorySource: "model-audits",
					hasPackageInfo: false, isMonorepo: false, packages: [],
					coverage: { verified: 0, unresolved: 0, unsupported: 0, error: 0 },
				};
				repos.set(key, repo);
			}
			repo.modelCount = (repo.modelCount ?? 0) + 1;
		}
	}
	if (!repos.size) return [];
	for (const saved of await (dependencies.verified ?? listVerifiedConstructs)()) {
		const repo = repos.get(saved.repoKey.toLowerCase());
		if (!repo) continue;
		repo.hasPackageInfo = saved.hasPackageInfo;
		repo.isMonorepo = saved.isMonorepo;
		const byIdentity = new Map<string, SourceConstruct>();
		repo.packages = saved.packages.map((pkg) => ({
			...pkg,
			constructs: pkg.constructs.flatMap((construct) => {
				if (!construct.symbol) return [];
				const id = `${construct.file}\0${construct.symbol}`;
				const association = { modelId: construct.modelId, modelTitle: construct.modelTitle, alias: construct.alias };
				const existing = byIdentity.get(id);
				if (existing) {
					existing.models.push(association);
					return [];
				}
				const row: SourceConstruct = {
					id, name: construct.name, symbol: construct.symbol, construct: construct.construct,
					file: construct.file, purl: construct.purl, repoKey: repo.repoKey,
					packageRelativeFile: construct.packageRelativeFile, graphNodeIds: [], graphStartLine: construct.startLine,
					models: [association],
					span: { startLine: construct.startLine, endLine: construct.endLine, contentHash: construct.contentHash },
					verification: { status: "verified", checkedAt: construct.auditedAt,
						evidence: "Saved model audit; source freshness is checked when opened." },
				};
				byIdentity.set(id, row);
				return [row];
			}),
		})).filter((pkg) => pkg.constructs.length > 0);
		repo.coverage.verified = byIdentity.size;
	}
	return [...repos.values()].sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name));
}

interface InventoryState {
	repo?: ConstructInventoryRepo;
	error?: string;
	updatedAt: number;
}

/**
 * RPC reads return immediately. Only one selected-repo verification runs at a
 * time; rapid selection replaces the queued repo instead of spawning a storm.
 */
export class ConstructInventoryService {
	private cache = new Map<string, InventoryState>();
	private active?: string;
	private queued?: { purl: string; buildingPurls?: ReadonlySet<string> };
	private work: Promise<void> = Promise.resolve();
	private invalidated = new Set<string>();

	constructor(
		private load = async (purl: string, buildingPurls?: ReadonlySet<string>) =>
			(await listConstructInventory(buildingPurls, {}, purl))[0],
		private now = Date.now,
	) {}

	/** Passive RPC reads must never start graph verification. */
	peek(purl: string): { loading: false; repo?: ConstructInventoryRepo; error?: string } {
		const key = purlRepoKey(purl);
		if (!key || !isRepoPurl(key)) throw new Error("Choose a repository-backed PURL.");
		const cached = this.cache.get(key);
		return { loading: false, repo: cached?.repo, error: cached?.error };
	}

	get(purl: string, buildingPurls?: ReadonlySet<string>): {
		loading: boolean; repo?: ConstructInventoryRepo; error?: string;
	} {
		const key = purlRepoKey(purl);
		if (!key || !isRepoPurl(key)) throw new Error("Choose a repository-backed PURL.");
		const cached = this.cache.get(key);
		if (cached && this.now() - cached.updatedAt < 15_000) {
			this.queued = undefined;
			return { repo: cached.repo, error: cached.error, loading: false };
		}
		if (this.active === key) this.queued = undefined;
		if (this.active !== key && this.queued?.purl !== key) {
			if (this.active) this.queued = { purl: key, buildingPurls };
			else this.start(key, buildingPurls);
		}
		return { repo: cached?.repo, loading: true };
	}

	private start(purl: string, buildingPurls?: ReadonlySet<string>): void {
		this.active = purl;
		this.invalidated.delete(purl);
		this.work = Promise.resolve().then(async () => {
			try {
				const repo = await this.load(purl, buildingPurls);
				this.cache.delete(purl);
				this.cache.set(purl, {
					repo, error: repo ? undefined : "No usable local checkout is registered for this repository.",
					updatedAt: this.invalidated.has(purl) ? -Infinity : this.now(),
				});
			} catch {
				this.cache.set(purl, {
					error: "Could not load the selected repository's construct inventory.",
					updatedAt: this.invalidated.has(purl) ? -Infinity : this.now(),
				});
			}
			if (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
		}).finally(() => {
			this.invalidated.delete(purl);
			this.active = undefined;
			const next = this.queued;
			this.queued = undefined;
			if (next) this.start(next.purl, next.buildingPurls);
		});
	}

	/** Refresh model links/package groups/graph readiness after host change events. */
	invalidate(purl?: string): void {
		const key = purl ? purlRepoKey(purl) : undefined;
		for (const [cachedPurl, entry] of this.cache) {
			if (!key || key === cachedPurl) entry.updatedAt = -Infinity;
		}
		if (this.active && (!key || key === this.active)) this.invalidated.add(this.active);
	}

	/** Tests can await background work without timers. */
	async wait(): Promise<void> {
		while (this.active) await this.work;
	}
}

export const constructInventory = new ConstructInventoryService();
