import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import config from "./electrobun.config";
import pkg from "./package.json";

describe("analysis worker build lifecycle", () => {
	test("rebuilds the worker through Electrobun, including watch reloads and direct builds", () => {
		expect(config.scripts.preBuild).toBe("scripts/build-analysis-worker.ts");
		expect(config.build.copy["artifacts/analysis-worker/construct-timeline-worker.js"]).toBe("bun/construct-timeline-worker.js");
		expect(config.build.watch).toContain("src/shared");
		expect(config.build.watch).toContain("scripts/build-analysis-worker.ts");
		for (const name of ["start", "dev", "build:canary", "build:stable"] as const) {
			expect(pkg.scripts[name]).toContain("electrobun");
			expect(pkg.scripts[name]).not.toContain("bun run build:worker");
		}
	});

	test("the configured hook replaces stale worker output on each build and fails on invalid source", async () => {
		// Exercise the real hook in an isolated fixture, never rebuild the running app.
		const root = await fs.mkdtemp(join(tmpdir(), "studio-worker-hook-"));
		try {
			const hook = join(root, config.scripts.preBuild);
			const entrypoint = join(root, "src/bun/construct-timeline-worker.ts");
			await fs.mkdir(dirname(hook), { recursive: true });
			await fs.mkdir(dirname(entrypoint), { recursive: true });
			await fs.copyFile(join(import.meta.dir, config.scripts.preBuild), hook);
			const build = async () => {
				const proc = Bun.spawn([process.execPath, hook], { cwd: root, stdout: "pipe", stderr: "pipe" });
				const [stdout, stderr, exitCode] = await Promise.all([
					new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
				]);
				return { stdout, stderr, exitCode };
			};
			const output = join(root, "artifacts/analysis-worker/construct-timeline-worker.js");
			await fs.writeFile(entrypoint, 'export const version = "first-worker";\n');
			expect((await build()).exitCode).toBe(0);
			expect(await fs.readFile(output, "utf8")).toContain("first-worker");
			await fs.writeFile(entrypoint, 'export const version = "active-commit-progress";\n');
			expect((await build()).exitCode).toBe(0);
			const updated = await fs.readFile(output, "utf8");
			expect(updated).toContain("active-commit-progress");
			expect(updated).not.toContain("first-worker");
			await fs.writeFile(entrypoint, "export const = invalid;\n");
			expect((await build()).exitCode).not.toBe(0);
			expect(await fs.stat(output).catch(() => undefined)).toBeUndefined();
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
