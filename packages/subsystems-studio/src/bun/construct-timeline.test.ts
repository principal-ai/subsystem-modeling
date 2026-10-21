import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunGraphifyExtractOptions, type RunGraphifyExtractResult } from "./graphify-runner";
import { ConstructTimelineService, diffTimelineIdentities, parseTimelineLog } from "./construct-timeline";
import { summarizeConstructTimeline } from "../shared/construct-timeline";

const purl = "pkg:github/test/timeline";
let root: string;

const f = (value: number) => `export function f() {\n  return ${value};\n}\n`;
const g = (value: number) => `export function g() {\n  return ${value};\n}\n`;
/** root -> change f -> introduce g -> remove g -> change f */
const HISTORY: Array<Record<string, string | null>> = [
	{ "a.ts": f(1) }, { "a.ts": f(2) }, { "b.ts": g(3) }, { "b.ts": null }, { "a.ts": f(4) },
];

beforeAll(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "construct-timeline-test-"));
});

afterAll(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

/** Build a fresh repo and return its directory plus the sha of every commit. */
async function makeRepo(name: string, steps: Array<Record<string, string | null>> = HISTORY) {
	const repo = join(root, name);
	await fs.mkdir(repo, { recursive: true });
	const run = async (...args: string[]): Promise<string> => {
		const proc = Bun.spawn(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
		const [out, error] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
		if (await proc.exited) throw new Error(error);
		return out.trim();
	};
	await run("init");
	const shas: string[] = [];
	for (const [index, step] of steps.entries()) {
		for (const [file, content] of Object.entries(step)) {
			if (content === null) await fs.rm(join(repo, file), { force: true });
			else await fs.writeFile(join(repo, file), content);
		}
		await run("add", "-A");
		await run("commit", "--allow-empty", "-m", `Commit ${index}`);
		shas.push(await run("rev-parse", "HEAD"));
	}
	return { repo, shas, run };
}

async function extract(opts: RunGraphifyExtractOptions): Promise<RunGraphifyExtractResult> {
	const names = (await fs.readdir(opts.repoRoot)).filter((name) => name.endsWith(".ts"));
	const nodes = [];
	for (const name of names) {
		const content = await fs.readFile(join(opts.repoRoot, name), "utf8");
		const symbol = content.match(/function (\w+)/)![1]!;
		nodes.push({
			id: `${name.slice(0, -3)}_${symbol}`, label: `${symbol}()`, source_file: name,
			source_location: "L1", file_type: "code",
		});
	}
	const graph = { nodes, links: [] };
	const output = join(opts.outDir!, "graphify-out");
	await fs.mkdir(output, { recursive: true });
	const graphJsonPath = join(output, "graph.json");
	await fs.writeFile(graphJsonPath, JSON.stringify(graph));
	return {
		ok: true, repoRoot: opts.repoRoot, outDir: opts.outDir!, graphifyOut: output, graphJsonPath,
		graph, nodeCount: nodes.length, edgeCount: 0, usedTempOut: false, durationMs: 1, stdout: "", stderr: "",
	};
}

function service(name: string, repo: string) {
	return new ConstructTimelineService({ storeRoot: join(root, name), resolveRepo: () => repo, extract });
}

describe("cumulative construct timeline", () => {
	test("starts at the epoch, records transitions forward, and advances the cursor", async () => {
		const { repo, shas } = await makeRepo("baseline-repo");
		const timeline = service("baseline", repo);
		expect(await timeline.get(purl)).toBeUndefined();
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const stored = (await timeline.get(purl))!;
		expect(stored.meta.status).toBe("idle");
		expect(stored.meta.epoch?.sha).toBe(shas[0]!);
		expect(stored.meta.cursor?.sha).toBe(shas[4]!);
		expect(stored.meta.events).toBe(5);
		expect(stored.meta.constructs).toBe(1);
		expect(stored.events.map((event) => event.sha)).toEqual(shas);
		const names = (event: { introduced: Array<{ file: string; symbol: string }> }) =>
			event.introduced.map((identity) => `${identity.file}:${identity.symbol}`);
		expect(stored.events.map(names)).toEqual([["a.ts:f"], [], ["b.ts:g"], [], []]);
		expect(stored.events.map((event) => event.changed.map((identity) => identity.symbol)))
			.toEqual([[], ["f"], [], [], ["f"]]);
		expect(stored.events[3]!.removed.map((identity) => identity.symbol)).toEqual(["g"]);
		expect(stored.events.every((event) => event.constructs >= 1 && event.coverage.verified >= 1)).toBe(true);
		expect(summarizeConstructTimeline(stored.events)).toMatchObject({ introduced: 2, removed: 1, changed: 2 });
	});

	test("extends forward from the cursor without re-analyzing earlier commits", async () => {
		const { repo, shas, run } = await makeRepo("incremental-repo");
		const timeline = service("incremental", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const first = (await timeline.get(purl))!;
		const directory = join(root, "incremental", (await fs.readdir(join(root, "incremental")))[0]!);
		const eventsPath = join(directory, "events.ndjson");
		const bytes = (await fs.stat(eventsPath)).size;

		await fs.writeFile(join(repo, "a.ts"), f(5));
		await run("add", "-A");
		await run("commit", "-m", "Commit 5");
		const tip = await run("rev-parse", "HEAD");

		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const second = (await timeline.get(purl))!;
		// Only the new commit is appended; the earlier prefix is untouched on disk.
		expect(second.events.slice(0, first.events.length)).toEqual(first.events);
		expect(second.events).toHaveLength(first.events.length + 1);
		expect(second.events.at(-1)!.sha).toBe(tip);
		expect(second.events.at(-1)!.changed.map((identity) => identity.symbol)).toEqual(["f"]);
		expect((await fs.stat(eventsPath)).size).toBeGreaterThan(bytes);
		expect(second.meta.cursor?.sha).toBe(tip);
		expect(shas).toHaveLength(5);
	});

	test("caps each extension and resumes from the cursor, oldest first", async () => {
		const { repo, shas } = await makeRepo("capped-repo");
		const timeline = service("capped", repo);
		await timeline.extend(purl, { maxCommits: 2, maxMinutes: 1 });
		await timeline.wait(purl);
		const first = (await timeline.get(purl))!;
		expect(first.events.map((event) => event.sha)).toEqual(shas.slice(0, 2));
		expect(first.meta.cursor?.sha).toBe(shas[1]!);

		await timeline.extend(purl, { maxCommits: 2, maxMinutes: 1 });
		await timeline.wait(purl);
		const second = (await timeline.get(purl))!;
		expect(second.events.map((event) => event.sha)).toEqual(shas.slice(0, 4));
		expect(second.meta.cursor?.sha).toBe(shas[3]!);

		await timeline.extend(purl, { maxCommits: 2, maxMinutes: 1 });
		await timeline.wait(purl);
		const third = (await timeline.get(purl))!;
		expect(third.events.map((event) => event.sha)).toEqual(shas);
		expect(third.meta.cursor?.sha).toBe(shas[4]!);

		// A no-op extension leaves the timeline as-is.
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		expect((await timeline.get(purl))!.meta.events).toBe(5);
	});

	test("detects a rewritten history instead of splicing a disjoint log", async () => {
		const { repo, shas, run } = await makeRepo("rewrite-repo");
		const timeline = service("rewrite", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		expect((await timeline.get(purl))!.meta.cursor?.sha).toBe(shas[4]!);
		// Rewrite: branch from the root with a different tip.
		await run("checkout", "--detach", shas[0]!);
		await fs.writeFile(join(repo, "a.ts"), f(99));
		await run("add", "-A");
		await run("commit", "-m", "Rewritten");
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const stored = (await timeline.get(purl))!;
		expect(stored.meta.status).toBe("failed");
		expect(stored.meta.error).toContain("rewritten");
		// The recorded prefix is preserved; nothing disjoint was spliced in.
		expect(stored.meta.events).toBe(5);
		expect(stored.events.map((event) => event.sha)).toEqual(shas);
	});

	test("reports a running extension that was left behind as interrupted", async () => {
		const { repo } = await makeRepo("interrupted-repo");
		const timeline = service("interrupted", repo);
		await timeline.extend(purl, { maxMinutes: 1 });
		await timeline.wait(purl);
		const directory = join(root, "interrupted", (await fs.readdir(join(root, "interrupted")))[0]!);
		const metaPath = join(directory, "timeline.json");
		const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as Record<string, unknown>;
		await fs.writeFile(metaPath, JSON.stringify({ ...meta, status: "running" }));
		const fresh = service("interrupted", repo);
		expect((await fresh.get(purl))!.meta.status).toBe("interrupted");
	});

	test("validates limits and PURLs", async () => {
		const { repo } = await makeRepo("limits-repo");
		const timeline = service("limits", repo);
		await expect(timeline.extend(purl, { maxCommits: 0 })).rejects.toThrow();
		await expect(timeline.extend(purl, { maxCommits: 1.5 })).rejects.toThrow();
		await expect(timeline.extend(purl, { maxMinutes: 0 })).rejects.toThrow();
		await expect(timeline.extend(purl, { maxMinutes: 1_000 })).rejects.toThrow();
		await expect(timeline.extend("not-a-purl", {})).rejects.toThrow();
	});

	test("parses the first-parent log and diffs verified identities", () => {
		const log = [
			`${"b".repeat(40)}\x002026-10-16T12:00:00Z\x00Newest\x00${"a".repeat(40)}`,
			`${"a".repeat(40)}\x002026-10-15T12:00:00Z\x00Oldest\x00`,
		].join("\n");
		expect(parseTimelineLog(log)).toEqual([
			{ sha: "b".repeat(40), committedAt: "2026-10-16T12:00:00Z", subject: "Newest" },
			{ sha: "a".repeat(40), committedAt: "2026-10-15T12:00:00Z", subject: "Oldest" },
		]);
		const older = new Map([
			["a.ts\0f", { file: "a.ts", symbol: "f", construct: "function", contentHash: "1" }],
			["b.ts\0g", { file: "b.ts", symbol: "g", construct: "function", contentHash: "1" }],
		]);
		const newer = new Map([
			["a.ts\0f", { file: "a.ts", symbol: "f", construct: "function", contentHash: "2" }],
			["c.ts\0h", { file: "c.ts", symbol: "h", construct: "function", contentHash: "1" }],
		]);
		expect(diffTimelineIdentities(older, newer)).toEqual({
			introduced: [{ file: "c.ts", symbol: "h", construct: "function" }],
			removed: [{ file: "b.ts", symbol: "g", construct: "function" }],
			changed: [{ file: "a.ts", symbol: "f", construct: "function" }],
		});
	});

	test("closes lifetimes and reports medians over the stored events", () => {
		const events = [
			{ sha: "1", committedAt: "2026-01-01T00:00:00Z", introduced: [{ file: "a.ts", symbol: "f" }], removed: [], changed: [] },
			{ sha: "2", committedAt: "2026-01-03T00:00:00Z", introduced: [{ file: "b.ts", symbol: "g" }], removed: [{ file: "a.ts", symbol: "f" }], changed: [] },
			{ sha: "3", committedAt: "2026-01-05T00:00:00Z", introduced: [], removed: [{ file: "b.ts", symbol: "g" }], changed: [] },
		].map((event) => ({
			...event, subject: "", constructs: 1, coverage: { verified: 1, unresolved: 0, unsupported: 0, error: 0 },
			timing: { checkoutMs: 0, extractMs: 0, matchMs: 0, totalMs: 0 },
		}));
		const summary = summarizeConstructTimeline(events);
		expect(summary).toMatchObject({ introduced: 2, removed: 2, changed: 0, medianLifetimeCommits: 1 });
		expect(summary.lifetimes.map((lifetime) => lifetime.symbol)).toEqual(["f", "g"]);
		expect(summary.lifetimes[0]).toMatchObject({ introducedCommit: "1", removedCommit: "2", commits: 1 });
		expect(summary.medianLifetimeMs).toBe(2 * 24 * 60 * 60 * 1000);
	});
});
