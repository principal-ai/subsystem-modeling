import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashContentRange } from "./declaration-ref";
import { registerProjectInAlexandria } from "./alexandria";
import { backfillTrailSitesForModel } from "./backfill-trail-sites";
import {
	createSubsystemModel,
	getSubsystemModel,
} from "./subsystem-model-store";

const KEY = "pkg:github/a/callsite-repo";
let tmp: string;

beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "backfill-sites-"));
	const repo = join(tmp, "repo");
	mkdirSync(join(repo, "src"), { recursive: true });
	writeFileSync(
		join(repo, "src", "call.ts"),
		[
			"export function main() {", // 1
			"  target();", // 2
			"}", // 3
			"export function target() {}", // 4
		].join("\n"),
		"utf8",
	);
	const git = (args: string[]) => {
		const r = spawnSync("git", ["-C", repo, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
	};
	git(["init"]);
	git(["config", "user.email", "test@example.com"]);
	git(["config", "user.name", "test"]);
	git(["add", "-A"]);
	git(["commit", "-m", "init"]);

	process.env["PRINCIPAL_ALEXANDRIA_HOME"] = join(tmp, "alexandria");
	process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"] = tmp;
	registerProjectInAlexandria(repo, "https://github.com/a/callsite-repo.git");
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env["PRINCIPAL_ALEXANDRIA_HOME"];
	delete process.env["PRINCIPAL_SUBSYSTEM_MODELS_HOME"];
});

describe("backfillTrailSitesForModel", () => {
	test("pins the enclosing caller construct from the seam span", async () => {
		const content = [
			"export function main() {",
			"  target();",
			"}",
			"export function target() {}",
		].join("\n");
		const created = await createSubsystemModel({
			title: `backfill-${Math.random().toString(36).slice(2)}`,
			components: [
				{
					alias: "a",
					name: "main",
					construct: "function",
					file: "src/call.ts",
					purl: `${KEY}#src/call.ts`,
				},
				{
					alias: "b",
					name: "target",
					construct: "function",
					file: "src/call.ts",
					purl: `${KEY}#src/call.ts`,
				},
			],
			trails: [
				{
					id: "t",
					title: "call",
					steps: [
						{
							from: "a",
							to: "b",
							mechanism: "calls",
							file: "src/call.ts",
							purl: `${KEY}#src/call.ts`,
							symbol: "main",
							span: {
								startLine: 2,
								endLine: 2,
								contentHash: hashContentRange(content, 2, 2)!,
							},
						},
					],
				},
			],
		});

		const result = await backfillTrailSitesForModel(created.id, {
			dryRun: false,
		});
		expect(result?.backfilled).toBe(1);
		const graph = await getSubsystemModel(created.id);
		expect(graph?.trails?.[0]?.steps[0]?.site).toMatchObject({
			symbol: "main",
			span: { startLine: 1, endLine: 3 },
		});

		const again = await backfillTrailSitesForModel(created.id, {
			dryRun: true,
		});
		expect(again?.backfilled).toBe(0);
		expect(again?.steps[0]?.status).toBe("already");
	});
});
