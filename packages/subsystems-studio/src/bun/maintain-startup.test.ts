import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("records a failed maintenance preamble even when no stage or session starts", async () => {
	const home = await mkdtemp(join(tmpdir(), "maintain-startup-"));
	try {
		const modulePath = join(import.meta.dir, "maintain-model.ts");
		const proc = Bun.spawn({
			cmd: [process.execPath, "--eval", `
				import { maintainSubsystemModelSequence } from ${JSON.stringify(modulePath)};
				const result = await maintainSubsystemModelSequence("sg-missing", { model: "test/model" });
				console.log(JSON.stringify(result));
			`],
			env: { ...process.env, HOME: home },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(stderr).toBe("");
		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toMatchObject({
			ok: false, stages: [], error: "unknown graph: sg-missing",
		});
		const file = JSON.parse(await readFile(
			join(home, ".principal", "subsystem-model-runs", "sg-missing.json"), "utf8",
		));
		expect(file.runs).toHaveLength(1);
		expect(file.runs[0]).toMatchObject({
			status: "error", model: "test/model", error: "unknown graph: sg-missing",
		});
		expect(file.runs[0].sessionId).toBeUndefined();
		expect(file.runs[0].startedAt).toBeDefined();
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
