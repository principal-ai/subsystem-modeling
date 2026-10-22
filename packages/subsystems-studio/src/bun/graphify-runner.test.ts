import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { graphifyFailureReason, loadGraphifyGraph, runGraphifyExtract } from "./graphify-runner";

const empty = "[graphify extract] graph is empty — extraction produced no nodes. Possible causes: all files skipped, binary-only corpus, or LLM returned no edges.\n";
const scan = "[graphify extract] found 0 code, 0 docs, 0 papers, 0 images\n";
let root: string;
let next = 0;

beforeAll(async () => { root = await fs.mkdtemp(join(tmpdir(), "graphify-runner-test-")); });
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

async function cli(stdout: string, stderr = empty, exitCode = 1, graph?: string) {
	const bin = join(root, `graphify-${next++}`);
	await fs.writeFile(bin, `#!${process.execPath}
${graph === undefined ? "" : `await Bun.write(process.env.GRAPHIFY_OUT + "/graph.json", ${JSON.stringify(graph)});`}
process.stdout.write(${JSON.stringify(stdout)});
process.stderr.write(${JSON.stringify(stderr)});
process.exit(${exitCode});
`);
	await fs.chmod(bin, 0o700);
	return bin;
}

describe("Graphify empty-code extraction", () => {
	test("accepts an explicitly enabled zero-code scan and retains file-level coverage limits", async () => {
		const bin = await cli(scan +
			"[graphify extract] 7 file(s) not classified (no supported extension or shebang), skipped: flake.nix\n" +
			"[graphify extract] 1 file(s) skipped as potentially sensitive (rename or move if wrongly flagged): .envrc\n");
		const result = await runGraphifyExtract({ repoRoot: root, bin, allowEmptyCode: true, isolatedOutput: true });
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error);
		expect(result.emptyCode).toEqual({ unclassifiedFiles: 7, sensitiveFiles: 1 });
		expect(result.nodeCount).toBe(0);
		expect(loadGraphifyGraph(result.graphJsonPath)).toEqual({ nodes: [], links: [] });
		await fs.rm(result.outDir, { recursive: true, force: true });
	});

	test("does not opt other graph consumers into empty snapshots", async () => {
		const bin = await cli(scan);
		for (const options of [{}, { allowEmptyCode: true, codeOnly: false }]) {
			const result = await runGraphifyExtract({ repoRoot: root, bin, isolatedOutput: true, ...options });
			expect(result.ok).toBe(false);
		}
	});

	test("keeps parser crashes, nonzero-code scans and ambiguous failures blocking", async () => {
		for (const [stdout, stderr, code, graph] of [
			[scan.replace("0 code", "1 code"), empty, 1],
			["", empty, 1],
			[scan + scan, empty, 1],
			[scan, empty + "RuntimeError: parser failed\n", 1],
			[scan, "PermissionError: access denied\n", 1],
			[scan, empty, 2],
			[scan, empty, 0],
			[scan, empty, 1, '{"nodes":[]}'],
		] as Array<[string, string, number, string?]>) {
			const bin = await cli(stdout, stderr, code, graph);
			const result = await runGraphifyExtract({ repoRoot: root, bin, allowEmptyCode: true, isolatedOutput: true });
			expect(result.ok).toBe(false);
		}
	});

	test("reports useful controlled diagnostics without persisting arbitrary CLI output", () => {
		expect(graphifyFailureReason({
			ok: false, error: "graphify extract exited 1", exitCode: 1,
			stderr: "Traceback at /private/path\nModuleNotFoundError: No module named 'tree_sitter_zig'", durationMs: 1,
		})).toBe("Graphify is missing Python module tree_sitter_zig (exit 1)");
		const reason = graphifyFailureReason({
			ok: false, error: "graphify extract exited 1", exitCode: 1,
			stderr: "RuntimeError: private-source-or-secret", durationMs: 1,
		});
		expect(reason).toBe("Graphify failed with RuntimeError (exit 1)");
		expect(reason).not.toContain("private-source");
	});
});
