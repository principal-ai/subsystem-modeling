import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
	deprecateComponentFixFromVerify,
	detectRemovedComponentFile,
} from "./verify-subsystem-component";

function git(dir: string, args: string[]): string {
	const r = spawnSync("git", ["-C", dir, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return r.stdout;
}

function commit(dir: string, message: string): void {
	const r = spawnSync("git", ["-C", dir, "commit", "-qam", message], {
		encoding: "utf8",
	});
	if (r.status !== 0) throw new Error(`commit ${message}: ${r.stderr}`);
}

/** A repo with `src/gone.ts` present, then deleted in a named commit. */
function repoWithDeletedFile(): { dir: string; removing: string } {
	const dir = mkdtempSync(join(tmpdir(), "deprecate-"));
	git(dir, ["init", "-q", "."]);
	git(dir, ["config", "user.email", "t@t"]);
	git(dir, ["config", "user.name", "t"]);
	writeFileSync(join(dir, "src-gone.ts"), "export const x = 1;\n");
	git(dir, ["add", "-A"]);
	git(dir, ["commit", "-qm", "add gone"]);
	spawnSync("git", ["-C", dir, "rm", "-q", "src-gone.ts"], { encoding: "utf8" });
	commit(dir, "Remove topology relations");
	const removing = git(dir, ["rev-parse", "HEAD"]).trim();
	return { dir, removing };
}

const base = {
	componentFile: "src-gone.ts",
	fileExists: false as const,
	hasFileSuggest: false,
	hasFileCandidates: false,
};

describe("detectRemovedComponentFile", () => {
	test("deprecates a file git tracks as deleted, with provenance", async () => {
		const { dir, removing } = repoWithDeletedFile();
		const removal = await detectRemovedComponentFile({
			...base,
			repoRoot: dir,
		});
		expect(removal?.commit).toBe(removing.slice(0, 7));
		expect(removal?.reason).toBe("Remove topology relations");
	});

	test("does not deprecate when Graphify found a relocate", async () => {
		const { dir } = repoWithDeletedFile();
		expect(
			await detectRemovedComponentFile({
				...base,
				repoRoot: dir,
				hasFileSuggest: true,
			}),
		).toBeUndefined();
		expect(
			await detectRemovedComponentFile({
				...base,
				repoRoot: dir,
				hasFileCandidates: true,
			}),
		).toBeUndefined();
	});

	test("does not deprecate a path git never tracked (a typo, not a removal)", async () => {
		const { dir } = repoWithDeletedFile();
		expect(
			await detectRemovedComponentFile({
				...base,
				componentFile: "src/never-existed.ts",
				repoRoot: dir,
			}),
		).toBeUndefined();
	});

	test("does not deprecate a file that exists, or with no repo root", async () => {
		const { dir } = repoWithDeletedFile();
		expect(
			await detectRemovedComponentFile({
				...base,
				repoRoot: dir,
				fileExists: true,
			}),
		).toBeUndefined();
		expect(
			await detectRemovedComponentFile({ ...base, repoRoot: undefined }),
		).toBeUndefined();
	});
});

describe("deprecateComponentFixFromVerify", () => {
	test("labels the one-click fix with the removal commit", () => {
		const fix = deprecateComponentFixFromVerify({
			commit: "e168afc",
			reason: "Remove topology relations",
		});
		expect(fix.id).toBe("deprecate_component");
		expect(fix.label).toContain("e168afc");
		expect(fix.removal.commit).toBe("e168afc");
	});
});
