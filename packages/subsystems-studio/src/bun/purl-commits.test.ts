import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	capturePurlCommits,
	commitsFromDeclarationRefs,
	commitStatus,
	modelProvenance,
	modelProvenanceDetail,
	planAutoRePin,
	purlCommitFreshness,
	referencedFilesByPurl,
	referencedFilesClean,
	referencedPurlKeys,
} from "./purl-commits";
import { registerProjectInAlexandria } from "./alexandria";

// Repo → checkout resolution is Alexandria-backed; keep the registry in a temp
// home so tests never touch the real ~/.alexandria/projects.json.
process.env["PRINCIPAL_ALEXANDRIA_HOME"] = mkdtempSync(
	join(tmpdir(), "pc-alexandria-"),
);

function initRepo(remote: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pc-repo-"));
	const run = (args: string[]) => {
		const r = spawnSync("git", ["-C", dir, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
	};
	run(["init"]);
	run(["config", "user.email", "test@example.com"]);
	run(["config", "user.name", "test"]);
	mkdirSync(join(dir, "src"), { recursive: true });
	writeFileSync(join(dir, "src", "x.ts"), "export const x = 1;\n");
	run(["add", "src/x.ts"]);
	run(["commit", "-m", "init"]);
	registerProjectInAlexandria(dir, remote);
	return dir;
}

let repoA: string;
let repoB: string;
const KEY_A = "pkg:github/a/repo-a";
const KEY_B = "pkg:github/a/repo-b";

beforeAll(() => {
	repoA = initRepo("https://github.com/a/repo-a.git");
	repoB = initRepo("https://github.com/a/repo-b.git");
});

afterAll(() => {
	for (const dir of [repoA, repoB]) {
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

describe("referencedPurlKeys", () => {
	test("dedupes by repo key (fragment stripped), first-seen order", () => {
		expect(
			referencedPurlKeys([
				`${KEY_A}#src/x.ts`,
				`${KEY_A}#src/y.ts`,
				KEY_B,
				undefined,
			]),
		).toEqual([KEY_A, KEY_B]);
	});

	test("drops external pseudo-purls — an identity is not a repo", () => {
		expect(
			referencedPurlKeys([
				"external:opencode2-service",
				"external:proposed",
				"external:file:~/.principal/subsystem-models",
				KEY_A,
			]),
		).toEqual([KEY_A]);
	});
});

describe("referencedFilesByPurl", () => {
	test("components contribute their own file", () => {
		const byPurl = referencedFilesByPurl([
			{ alias: "a", file: "src/x.ts", purl: `${KEY_A}#src/x.ts` },
		]);
		expect(byPurl.get(KEY_A)).toEqual(["src/x.ts"]);
	});

	test("steps prefer their own purl, else fall back to the endpoint component", () => {
		const byPurl = referencedFilesByPurl(
			[
				{ alias: "a", file: "src/x.ts", purl: `${KEY_A}#src/x.ts` },
				{ alias: "b", file: "src/y.ts", purl: `${KEY_B}#src/y.ts` },
			],
			[
				{
					steps: [
						{ file: "src/seam.ts", purl: `${KEY_A}#src/seam.ts`, from: "a", to: "b" },
						{ file: "src/from-a.ts", from: "a", to: "b" }, // from endpoint wins
						{ file: "src/to-b.ts", from: "unknown", to: "b" }, // falls to `to`
					],
				},
			],
		);
		expect(byPurl.get(KEY_A)?.sort()).toEqual([
			"src/from-a.ts",
			"src/seam.ts",
			"src/x.ts",
		]);
		expect(byPurl.get(KEY_B)?.sort()).toEqual(["src/to-b.ts", "src/y.ts"]);
	});
});

describe("commitsFromDeclarationRefs", () => {
	test("picks the earliest capturedAt per repo; ignores refs without a revision", () => {
		const out = commitsFromDeclarationRefs([
			{
				purl: `${KEY_A}#a.ts`,
				declarationRef: {
					capturedAt: "2026-01-02T00:00:00Z",
					revision: { headSha: "newer" },
				},
			},
			{
				purl: `${KEY_A}#b.ts`,
				declarationRef: {
					capturedAt: "2026-01-01T00:00:00Z",
					revision: { headSha: "older" },
				},
			},
			{
				purl: `${KEY_B}#c.ts`,
				declarationRef: {
					capturedAt: "2026-01-01T00:00:00Z",
					revision: { headSha: "b1" },
				},
			},
			{ purl: `${KEY_A}#d.ts` },
		]);
		expect(out).toEqual({ [KEY_A]: "older", [KEY_B]: "b1" });
	});
});

describe("capturePurlCommits (injected)", () => {
	test("omits unresolved purls rather than fabricating", async () => {
		const out = await capturePurlCommits(
			[
				{ alias: "a", purl: `${KEY_A}#src/x.ts` },
				{ alias: "b", purl: "pkg:github/a/unknown#src/x.ts" },
			],
			{
				resolveRoot: (key) => (key === KEY_A ? "/r" : undefined),
				head: async () => "abc123",
			},
		);
		expect(out).toEqual({ [KEY_A]: "abc123" });
	});
});

describe("capturePurlCommits (real git)", () => {
	test("captures each purl's live HEAD", async () => {
		const out = await capturePurlCommits([
			{ alias: "a", purl: `${KEY_A}#src/x.ts` },
			{ alias: "b", purl: `${KEY_B}#src/x.ts` },
		]);
		expect(out[KEY_A]).toMatch(/^[0-9a-f]{40}$/);
		expect(out[KEY_B]).toMatch(/^[0-9a-f]{40}$/);
		expect(Object.keys(out).sort()).toEqual([KEY_A, KEY_B].sort());
	});
});

describe("referencedFilesClean", () => {
	const components = [
		{ alias: "a", file: "src/x.ts", purl: `${KEY_A}#src/x.ts` },
	];

	test("true when referenced files match HEAD", async () => {
		expect(await referencedFilesClean(components)).toBe(true);
	});

	test("false when a referenced file has uncommitted edits", async () => {
		writeFileSync(join(repoA, "src", "x.ts"), "export const x = 2;\n");
		expect(await referencedFilesClean(components)).toBe(false);
		writeFileSync(join(repoA, "src", "x.ts"), "export const x = 1;\n");
	});

	test("stays true for an unrelated untracked file (anchor-scoped)", async () => {
		writeFileSync(join(repoA, "unrelated.ts"), "export const u = 1;\n");
		expect(await referencedFilesClean(components)).toBe(true);
		rmSync(join(repoA, "unrelated.ts"), { force: true });
	});

	test("skips unresolved repos (absence of a machine is not dirty)", async () => {
		expect(
			await referencedFilesClean([
				{ alias: "z", file: "src/x.ts", purl: "pkg:github/a/nope#src/x.ts" },
			]),
		).toBe(true);
	});
});

describe("commitStatus", () => {
	test("match / moved / unresolved", () => {
		expect(commitStatus("abc", "abc", true)).toBe("match");
		expect(commitStatus("abc", "def", true)).toBe("moved");
		expect(commitStatus(undefined, "def", true)).toBe("unresolved");
		expect(commitStatus("abc", null, false)).toBe("unresolved");
	});
});

describe("purlCommitFreshness (injected)", () => {
	test("compares the verified pin (falling back to created) against live", async () => {
		const rows = await purlCommitFreshness(
			{
				createdAtCommits: { [KEY_A]: "c1", [KEY_B]: "b1" },
				verifiedAtCommits: { [KEY_A]: "v1" },
			},
			[{ alias: "a", purl: `${KEY_A}#src/x.ts` }],
			{
				resolveRoot: (key) => (key === KEY_A ? "/r" : undefined),
				head: async () => "v1",
			},
		);
		const byPurl = new Map(rows.map((r) => [r.purl, r]));
		expect(byPurl.get(KEY_A)).toEqual({
			purl: KEY_A,
			pinned: "v1",
			live: "v1",
			status: "match",
		});
		expect(byPurl.get(KEY_B)?.status).toBe("unresolved");
	});
});

/* ------------------------------------------------------------------ *
 * modelProvenance — the cheap tier.
 * ------------------------------------------------------------------ */

const PIN = "a".repeat(40);
const LIVE = "b".repeat(40);
const ROOT_A = "/repos/widget";
// Deliberately no root: KEY_B models a purl with no local checkout.
const ROOT_B = "/repos/gadget";
const ROOTS_BY_KEY: Record<string, string | undefined> = {
	[KEY_A]: ROOT_A,
	[KEY_B]: undefined,
};

/** A two-repo model, one resolvable checkout and one unresolvable. */
const TWO_REPO_SOURCE = {
	createdAtCommits: { [KEY_A]: PIN },
	verifiedAtCommits: { [KEY_A]: PIN, [KEY_B]: PIN },
	components: [
		{ alias: "w", file: "src/w.ts", purl: `${KEY_A}#src/w.ts` },
		{ alias: "g", file: "src/g.ts", purl: `${KEY_B}#src/g.ts` },
	],
};


describe("modelProvenance", () => {
	test("anchors nothing when the pin and head agree", async () => {
		const snap = await modelProvenance(TWO_REPO_SOURCE, {
			resolveRoot: (k) => ROOTS_BY_KEY[k],
			head: async () => PIN,
			diff: async () => [],
			dirty: async () => [],
		});
		expect(snap.purlFreshness?.find((r) => r.purl === KEY_A)?.status).toBe(
			"match",
		);
		// An empty diff is measured-and-clean, which is a real answer and must
		// be recorded as `[]` rather than omitted.
		expect(snap.anchorChanges?.[KEY_A]?.committed).toEqual([]);
	});

	test("records only the anchored files that changed", async () => {
		const snap = await modelProvenance(TWO_REPO_SOURCE, {
			resolveRoot: (k) => ROOTS_BY_KEY[k],
			head: async () => LIVE,
			diff: async (_root, _from, _to, paths) =>
				paths.includes("src/w.ts") ? ["src/w.ts"] : [],
			dirty: async () => [],
			distance: async () => ({ commitsSincePin: 7, pinOnlyCommits: 0 }),
		});
		expect(snap.anchorChanges?.[KEY_A]).toMatchObject({
			committed: ["src/w.ts"],
			commitsSincePin: 7,
			pinOnlyCommits: 0,
		});
		expect(snap.anchorChanges?.[KEY_A]?.historyRewritten).toBeUndefined();
	});

	test("carries a rewritten history without inventing a distance", async () => {
		const snap = await modelProvenance(TWO_REPO_SOURCE, {
			resolveRoot: (k) => ROOTS_BY_KEY[k],
			head: async () => LIVE,
			diff: async () => [],
			dirty: async () => [],
			distance: async () => ({ historyRewritten: true }),
		});
		expect(snap.anchorChanges?.[KEY_A]).toEqual({ committed: [], historyRewritten: true });
		expect(snap.anchorChanges?.[KEY_A]?.commitsSincePin).toBeUndefined();
	});

	test("an unresolvable repo is unresolved and carries no anchor data", async () => {
		const snap = await modelProvenance(TWO_REPO_SOURCE, {
			resolveRoot: (k) => ROOTS_BY_KEY[k],
			head: async () => LIVE,
			// Only KEY_A resolves, so any call naming ROOT_B is a bug.
			diff: async (root) => {
				if (root === ROOT_B) throw new Error("diffed an unresolvable repo");
				return [];
			},
			dirty: async (root) => {
				if (root === ROOT_B) throw new Error("stat'd an unresolvable repo");
				return [];
			},
		});
		expect(snap.purlFreshness?.find((r) => r.purl === KEY_B)?.status).toBe(
			"unresolved",
		);
		expect(snap.anchorChanges?.[KEY_B]).toBeUndefined();
	});

	test("an external pseudo-purl yields no row, unlike an unresolvable repo", async () => {
		const snap = await modelProvenance(
			{
				createdAtCommits: { [KEY_A]: PIN },
				verifiedAtCommits: { [KEY_A]: PIN },
				components: [
					{ alias: "w", file: "src/w.ts", purl: `${KEY_A}#src/w.ts` },
					// A file-less `external:` component — the opencode2 daemon.
					{ alias: "daemon", purl: "external:opencode2-service" },
				],
			},
			{
				resolveRoot: (k) => ROOTS_BY_KEY[k],
				head: async () => PIN,
				diff: async () => [],
				dirty: async () => [],
			},
		);
		// Exactly one row, and it is the real repo at `match`. A pseudo-purl row
		// would read `unresolved` forever, and the rollup takes the worst status
		// across rows — so it would drag a fully-pinned model off `current`.
		expect(snap.purlFreshness?.map((r) => r.purl)).toEqual([KEY_A]);
		expect(snap.purlFreshness?.[0]?.status).toBe("match");
		// Nothing unmeasured is left, so the anchor verdict can reach `clean`.
		expect(snap.anchorChanges?.[KEY_A]?.committed).toEqual([]);
	});

	test("a failed diff is omitted rather than reported as clean", async () => {
		const snap = await modelProvenance(TWO_REPO_SOURCE, {
			resolveRoot: (k) => ROOTS_BY_KEY[k],
			head: async () => LIVE,
			diff: async () => null,
			dirty: async () => [],
		});
		// `committed` absent means "not measured", which the UI must not read as
		// clean — hence no key at all rather than an empty list.
		expect(snap.anchorChanges?.[KEY_A]?.committed).toBeUndefined();
	});

	test("only reports dirty paths that exist", async () => {
		const snap = await modelProvenance(TWO_REPO_SOURCE, {
			resolveRoot: (k) => ROOTS_BY_KEY[k],
			head: async () => LIVE,
			diff: async () => [],
			dirty: async () => ["src/w.ts"],
		});
		expect(snap.anchorChanges?.[KEY_A]?.dirty).toEqual(["src/w.ts"]);
	});

	test("trail step sites join the pathspec", async () => {
		const seen: string[][] = [];
		await modelProvenance(
			{
				createdAtCommits: { [KEY_A]: PIN },
				components: [{ alias: "w", file: "src/w.ts", purl: `${KEY_A}#src/w.ts` }],
				trails: [
					{ steps: [{ file: "src/flow.ts", purl: `${KEY_A}#src/flow.ts` }] },
				],
			},
			{
				resolveRoot: () => ROOT_A,
				head: async () => LIVE,
				diff: async (_r, _f, _t, paths) => {
					seen.push([...paths]);
					return [];
				},
				dirty: async () => [],
			},
		);
		expect(seen[0]?.sort()).toEqual(["src/flow.ts", "src/w.ts"]);
	});
});

describe("planAutoRePin", () => {
	const clean = {
		resolveRoot: (k: string) => ROOTS_BY_KEY[k],
		head: async () => LIVE,
		diff: async () => [],
		dirty: async () => [],
		distance: async () => ({ commitsSincePin: 5, pinOnlyCommits: 0 }),
	};

	test("promotes when nothing anchored moved", async () => {
		const plan = await planAutoRePin(
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: [] } },
			clean,
		);
		expect(plan[KEY_A]).toEqual({ status: "applied", commit: LIVE });
	});

	test("refuses when an anchored file changed", async () => {
		const plan = await planAutoRePin(
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: ["src/w.ts"] } },
			clean,
		);
		expect(plan[KEY_A]).toBeUndefined();
	});

	test("refuses when the anchor set was never measured", async () => {
		// `committed` absent is "unknown", not "clean" — the whole point of
		// promoting on a proof is that the proof has to exist.
		const plan = await planAutoRePin(TWO_REPO_SOURCE, { [KEY_A]: {} }, clean);
		expect(plan[KEY_A]).toBeUndefined();
	});

	test("refuses a dirty tree", async () => {
		const plan = await planAutoRePin(
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: [], dirty: ["src/w.ts"] } },
			clean,
		);
		expect(plan[KEY_A]).toEqual({ status: "blocked", blockedBy: "dirty-tree" });
	});

	test("refuses an orphaned pin", async () => {
		const plan = await planAutoRePin(
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: [], historyRewritten: true } },
			clean,
		);
		expect(plan[KEY_A]).toEqual({
			status: "blocked",
			blockedBy: "history-rewritten",
		});
	});

	test("does nothing when the pin already equals head", async () => {
		const plan = await planAutoRePin(
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: [] } },
			{ ...clean, head: async () => PIN },
		);
		expect(plan[KEY_A]).toBeUndefined();
	});
});

describe("modelProvenanceDetail", () => {
	const three = (touched: number[]) =>
		Array.from({ length: 3 }, (_, i) => ({
			sha: String(i).padStart(40, "0"),
			files: touched.includes(i) ? ["src/w.ts"] : [],
		}));

	test("flags only commits that touched an anchor", async () => {
		const detail = await modelProvenanceDetail(
			"g1",
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: ["src/w.ts"] } },
			{
				resolveRoot: (k) => ROOTS_BY_KEY[k],
				head: async () => LIVE,
				commits: async () => three([1]),
				remote: async () => null,
			},
		);
		expect(detail.anchorChanges?.[KEY_A]?.commits?.map((c) => c.touched)).toEqual([
			false,
			true,
			false,
		]);
	});

	test("locates the remote on the walk", async () => {
		const detail = await modelProvenanceDetail(
			"g1",
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: [] } },
			{
				resolveRoot: (k) => ROOTS_BY_KEY[k],
				head: async () => LIVE,
				commits: async () => three([]),
				remote: async () => "0".repeat(40),
			},
		);
		expect(detail.anchorChanges?.[KEY_A]?.remoteIndex).toBe(0);
	});

	test("a remote outside the window means everything shown is ahead of it", async () => {
		const detail = await modelProvenanceDetail(
			"g1",
			TWO_REPO_SOURCE,
			{ [KEY_A]: { committed: [] } },
			{
				resolveRoot: (k) => ROOTS_BY_KEY[k],
				head: async () => LIVE,
				commits: async () => three([]),
				remote: async () => "f".repeat(40),
			},
		);
		expect(detail.anchorChanges?.[KEY_A]?.remoteIndex).toBeUndefined();
		expect(detail.anchorChanges?.[KEY_A]?.remoteAhead).toBe(3);
	});
});
