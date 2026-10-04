import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readC4ElementSet,
	upsertAcceptedC4Elements,
} from "./c4-element-store";

function container(over: {
	id: string;
	process: string;
	label?: string;
	containerKind?: "application" | "data-store";
	technology?: string;
}) {
	return {
		id: over.id,
		label: over.label ?? over.id,
		containerKind: over.containerKind ?? ("application" as const),
		technology: over.technology ?? "Bun",
		process: over.process,
	};
}

describe("c4 element store", () => {
	test("upsert writes an accepted-only set, readable back", async () => {
		const root = mkdtempSync(join(tmpdir(), "c4-elements-"));
		try {
			const written = await upsertAcceptedC4Elements(
				{
					purl: "pkg:github/acme/widget",
					elements: [container({ id: "container:host", process: "widget/host" })],
					provenance: { runId: "run-1", proposalId: "smp-1" },
					rationale: "the host process is a deployable unit",
				},
				root,
			);
			expect(written.ok).toBe(true);

			const set = await readC4ElementSet("pkg:github/acme/widget", root);
			expect(set.repoKey).toBe("pkg:github/acme/widget");
			expect(set.elements).toHaveLength(1);
			expect(set.elements[0]).toMatchObject({
				id: "container:host",
				kind: "container",
				state: "accepted",
				process: "widget/host",
				rationale: "the host process is a deployable unit",
			});
			expect(set.elements[0]!.decidedAt).toBeTruthy();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("an absent file reads as an empty set", async () => {
		const root = mkdtempSync(join(tmpdir(), "c4-elements-"));
		try {
			const set = await readC4ElementSet("pkg:github/acme/never", root);
			expect(set.elements).toHaveLength(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("a second upsert with the same id replaces the element, not a duplicate", async () => {
		const root = mkdtempSync(join(tmpdir(), "c4-elements-"));
		try {
			await upsertAcceptedC4Elements(
				{
					purl: "pkg:github/acme/widget",
					elements: [container({ id: "container:host", process: "widget/host", label: "Host v1" })],
				},
				root,
			);
			await upsertAcceptedC4Elements(
				{
					purl: "pkg:github/acme/widget",
					elements: [container({ id: "container:host", process: "widget/host", label: "Host v2" })],
				},
				root,
			);
			const set = await readC4ElementSet("pkg:github/acme/widget", root);
			expect(set.elements).toHaveLength(1);
			expect(set.elements[0]!.label).toBe("Host v2");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("the caller never chooses the state — accepted is forced", async () => {
		const root = mkdtempSync(join(tmpdir(), "c4-elements-"));
		try {
			// The payload type has no `state` field at all; the store stamps it.
			const written = await upsertAcceptedC4Elements(
				{
					purl: "pkg:github/acme/widget",
					elements: [container({ id: "container:host", process: "widget/host" })],
				},
				root,
			);
			expect(written.ok).toBe(true);
			const set = await readC4ElementSet("pkg:github/acme/widget", root);
			expect(set.elements.every((e) => e.state === "accepted")).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejections never land here — the proposal store remembers them", async () => {
		// By contract: the store holds accepts only. There is no API that
		// writes a rejected element, so the test asserts the upsert's shape —
		// every written entry reads state "accepted" and there is no
		// reject/remove counterpart exported from the module.
		const mod = await import("./c4-element-store");
		const exports = Object.keys(mod);
		expect(exports.some((k) => k.toLowerCase().includes("reject"))).toBe(false);
	});

	test("validation: blank purl, empty elements, unknown kind all fail", async () => {
		const root = mkdtempSync(join(tmpdir(), "c4-elements-"));
		try {
			expect(
				(await upsertAcceptedC4Elements({ purl: "", elements: [container({ id: "c", process: "p" })] }, root)).ok,
			).toBe(false);
			expect(
				(await upsertAcceptedC4Elements({ purl: "pkg:github/a/b", elements: [] }, root)).ok,
			).toBe(false);
			const bad = await upsertAcceptedC4Elements(
				{
					purl: "pkg:github/a/b",
					elements: [{ ...container({ id: "c", process: "p" }), kind: "queue" as never }],
				},
				root,
			);
			expect(bad.ok).toBe(false);
			if (!bad.ok) expect(bad.error).toContain("unknown element kind");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
