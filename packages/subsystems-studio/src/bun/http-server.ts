/**
 * HTTP server for agent ↔ principal-studio communication.
 *
 * Runs alongside the Unix socket IPC server on a configurable port
 * (default 3045, override via `PRINCIPAL_STUDIO_HTTP_PORT`). Provides a
 * REST API for subsystem graphs and graphify knowledge graphs so agents
 * can POST diagrams, ensure code graphs, list stored graphs, and open tabs.
 *
 * Uses Bun.serve — zero new dependencies.
 */

import { existsSync, readFileSync } from "node:fs";
import {
	getGraphifyStatus,
	installGraphify,
	isGraphifyNotInstalledError,
	loadGraphifyGraph,
} from "./graphify-runner";
import {
	ensureGraphifyGraph,
	listGraphifyGraphs,
	listGraphifyRepos,
} from "./graphify-store";
import {
	createSubsystemModel,
	findComponentConstructProblems,
	findDetailProvenanceProblems,
	findEdgeMechanismProblems,
	findThroughlineProblems,
	getSubsystemModel,
	listSubsystemModels,
	normalizeDetailProvenance,
	subsystemModelFilePath,
	updateSubsystemModel,
	type StoredSubsystemModel,
	type SubsystemModelDocument,
} from "./subsystem-model-store";

const PORT = Number(process.env["PRINCIPAL_STUDIO_HTTP_PORT"] ?? 3045);

/** Callback invoked when an agent requests a graph be opened in a tab. */
export type OpenGraphTabHandler = (id: string) => Promise<{ ok: boolean; error?: string; tabId?: string }>;

/** Callback invoked when an agent deletes a graph (bridged so the host can
 *  close tabs rendering it before the record disappears). */
export type DeleteGraphHandler = (id: string) => Promise<{ ok: boolean; error?: string }>;

let server: ReturnType<typeof Bun.serve> | null = null;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
	});
}

function error(message: string, status = 400, extra?: Record<string, unknown>): Response {
	return json({ ok: false, error: message, ...extra }, status);
}

async function parseBody(req: Request): Promise<unknown> {
	try {
		return await req.json();
	} catch {
		return null;
	}
}

/** Guard for the per-repo local-root map: all keys/values must be strings. */
function isRepoRoots(v: unknown): v is Record<string, string> {
	if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
	return Object.values(v).every((root) => typeof root === "string");
}

function ensureFailResponse(result: { error: string; durationMs: number }): Response {
	const notInstalled = isGraphifyNotInstalledError(result.error);
	return error(
		result.error,
		notInstalled ? 503 : 400,
		{
			code: notInstalled ? "graphify_not_installed" : "ensure_failed",
			installCommand: notInstalled ? getGraphifyStatus().installCommand : undefined,
			durationMs: result.durationMs,
		},
	);
}

async function handleGraphifyRequest(req: Request, url: URL, method: string): Promise<Response | null> {
	const path = url.pathname;

	if (path === "/api/graphify/status" && method === "GET") {
		const detailed = url.searchParams.get("detailed") === "1";
		const status = detailed
			? await (await import("./graphify-runner")).getGraphifyStatusDetailed()
			: getGraphifyStatus();
		return json({ ok: true, ...status });
	}

	if (path === "/api/graphify/install" && method === "POST") {
		const result = await installGraphify();
		if (!result.ok) {
			return error(result.error ?? "install failed", 500, {
				code: "install_failed",
				stdout: result.stdout,
				stderr: result.stderr,
			});
		}
		return json({ ok: true, ...getGraphifyStatus(), bin: result.bin });
	}

	if (path === "/api/graphify-graph" && method === "GET") {
		const graphs = await listGraphifyGraphs();
		return json({ ok: true, graphs });
	}

	if (path === "/api/graphify/repos" && method === "GET") {
		const repos = await listGraphifyRepos();
		return json({ ok: true, repos, graphify: getGraphifyStatus() });
	}

	if (path === "/api/graphify-graph/ensure" && method === "POST") {
		const body = (await parseBody(req)) as Record<string, unknown> | null;
		if (!body) return error("Invalid JSON body");
		if (typeof body["purl"] !== "string" || !body["purl"].trim()) {
			return error("purl is required");
		}
		const result = await ensureGraphifyGraph({
			purl: body["purl"],
			repoRoot: typeof body["repoRoot"] === "string" ? body["repoRoot"] : undefined,
			force: body["force"] === true,
			bin: typeof body["bin"] === "string" ? body["bin"] : undefined,
		});
		if (!result.ok) return ensureFailResponse(result);
		return json({
			ok: true,
			status: result.status,
			purl: result.purl,
			headSha: result.headSha,
			dirtyHash: result.dirtyHash,
			slotKey: result.slotKey,
			repoRoot: result.repoRoot,
			graphJsonPath: result.graphJsonPath,
			nodeCount: result.nodeCount,
			edgeCount: result.edgeCount,
			durationMs: result.durationMs,
			meta: result.meta,
		});
	}

	// Ensure (if needed) then return raw graph.json for the current purl identity.
	if (path === "/api/graphify-graph/raw" && method === "GET") {
		const purl = url.searchParams.get("purl")?.trim();
		if (!purl) return error("purl query param is required");
		const repoRoot = url.searchParams.get("repoRoot")?.trim() || undefined;
		const cacheOnly = url.searchParams.get("cacheOnly") === "1";
		const force = url.searchParams.get("force") === "1";

		if (cacheOnly) {
			const listed = await listGraphifyGraphs();
			const key = purl.split("#")[0]?.trim() ?? purl;
			const hit = listed.find((g) => g.purlKey === key || g.purl === key);
			if (!hit || !existsSync(hit.graphJsonPath)) {
				return error("no cached graph for purl", 404, { code: "cache_miss" });
			}
			const body = readFileSync(hit.graphJsonPath);
			return new Response(body, {
				status: 200,
				headers: {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": "*",
					"X-Graphify-Path": hit.graphJsonPath,
					"X-Graphify-Slot": hit.slotKey,
				},
			});
		}

		const result = await ensureGraphifyGraph({ purl, repoRoot, force });
		if (!result.ok) return ensureFailResponse(result);
		const body = readFileSync(result.graphJsonPath);
		return new Response(body, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
				"X-Graphify-Status": result.status,
				"X-Graphify-Path": result.graphJsonPath,
				"X-Graphify-Slot": result.slotKey,
				"X-Graphify-Head": result.headSha,
				...(result.dirtyHash ? { "X-Graphify-Dirty": result.dirtyHash } : {}),
			},
		});
	}

	return null;
}

/**
 * Route handler for subsystem graph API requests.
 *
 * Handles CRUD operations on subsystem graphs and opens graphs in tabs.
 * Called by the HTTP server's fetch callback.
 */
export async function handleSubsystemModelRequest(
	req: Request,
	onOpenTab: OpenGraphTabHandler,
	onDeleteGraph: DeleteGraphHandler,
): Promise<Response> {
	const url = new URL(req.url);
	// Alias legacy /api/subsystem-graph* → /api/subsystem-model* (skills mid-flip).
	const path = url.pathname.replace(
		/^\/api\/subsystem-graph(?=\/|$)/,
		"/api/subsystem-model",
	);
	const method = req.method;

	// CORS preflight
	if (method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			},
		});
	}

	// Health check
	if (path === "/health" && method === "GET") {
		return json({ status: "ok", graphify: getGraphifyStatus() });
	}

	const graphify = await handleGraphifyRequest(req, url, method);
	if (graphify) return graphify;

	// --- Subsystem graphs ---

	// List all graphs
	if (path === "/api/subsystem-model" && method === "GET") {
		const graphs = await listSubsystemModels();
		return json({
			ok: true,
			graphs: graphs.map((g) => ({
				...g,
				path: subsystemModelFilePath(g.id),
			})),
		});
	}

	// Create a new graph
	if (path === "/api/subsystem-model" && method === "POST") {
		const body = (await parseBody(req)) as Record<string, unknown> | null;
		if (!body) return error("Invalid JSON body");
		if (!body["title"] || typeof body["title"] !== "string") return error("title is required");
		if (!Array.isArray(body["components"])) return error("components array is required");
		if (!Array.isArray(body["edges"])) return error("edges array is required");
		const problems = [
			...findComponentConstructProblems(body["components"]),
			...findDetailProvenanceProblems(body["components"]),
			...findEdgeMechanismProblems(body["edges"]),
			...findThroughlineProblems(body["edges"], body["throughlines"]),
		];
		if (problems.length > 0) return error(`invalid graph: ${problems.join("; ")}`);
		normalizeDetailProvenance(body["components"]);

		const record = await createSubsystemModel({
			title: body["title"] as string,
			description: typeof body["description"] === "string" ? body["description"] : undefined,
			components: body["components"] as SubsystemModelDocument["components"],
			edges: body["edges"] as SubsystemModelDocument["edges"],
			throughlines: body["throughlines"] as StoredSubsystemModel["throughlines"],
			source: typeof body["source"] === "string" ? body["source"] : undefined,
			repo: body["repo"] as { owner: string; name: string } | undefined,
			repoRoot: typeof body["repoRoot"] === "string" ? body["repoRoot"] : undefined,
			repoRoots: isRepoRoots(body["repoRoots"]) ? body["repoRoots"] : undefined,
		});
		return json({ ok: true, graph: record }, 201);
	}

	// Verify all components of a graph (host-side verify machinery)
	const graphVerifyMatch = path.match(/^\/api\/subsystem-model\/([^/]+)\/verify$/);
	if (graphVerifyMatch && method === "GET") {
		const id = graphVerifyMatch[1];
		const { verifySubsystemModel } = await import("./verify-subsystem-component");
		const result = await verifySubsystemModel(id);
		if (!result.ok) return error(result.error, 404);
		return json({ ok: true, ...result.data });
	}

	// Verify a single component of a graph
	const componentVerifyMatch = path.match(
		/^\/api\/subsystem-model\/([^/]+)\/verify\/([^/]+)$/,
	);
	if (componentVerifyMatch && method === "GET") {
		const id = componentVerifyMatch[1];
		const componentId = componentVerifyMatch[2];
		const { verifySubsystemComponent } = await import("./verify-subsystem-component");
		const result = await verifySubsystemComponent(id, componentId);
		return json(result);
	}

	// Get / Open / Update / Delete by id
	const graphMatch = path.match(/^\/api\/subsystem-model\/([^/]+)$/);
	if (graphMatch) {
		const id = graphMatch[1];

		if (method === "GET") {
			const graph = await getSubsystemModel(id);
			if (!graph) return error("Graph not found", 404);
			return json({ ok: true, graph });
		}

		if (method === "PUT") {
			const body = (await parseBody(req)) as Record<string, unknown> | null;
			if (!body) return error("Invalid JSON body");
			const problems = [
				...(body["components"] !== undefined ? findComponentConstructProblems(body["components"]) : []),
				...(body["components"] !== undefined ? findDetailProvenanceProblems(body["components"]) : []),
				...(body["edges"] !== undefined ? findEdgeMechanismProblems(body["edges"]) : []),
				...(body["throughlines"] !== undefined ? findThroughlineProblems(body["edges"], body["throughlines"]) : []),
			];
			if (problems.length > 0) return error(`invalid graph: ${problems.join("; ")}`);
			if (body["components"] !== undefined) normalizeDetailProvenance(body["components"]);
			const updated = await updateSubsystemModel(id, body as Parameters<typeof updateSubsystemModel>[1]);
			if (!updated) return error("Graph not found", 404);
			return json({ ok: true, graph: updated });
		}

		if (method === "DELETE") {
			const deleted = await onDeleteGraph(id);
			if (!deleted) return error("Graph not found", 404);
			return json({ ok: true });
		}
	}

	// Open a graph in a tab
	if (path === "/api/subsystem-model/open" && method === "POST") {
		const body = (await parseBody(req)) as { id?: string } | null;
		if (!body?.id) return error("id is required");
		const result = await onOpenTab(body.id);
		return json(result);
	}

	return error("Not found", 404);
}

/**
 * Start the HTTP server. `onOpenTab` is called when an agent wants to open
 * a graph in the viewer (the host bridges it to the renderer via RPC).
 */
export function startHttpServer(onOpenTab: OpenGraphTabHandler, onDeleteGraph: DeleteGraphHandler): void {
	server = Bun.serve({
		port: PORT,
		hostname: "127.0.0.1",
		async fetch(req) {
			return handleSubsystemModelRequest(req, onOpenTab, onDeleteGraph);
		},
	});

	console.log(`[principal-studio] HTTP server listening at http://127.0.0.1:${PORT}`);
}

/** Stop the HTTP server (called on SIGINT/SIGTERM). */
export function stopHttpServer(): void {
	server?.stop();
	server = null;
}

/** Exported for tests — parse a graphify graph.json from disk. */
export function readGraphifyGraphFile(path: string) {
	return loadGraphifyGraph(path);
}
