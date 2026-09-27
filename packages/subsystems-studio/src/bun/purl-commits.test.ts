import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	capturePurlCommits,
	commitStatus,
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
