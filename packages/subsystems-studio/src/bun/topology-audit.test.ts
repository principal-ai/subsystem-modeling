import { describe, expect, test } from "bun:test";
import type { SubsystemComponent, SubsystemRelation } from "@principal-ai/subsystems-core";
import type { GraphifyEdge, GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import {
	auditTopologyRelations,
	graphifyHasRelationBetween,
} from "./topology-audit";

function node(
	id: string,
	label: string,
	source_file: string,
): GraphifyNode {
	return {
		id,
		label,
		file_type: "code",
		source_file,
		source_location: "L1",
	};
}

function edge(
	source: string,
	target: string,
	relation: string,
): GraphifyEdge {
	return {
		source,
		target,
		relation,
		confidence: "EXTRACTED",
		source_file: "a.ts",
	};
}

describe("graphifyHasRelationBetween", () => {
	test("method is directed class → method", () => {
		const allowed = new Set(["method"]);
		const edges = [edge("Class", "write", "method")];
		expect(
			graphifyHasRelationBetween(edges, "Class", "write", allowed, false),
		).toBe(true);
		expect(
			graphifyHasRelationBetween(edges, "write", "Class", allowed, false),
		).toBe(false);
	});

	test("inherits matches model extends", () => {
		const allowed = new Set(["inherits"]);
		expect(
			graphifyHasRelationBetween(
				[edge("Child", "Parent", "inherits")],
				"Child",
				"Parent",
				allowed,
				false,
			),
		).toBe(true);
	});
});

describe("auditTopologyRelations", () => {
	const components: SubsystemComponent[] = [
		{
			alias: "app",
			name: "App",
			construct: "function",
			symbol: "App",
			file: "src/App.tsx",
			purl: "pkg:github/acme/app",
		},
		{
			alias: "xyflow",
			name: "@xyflow/react",
			construct: "external",
			file: "",
			purl: "external",
		},
		{
			alias: "helper",
			name: "helper",
			construct: "function",
			symbol: "helper",
			file: "src/helper.ts",
			purl: "pkg:github/acme/app",
		},
		{
			alias: "store",
			name: "SessionStore",
			construct: "class",
			symbol: "SessionStore",
			file: "src/store.ts",
			purl: "pkg:github/acme/app",
		},
		{
			alias: "write",
			name: "write",
			construct: "method",
			symbol: "write",
			file: "src/store.ts",
			purl: "pkg:github/acme/app",
		},
		{
			alias: "child",
			name: "Child",
			construct: "class",
			symbol: "Child",
			file: "src/child.ts",
			purl: "pkg:github/acme/app",
		},
		{
			alias: "parent",
			name: "Parent",
			construct: "class",
			symbol: "Parent",
			file: "src/parent.ts",
			purl: "pkg:github/acme/app",
		},
	];

	test("flags broken endpoints as issues", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-bad",
				from: "app",
				to: "missing",
				relationType: "method",
			},
		];
		const r = auditTopologyRelations(components, relations, new Map());
		expect(r.summary.brokenEndpoints).toBe(1);
		expect(r.findings[0]?.kind).toBe("topology_broken_endpoint");
		expect(r.checks[0]?.verdict).toBe("issue");
	});

	test("external targets are a soft gap, never fuzzy-confirmed", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-ext",
				from: "app",
				to: "xyflow",
				relationType: "method",
			},
		];
		// Even with a Graphify edge whose label matches the external, the audit
		// does not fuzzy-match external targets — that judgment is the agent's.
		const bundle = {
			nodes: [
				node("src_App", "App", "src/App.tsx"),
				node("pkg_xyflow", "@xyflow/react", ""),
			],
			edges: [edge("src_App", "pkg_xyflow", "method")],
		};
		const r = auditTopologyRelations(
			components,
			relations,
			new Map([["pkg:github/acme/app", bundle]]),
		);
		expect(r.summary.softConfirmed).toBe(0);
		expect(r.summary.softUnconfirmed).toBe(1);
		expect(r.checks[0]?.verdict).toBe("gap");
		expect(r.checks[0]?.note).toContain("external");
		expect(r.findings[0]?.kind).toBe("topology_relation_unconfirmed");
		expect(r.findings[0]?.severity).toBe("info");
	});

	test("soft-confirms method when Graphify has class → method", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-m",
				from: "store",
				to: "write",
				relationType: "method",
			},
		];
		const bundle = {
			nodes: [
				node("src_store_SessionStore", "SessionStore", "src/store.ts"),
				node("src_store_SessionStore_write", "write()", "src/store.ts"),
			],
			edges: [
				edge(
					"src_store_SessionStore",
					"src_store_SessionStore_write",
					"method",
				),
			],
		};
		const r = auditTopologyRelations(
			components,
			relations,
			new Map([["pkg:github/acme/app", bundle]]),
		);
		expect(r.summary.softConfirmed).toBe(1);
		expect(r.checks[0]?.graphify).toBe("confirmed");
		expect(r.findings).toEqual([]);
	});

	test("unconfirmed method is a soft gap", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-m",
				from: "store",
				to: "write",
				relationType: "method",
			},
		];
		const bundle = {
			nodes: [
				node("src_store_SessionStore", "SessionStore", "src/store.ts"),
				node("src_store_SessionStore_write", "write()", "src/store.ts"),
			],
			edges: [] as GraphifyEdge[],
		};
		const r = auditTopologyRelations(
			components,
			relations,
			new Map([["pkg:github/acme/app", bundle]]),
		);
		expect(r.summary.softUnconfirmed).toBe(1);
		expect(r.checks[0]?.verdict).toBe("gap");
		expect(r.findings[0]?.kind).toBe("topology_relation_unconfirmed");
	});

	test("soft-confirms extends via Graphify inherits", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-ext",
				from: "child",
				to: "parent",
				relationType: "extends",
			},
		];
		const bundle = {
			nodes: [
				node("src_child_Child", "Child", "src/child.ts"),
				node("src_parent_Parent", "Parent", "src/parent.ts"),
			],
			edges: [edge("src_child_Child", "src_parent_Parent", "inherits")],
		};
		const r = auditTopologyRelations(
			components,
			relations,
			new Map([["pkg:github/acme/app", bundle]]),
		);
		expect(r.summary.softConfirmed).toBe(1);
		expect(r.checks[0]?.note).toContain("extends");
	});

	test("missing Graphify cache yields a soft gap", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-m",
				from: "store",
				to: "write",
				relationType: "method",
			},
		];
		const r = auditTopologyRelations(components, relations, new Map());
		expect(r.summary.softChecked).toBe(1);
		expect(r.summary.softUnconfirmed).toBe(1);
		expect(r.checks[0]?.graphify).toBe("unavailable");
		expect(r.checks[0]?.verdict).toBe("gap");
	});

	test("accepted relation augmentation confirms soft gap", () => {
		const relations: SubsystemRelation[] = [
			{
				id: "r-m",
				from: "store",
				to: "write",
				relationType: "method",
			},
		];
		const bundle = {
			nodes: [
				node("src_store_SessionStore", "SessionStore", "src/store.ts"),
				node("src_store_SessionStore_write", "write()", "src/store.ts"),
			],
			edges: [] as GraphifyEdge[],
		};
		const r = auditTopologyRelations(
			components,
			relations,
			new Map([["pkg:github/acme/app", bundle]]),
			{ augmentedRelationIds: new Set(["r-m"]) },
		);
		expect(r.summary.softConfirmed).toBe(1);
		expect(r.summary.softUnconfirmed).toBe(0);
		expect(r.checks[0]?.verdict).toBe("ok");
		expect(r.checks[0]?.graphify).toBe("confirmed");
		expect(r.checks[0]?.note).toContain("augmented");
		expect(r.findings).toEqual([]);
	});
});
