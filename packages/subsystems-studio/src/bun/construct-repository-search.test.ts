import { describe, expect, test } from "bun:test";
import { searchConstructRepositories } from "./construct-repository-search";
import type { loadAlexandriaRepos } from "./alexandria";

const entries: ReturnType<typeof loadAlexandriaRepos> = new Map([
	["/work/studio", { root: "/work/studio", owner: "Principal-AI", repo: "studio" }],
	["/work/clone", { root: "/work/clone", owner: "principal-ai", repo: "Studio" }],
	["/archive/core", { root: "/archive/core", owner: "example", repo: "core" }],
	["/local", { root: "/local", repo: "local" }],
]);
const load = () => entries;

describe("Constructs Alexandria repository search", () => {
	test("ignores blank searches without reading the registry", () => {
		expect(searchConstructRepositories("  ", () => { throw new Error("Must not read"); })).toEqual([]);
	});

	test("matches owner, name, PURL, and checkout path case-insensitively", () => {
		for (const query of [" PRINCIPAL ", "STUDIO", "pkg:github/principal-ai", "/WORK/STUDIO"]) {
			expect(searchConstructRepositories(query, load).map((repo) => repo.repoKey))
				.toEqual(["pkg:github/Principal-AI/studio"]);
		}
		expect(searchConstructRepositories("archive", load)[0]?.name).toBe("core");
	});

	test("deduplicates identities and skips repos without a supported identity", () => {
		expect(searchConstructRepositories("pkg:github", load).map((repo) => repo.name)).toEqual(["core", "studio"]);
		expect(searchConstructRepositories("local", load)).toEqual([]);
		expect(searchConstructRepositories("missing", load)).toEqual([]);
	});

	test("returns metadata without claiming analysis or verification", () => {
		const [repo] = searchConstructRepositories("studio", load);
		expect(repo?.packages).toEqual([]);
		expect(repo?.modelCount).toBe(0);
		expect(repo?.graphStatus).toBe("unknown");
		expect(repo?.coverage.verified).toBe(0);
	});

	test("caps results at fifty repositories", () => {
		const repos = new Map(Array.from({ length: 60 }, (_, i) => [
			`/repo/${i}`, { root: `/repo/${i}`, owner: "example", repo: `repo-${i}` },
		]));
		expect(searchConstructRepositories("example", () => repos)).toHaveLength(50);
	});
});
