import { describe, expect, test } from "bun:test";
import type {
	SubsystemComponent,
	SubsystemComponentEdge,
} from "@principal-ai/subsystems-react";
import {
	centerExcalidrawElements,
	layoutSubsystemForExcalidraw,
	principalMetaForComponent,
	principalMetaForEdge,
} from "./subsystemToExcalidraw";

const components: SubsystemComponent[] = [
	{
		id: "src",
		name: "Parser",
		kind: "class",
		file: "parser.ts",
		purl: "pkg:github/example/repo",
		purpose: "parses input",
		symbol: "Parser",
		layer: 1,
	},
	{
		id: "dst",
		name: "Reader",
		kind: "class",
		file: "reader.ts",
		purl: "pkg:github/example/repo",
		purpose: "reads sessions",
		symbol: "Reader",
		layer: 2,
	},
];

const edges: SubsystemComponentEdge[] = [
	{ id: "e0", from: "src", to: "dst", mechanism: "imports" },
];

describe("layoutSubsystemForExcalidraw", () => {
	test("places both nodes and keeps the edge", async () => {
		const laid = await layoutSubsystemForExcalidraw(components, edges);
		expect(laid.nodes.map((n) => n.id).sort()).toEqual(["dst", "src"]);
		expect(laid.edges).toHaveLength(1);
		expect(laid.edges[0]?.from).toBe("src");
		expect(laid.edges[0]?.to).toBe("dst");
		const xs = laid.nodes.map((n) => n.x);
		expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
	});

	test("centerExcalidrawElements puts the group on the origin", () => {
		const out = centerExcalidrawElements([
			{ id: "a", x: 100, y: 40, width: 100, height: 40 },
			{ id: "b", x: 300, y: 40, width: 100, height: 40 },
		]);
		const minX = Math.min(...out.map((e) => e.x));
		const maxX = Math.max(...out.map((e) => e.x + e.width));
		const minY = Math.min(...out.map((e) => e.y));
		const maxY = Math.max(...out.map((e) => e.y + e.height));
		expect((minX + maxX) / 2).toBeCloseTo(0);
		expect((minY + maxY) / 2).toBeCloseTo(0);
	});

	test("principalMetaForComponent keeps identity fields and drops empties", () => {
		const meta = principalMetaForComponent(components[0]!);
		expect(meta).toEqual({
			type: "subsystem-component",
			id: "src",
			name: "Parser",
			kind: "class",
			file: "parser.ts",
			purl: "pkg:github/example/repo",
			symbol: "Parser",
			purpose: "parses input",
			layer: 1,
		});
		expect("capture" in meta).toBe(false);
	});

	test("principalMetaForEdge stores resolved endpoints and refs", () => {
		expect(
			principalMetaForEdge({
				id: "e0",
				from: "src",
				to: "dst",
				mechanism: "imports",
				refs: ["parser.ts"],
				points: [],
			}),
		).toEqual({
			type: "subsystem-edge",
			id: "e0",
			from: "src",
			to: "dst",
			mechanism: "imports",
			refs: ["parser.ts"],
		});
	});

	test("creates an external stub for unknown targets", async () => {
		const laid = await layoutSubsystemForExcalidraw(components, [
			{ id: "e-ext", from: "src", to: "outside-pipeline", mechanism: "registers-into" },
		]);
		expect(laid.nodes.some((n) => n.id === "external:outside-pipeline")).toBe(true);
		expect(laid.edges[0]?.to).toBe("external:outside-pipeline");
	});
});
