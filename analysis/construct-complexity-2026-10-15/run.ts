import { createHash } from "node:crypto";
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assessConstructComplexity } from "../../packages/subsystems-studio/src/bun/jev-complexity";
import { envTypesafeKey, JEV_MODEL } from "../../packages/subsystems-studio/src/bun/jev-maintenance";
import { listVerifiedConstructs, readSubsystemSpan } from "../../packages/subsystems-studio/src/bun/verified-constructs";
import { loadViewerSettings } from "../../packages/subsystems-studio/src/bun/viewer-settings";

const dir = import.meta.dir;
const resultsPath = join(dir, "results.jsonl");
const rubricHash = createHash("sha256")
	.update(await readFile(join(dir, "../../packages/subsystems-studio/src/bun/jev-complexity.ts")))
	.digest("hex");
const apiKey = loadViewerSettings().typesafeApiKey?.trim() || envTypesafeKey();
if (!apiKey) throw new Error("Configure the Jev key in Studio before running this analysis.");
const repos = await listVerifiedConstructs();
const claims = repos.flatMap((r) => r.packages.flatMap((p) => p.constructs));
const identity = (c: typeof claims[number]) =>
	JSON.stringify([c.repoKey, c.file, c.startLine, c.endLine, c.contentHash]);
const unique = [...new Map(claims.map((c) => [identity(c), c])).values()];
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "inventory.json"), JSON.stringify({
	capturedAt: new Date().toISOString(),
	model: JEV_MODEL,
	rubricHash,
	claims: claims.length,
	uniqueSpans: unique.length,
	constructs: unique.map((c) => ({
		...c,
		modelClaims: claims.filter((other) => identity(c) === identity(other))
			.map((other) => ({ modelId: other.modelId, alias: other.alias })),
	})),
}, null, 2));

const completed = new Set<string>();
try {
	for (const line of (await readFile(resultsPath, "utf8")).trim().split("\n")) {
		if (!line) continue;
		const row = JSON.parse(line);
		if (row.ok && row.rubricHash === rubricHash && row.requestedModel === JEV_MODEL) completed.add(row.key);
	}
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const queue = unique.filter((c) => !completed.has(identity(c)));
let cursor = 0;
let success = 0;
let failed = 0;
let stop = false;
let writeQueue = Promise.resolve();
async function save(row: unknown) {
	writeQueue = writeQueue.then(() => appendFile(resultsPath, JSON.stringify(row) + "\n"));
	await writeQueue;
}

async function worker() {
	while (!stop) {
		const c = queue[cursor++];
		if (!c) return;
		const start = performance.now();
		const span = await readSubsystemSpan(c);
		const base = {
			key: identity(c),
			rubricHash,
			requestedModel: JEV_MODEL,
			repo: c.repoKey,
			file: c.file,
			symbol: c.symbol ?? c.name,
			construct: c.construct,
			startLine: c.startLine,
			endLine: c.endLine,
			contentHash: c.contentHash,
		};
		if (!span.ok || span.text == null || !span.verified) {
			await save({ ...base, ok: false, error: span.error ?? "Source drifted or unavailable." });
			failed++;
			continue;
		}
		const lines = span.text.split(/\r?\n/);
		const metrics = {
			totalLines: lines.length,
			nonblankLines: lines.filter((line) => line.trim()).length,
			characters: span.text.length,
			words: span.text.trim().split(/\s+/).filter(Boolean).length,
		};
		let responseModel: string | undefined;
		let rawScore: number | undefined;
		let usage: unknown;
		let attempts = 0;
		let response: Awaited<ReturnType<typeof assessConstructComplexity>>;
		do {
			attempts++;
			response = await assessConstructComplexity(c, {
				apiKey,
				readSpan: async () => span,
				fetch: (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
					const result = await fetch(url, init);
					if (result.ok) {
						const body = await result.clone().json() as any;
						responseModel = body.model;
						rawScore = body.answers?.complexity?.score;
						usage = body.usage;
					}
					return result;
				}) as typeof fetch,
			});
			if (response.ok || attempts >= 3) break;
			if (!/HTTP (429|5\d\d)|timed out|Please retry/.test(response.error ?? "")) break;
			await Bun.sleep(2_000 * 2 ** (attempts - 1));
		} while (true);
		await save({
			...base, ...metrics, ...response, rawScore, responseModel, usage,
			attempts, elapsedMs: Math.round(performance.now() - start),
		});
		if (response.ok) success++;
		else failed++;
		if (/HTTP (401|403)/.test(response.error ?? "")) stop = true;
		console.log(JSON.stringify({
			completed: completed.size + success + failed,
			total: unique.length, newlyScored: success, failed,
		}));
	}
}
console.log(JSON.stringify({ total: unique.length, cached: completed.size, pending: queue.length, concurrency: 3 }));
await Promise.all(Array.from({ length: 3 }, () => worker()));
await writeQueue;
console.log(JSON.stringify({ finished: true, total: unique.length, cached: completed.size, success, failed, stopped: stop }));
if (failed || stop) process.exitCode = 1;
