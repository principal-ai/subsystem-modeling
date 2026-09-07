import { describe, expect, test } from "bun:test";
import {
	excalidrawSceneToSubsystemModel,
	resolveExcalidrawSelection,
} from "./excalidrawToSubsystem";
import {
	PRINCIPAL_META_KEY,
	principalMetaForComponent,
	principalMetaForEdge,
} from "./subsystemToExcalidraw";
import type { SubsystemComponent } from "@principal-ai/subsystems-react";

const parser: SubsystemComponent = {
	id: "src",
	name: "Parser",
	kind: "class",
	file: "parser.ts",
	purl: "pkg:github/example/repo",
	purpose: "parses input",
	symbol: "Parser",
	layer: 1,
};

describe("excalidrawSceneToSubsystemModel", () => {
	test("rebuilds components and edges from customData.principal", () => {
		const scene = {
			appState: { name: "Round-trip" },
			elements: [
				{
					id: "src",
					type: "rectangle",
					customData: { [PRINCIPAL_META_KEY]: principalMetaForComponent(parser) },
				},
				{
					id: "src-label",
					type: "text",
					containerId: "src",
					text: "Parser",
				},
				{
					id: "e0",
					type: "arrow",
					isDeleted: false,
					customData: {
						[PRINCIPAL_META_KEY]: principalMetaForEdge({
							id: "e0",
							from: "src",
							to: "dst",
							mechanism: "imports",
							refs: ["parser.ts"],
							points: [],
						}),
					},
				},
				{ id: "doodle", type: "freedraw" },
				{ id: "gone", type: "rectangle", isDeleted: true, customData: { principal: { type: "subsystem-component", id: "gone" } } },
			],
		};

		const graph = excalidrawSceneToSubsystemModel(scene);
		expect(graph.title).toBe("Round-trip");
		expect(graph.components).toHaveLength(1);
		expect(graph.components[0]).toMatchObject({
			id: "src",
			kind: "class",
			file: "parser.ts",
			symbol: "Parser",
			layer: 1,
		});
		expect(graph.edges).toEqual([
			{ id: "e0", from: "src", to: "dst", mechanism: "imports", refs: ["parser.ts"] },
		]);
	});

	test("resolveExcalidrawSelection follows bound text to the rectangle", () => {
		const elements = [
			{
				id: "src",
				type: "rectangle",
				customData: { [PRINCIPAL_META_KEY]: principalMetaForComponent(parser) },
			},
			{ id: "src-label", type: "text", containerId: "src", text: "Parser" },
		];
		const fromBox = resolveExcalidrawSelection(elements, { src: true });
		expect(fromBox?.label).toBe("Parser");
		expect(fromBox?.principal?.["type"]).toBe("subsystem-component");
		const fromLabel = resolveExcalidrawSelection(elements, { "src-label": true });
		expect(fromLabel?.elementId).toBe("src");
		expect(fromLabel?.principal?.["file"]).toBe("parser.ts");
	});

	test("resolveExcalidrawSelection is null when nothing is selected", () => {
		expect(resolveExcalidrawSelection([], {})).toBeNull();
	});
});
