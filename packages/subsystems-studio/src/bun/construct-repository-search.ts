import type { ConstructInventoryRepo } from "../shared/contract";
import { loadAlexandriaRepos } from "./alexandria";

/** Registry metadata only: never probes git, extracts graphs, or audits models. */
export function searchConstructRepositories(
	query: string,
	loadRepos = loadAlexandriaRepos,
): ConstructInventoryRepo[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const matches = new Map<string, ConstructInventoryRepo>();
	for (const entry of loadRepos().values()) {
		if (!entry.owner || !entry.repo) continue;
		const repoKey = `pkg:github/${entry.owner}/${entry.repo}`;
		if (!`${repoKey} ${entry.root}`.toLowerCase().includes(q)) continue;
		const key = repoKey.toLowerCase();
		if (matches.has(key)) continue;
		matches.set(key, {
			repoKey, owner: entry.owner, name: entry.repo,
			graphStatus: "unknown", hasPackageInfo: false, isMonorepo: false,
			modelCount: 0, packages: [],
			coverage: { verified: 0, unresolved: 0, unsupported: 0, error: 0 },
		});
	}
	return [...matches.values()]
		.sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name))
		.slice(0, 50);
}
