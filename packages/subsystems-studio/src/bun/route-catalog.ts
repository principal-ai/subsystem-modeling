/**
 * Route discovery for the Studio HTTP bridge.
 *
 * Mirrors the desktop app's `GET /routes` / `POST /routes` contract: the GET
 * index is enough for an agent to find an endpoint, and the POST lookup returns
 * the full request/response contract for exact route patterns. The catalog is
 * maintained by hand; add a route here when you add one to the host so agents
 * never have to scrape `http-server.ts`.
 */

export type StudioRouteMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface StudioRouteDocumentation {
	method: StudioRouteMethod;
	path: string;
	summary: string;
	query?: Record<string, string>;
	body?: Record<string, string>;
	parameters?: Record<string, string>;
	response: string;
	errors?: Record<string, string>;
	notes?: string[];
	example?: Record<string, unknown>;
}

export interface StudioRouteGroup {
	name: string;
	description: string;
	routes: StudioRouteDocumentation[];
}

/** Max rows POST /routes accepts in one lookup. */
export const MAX_STUDIO_ROUTE_LOOKUPS = 100;

export const STUDIO_ROUTE_METHODS: ReadonlySet<string> = new Set([
	"GET",
	"POST",
	"PATCH",
	"PUT",
	"DELETE",
	"HEAD",
	"OPTIONS",
]);

export const studioRouteCatalog: StudioRouteGroup[] = [
	{
		name: "diagnostics",
		description: "Bridge health and route discovery.",
		routes: [
			{
				method: "GET",
				path: "/health",
				summary: "Check that the intended Studio bridge is running.",
				response: '{ status: "ok", graphify }',
			},
			{
				method: "GET",
				path: "/routes",
				summary: "List every documented category and endpoint summary.",
				response:
					"{ service, port, groups: [{ name, description, routes: [{ method, path, summary }] }], lookup }",
				notes: ["Use POST /routes for full request/response contracts."],
			},
			{
				method: "POST",
				path: "/routes",
				summary:
					"Look up documentation for a batch of registered route patterns.",
				body: {
					routes: `Array<{ path: string, method?: string }> (required, 1-${MAX_STUDIO_ROUTE_LOOKUPS} entries). Use exact route patterns from GET /routes, without query strings or fragments. Method is case-insensitive; omit it to return all methods for the path.`,
				},
				response:
					"{ success: true, results: [{ request: { path, method? }, found, routes: [{ category, method, path, summary, query?, body?, parameters?, response, errors?, notes?, example? }], error? }] }",
				errors: { "400": "Invalid body, entry, method, or batch size." },
				notes: [
					"Results preserve request order. Unknown paths or method/path pairs return found: false with an error and empty routes, without failing other entries.",
					"Matches exact registered patterns (for example /api/subsystem-model/:id), not concrete IDs, URLs, prefixes, or globs. Lookup is read-only and never invokes the requested endpoints.",
				],
				example: {
					routes: [
						{ method: "POST", path: "/api/subsystem-model" },
						{ path: "/api/subsystem-model/:id/pull-requests" },
					],
				},
			},
		],
	},
	{
		name: "subsystem-models",
		description:
			"Create, read, update, delete, and open stored subsystem models; attach PR associations.",
		routes: [
			{
				method: "GET",
				path: "/api/subsystem-model",
				summary: "List every stored subsystem model with its on-disk path.",
				response:
					"{ ok: true, graphs: [{ id, title, description, componentCount, edgeCount, createdAt, updatedAt, pullRequests?, path }] }",
			},
			{
				method: "POST",
				path: "/api/subsystem-model",
				summary:
					"Create a model, or fold onto an existing model with the same title, purl set, and (when provided) PR set.",
				body: {
					title: "string (required).",
					components: "SubsystemComponent[] (required).",
					description: "string (optional, max 200 characters).",
					notes: "string (optional): extended Markdown.",
					trails: "SubsystemTrail[] (optional).",
					pullRequests:
						"SubsystemModelPullRequestRef[] (optional); a single pullRequest object is also accepted.",
					force: "boolean (optional): true always creates a new record.",
					repoRoot:
						"string (optional): local checkout hint learned into Alexandria.",
					repoRoots:
						"Record<string, string> (optional): per-purl checkout hints.",
				},
				response:
					"{ ok: true, graph: StoredSubsystemModel, reused: boolean }",
				errors: { "400": "Missing title/components or invalid model." },
				notes: [
					"`pullRequests` is host metadata, not part of the portable document; duplicate owner/repo#number entries are collapsed.",
					"Identity is normalized title + referenced purl set. Give each PR model a PR-specific title so two PRs in one repo do not fold.",
				],
			},
			{
				method: "GET",
				path: "/api/subsystem-model/:id",
				summary: "Read one stored model, including components and trails.",
				parameters: { id: "Stored model id (sg-…)." },
				response: "{ ok: true, graph: StoredSubsystemModel }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "PUT",
				path: "/api/subsystem-model/:id",
				summary: "Patch a stored model in place.",
				parameters: { id: "Stored model id." },
				body: {
					title: "string (optional).",
					description: "string (optional, max 200 characters).",
					notes: "string (optional).",
					components: "SubsystemComponent[] (optional).",
					trails: "SubsystemTrail[] (optional).",
					pullRequests: "SubsystemModelPullRequestRef[] (optional).",
				},
				response: "{ ok: true, graph: StoredSubsystemModel }",
				errors: { "400": "Invalid patch.", "404": "Unknown model id." },
				notes: ["Omitted fields are preserved; `pullRequests` replaces the list."],
			},
			{
				method: "DELETE",
				path: "/api/subsystem-model/:id",
				summary: "Delete a model and close any tabs rendering it.",
				parameters: { id: "Stored model id." },
				response: "{ ok: true }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/open",
				summary: "Open (or focus) a model's tab in Studio.",
				body: { id: "string (required): stored model id." },
				response: "{ ok: true, tabId }",
				errors: { "400": "Missing id.", "404": "Unknown model id." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/showcase",
				summary: "Open a scoped showcase tab over an ordered model-id set.",
				body: {
					title: "string (optional).",
					ids: "string[] (required, non-empty).",
				},
				response: "{ ok: true, tabId }",
				errors: { "400": "Missing or invalid ids." },
			},
			{
				method: "GET",
				path: "/api/subsystem-model/:id/pull-requests",
				summary: "List the pull requests associated with a model.",
				parameters: { id: "Stored model id." },
				response: "{ ok: true, pullRequests: SubsystemModelPullRequestRef[] }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/pull-requests",
				summary:
					"Add pull-request associations (idempotent per owner/repo#number).",
				parameters: { id: "Stored model id." },
				body: {
					pullRequests:
						"SubsystemModelPullRequestRef[] (required if pullRequest is omitted).",
					pullRequest:
						"SubsystemModelPullRequestRef (optional single-ref form).",
					mode: '"add" (default) | "replace" | "remove".',
				},
				response: "{ ok: true, graph: StoredSubsystemModel }",
				errors: {
					"400": "Missing pullRequests.",
					"404": "Unknown model id.",
				},
				notes: [
					"Linking a PR does not bump updatedAt or invalidate the audit fingerprint.",
				],
				example: {
					pullRequests: [
						{
							owner: "principal-ai",
							repo: "subsystem-modeling",
							number: 42,
							title: "Add the thing",
						},
					],
				},
			},
			{
				method: "DELETE",
				path: "/api/subsystem-model/:id/pull-requests",
				summary: "Remove pull-request associations.",
				parameters: { id: "Stored model id." },
				query: {
					owner: "string (optional): unlink form when no body is sent.",
					repo: "string (optional): unlink form when no body is sent.",
					number: "number (optional): unlink form when no body is sent.",
				},
				body: {
					pullRequests:
						"SubsystemModelPullRequestRef[] (optional when query params are used).",
				},
				response: "{ ok: true, graph: StoredSubsystemModel }",
				errors: {
					"400": "Missing pullRequests.",
					"404": "Unknown model id.",
				},
			},
		],
	},
	{
		name: "verification",
		description:
			"Verify a model or one component, classify source spans, and run the deterministic audit.",
		routes: [
			{
				method: "GET",
				path: "/api/subsystem-model/:id/verify",
				summary: "Verify every component's file/symbol/declaration.",
				parameters: { id: "Stored model id." },
				response: "{ ok: true, ...verification }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "GET",
				path: "/api/subsystem-model/:id/verify/:alias",
				summary: "Verify one component by model-local alias.",
				parameters: {
					id: "Stored model id.",
					alias: "Component alias.",
				},
				response: "{ ok: boolean, ...component verification }",
			},
			{
				method: "GET",
				path: "/api/subsystem-model/classify-spans",
				summary:
					"Dry-run span derivation for every model (read-only classification report).",
				query: { ensure: '"1" to ensure graphify graphs before classifying.' },
				response: "{ ok: true, ...span classification report }",
			},
			{
				method: "GET",
				path: "/api/subsystem-model/:id/classify-spans",
				summary: "Dry-run span derivation for one model.",
				parameters: { id: "Stored model id." },
				query: { ensure: '"1" to ensure graphify graphs before classifying.' },
				response: "{ ok: true, ...span classification report }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "GET",
				path: "/api/subsystem-model/:id/audit",
				summary: "Run a fresh dry-run audit and return the report.",
				parameters: { id: "Stored model id." },
				response: "{ ok: true, report, fingerprint }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/backfill-sites",
				summary: "Backfill missing trail-step sites across every model.",
				body: { apply: "boolean (optional): true writes; default is a dry run." },
				response: "{ ok: true, ...backfill summary }",
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/backfill-sites",
				summary: "Backfill missing trail-step sites for one model.",
				parameters: { id: "Stored model id." },
				body: { apply: "boolean (optional): true writes; default is a dry run." },
				response: "{ ok: true, ...backfill summary }",
				errors: { "404": "Unknown model id." },
			},
		],
	},
	{
		name: "maintenance",
		description:
			"Plan, start, and inspect sequenced Maintain runs and liveness probes.",
		routes: [
			{
				method: "GET",
				path: "/api/subsystem-model/:id/maintain/plan",
				summary: "Read the next routed Maintain stage without starting a run.",
				parameters: { id: "Stored model id." },
				response: "{ ok: true, ...maintain plan }",
				errors: { "404": "Unknown model id.", "503": "Maintain unavailable." },
			},
			{
				method: "GET",
				path: "/api/subsystem-model/:id/maintain/status",
				summary:
					"Inspect the running state, recent runs, snapshot, and delivery status.",
				parameters: { id: "Stored model id." },
				response:
					"{ ok: true, graphId, running, runs, snapshot, delivery }",
				errors: { "404": "Unknown model id.", "503": "Maintain unavailable." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/maintain",
				summary: "Start the sequenced Maintain run; poll /maintain/status.",
				parameters: { id: "Stored model id." },
				body: {
					model: "string (optional): provider/model override.",
				},
				response: "{ ok: true, started?, alreadyRunning?, ... }",
				errors: { "400": "Invalid model.", "503": "Maintain unavailable." },
			},
			{
				method: "POST",
				path: "/api/maintainer/probe",
				summary:
					"Maintain agent Step-0 liveness probe; confirms the model can call tools headless.",
				body: { runId: "string (required)." },
				response: "{ ok: true }",
				errors: { "400": "Missing runId." },
			},
		],
	},
	{
		name: "proposals",
		description:
			"List, create, accept, and reject agent-authored model corrections.",
		routes: [
			{
				method: "GET",
				path: "/api/subsystem-model/:id/proposals",
				summary: "List proposals for a model.",
				parameters: { id: "Stored model id." },
				query: {
					includeResolved:
						'"1" to include accepted/rejected proposals (default pending only).',
				},
				response: "{ ok: true, proposals, pendingCount }",
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/proposals",
				summary: "Create one proposal with typed changes.",
				parameters: { id: "Stored model id." },
				body: {
					rationale: "string (required).",
					changes: "SubsystemModelProposalChange[] (required).",
					finding: "object (optional): the audit finding being addressed.",
					author: "string (optional).",
					runId: "string (optional).",
				},
				response: "{ ok: true, proposal, autoAccepted }",
				errors: { "400": "Missing rationale/changes." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/proposals/accept-all",
				summary: "Accept every pending proposal for a model.",
				parameters: { id: "Stored model id." },
				response: "{ ok: true, accepted, failed, pendingCount }",
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/proposals/:proposalId/accept",
				summary: "Accept one proposal.",
				parameters: { id: "Stored model id.", proposalId: "Proposal id." },
				response: "{ ok: true, proposal }",
				errors: { "400": "Proposal could not be accepted." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/proposals/:proposalId/reject",
				summary: "Reject one proposal.",
				parameters: { id: "Stored model id.", proposalId: "Proposal id." },
				response: "{ ok: true, proposal }",
				errors: { "400": "Proposal could not be rejected." },
			},
		],
	},
	{
		name: "c4",
		description:
			"Read model C4 projections and create, edit, open, or delete C4 sketches.",
		routes: [
			{
				method: "GET",
				path: "/api/subsystem-model/:id/c4",
				summary: "Read a model's C4 projection.",
				parameters: { id: "Stored model id." },
				query: {
					source: '"auto" (default) | "accepted" | "draft".',
				},
				response: "{ ok: true, projection }",
				errors: { "404": "Unknown model id." },
			},
			{
				method: "POST",
				path: "/api/subsystem-model/:id/c4/open",
				summary: "Open (or focus) a model's C4 tab.",
				parameters: { id: "Stored model id." },
				body: { source: '"auto" | "accepted" | "draft" (optional).' },
				response: "{ ok: true, tabId }",
				errors: { "404": "Unknown model id.", "503": "C4 tabs unavailable." },
			},
			{
				method: "GET",
				path: "/api/c4-sketches",
				summary: "List C4 sketches, optionally filtered to one repo key.",
				query: { repo: "string (optional): repo key, e.g. pkg:github/owner/name." },
				response: "{ ok: true, sketches }",
			},
			{
				method: "POST",
				path: "/api/c4-sketches",
				summary: "Create a C4 sketch.",
				body: {
					title: "string (optional).",
					repoKeys: "string[] (optional).",
					model: "C4 sketch model (required by the sketch schema).",
					author: "string (optional).",
					description: "string (optional).",
					notes: "string (optional).",
				},
				response: "{ ok: true, sketch }",
				errors: { "400": "Invalid sketch." },
			},
			{
				method: "GET",
				path: "/api/c4-sketches/:id",
				summary: "Read one C4 sketch.",
				parameters: { id: "Sketch id." },
				response: "{ ok: true, sketch }",
				errors: { "404": "Unknown sketch id." },
			},
			{
				method: "PUT",
				path: "/api/c4-sketches/:id",
				summary: "Patch a C4 sketch.",
				parameters: { id: "Sketch id." },
				body: { patch: "C4SketchPatch fields." },
				response: "{ ok: true, sketch }",
				errors: { "400": "Invalid patch." },
			},
			{
				method: "DELETE",
				path: "/api/c4-sketches/:id",
				summary: "Delete a C4 sketch and close its tab.",
				parameters: { id: "Sketch id." },
				response: "{ ok: true }",
				errors: { "404": "Unknown sketch id." },
			},
			{
				method: "POST",
				path: "/api/c4-sketches/:id/open",
				summary: "Open (or focus) a sketch tab.",
				parameters: { id: "Sketch id." },
				response: "{ ok: true, tabId }",
				errors: { "404": "Unknown sketch id.", "503": "Sketch tabs unavailable." },
			},
		],
	},
	{
		name: "graphify",
		description:
			"Inspect, install, and ensure Graphify code graphs used for verification.",
		routes: [
			{
				method: "GET",
				path: "/api/graphify/status",
				summary: "Read Graphify CLI status.",
				query: { detailed: '"1" for the detailed status report.' },
				response: "{ ok: true, ...status }",
			},
			{
				method: "POST",
				path: "/api/graphify/install",
				summary: "Install the Graphify CLI.",
				response: "{ ok: true, ...status, bin }",
				errors: { "500": "Install failed." },
			},
			{
				method: "GET",
				path: "/api/graphify/repos",
				summary: "List locally registered repos and their graph readiness.",
				response: "{ ok: true, repos, graphify }",
			},
			{
				method: "GET",
				path: "/api/graphify-graph",
				summary: "List cached Graphify graphs.",
				response: "{ ok: true, graphs }",
			},
			{
				method: "POST",
				path: "/api/graphify-graph/ensure",
				summary: "Ensure a fresh graph for a purl, building it when needed.",
				body: {
					purl: "string (required).",
					repoRoot: "string (optional): local checkout.",
					force: "boolean (optional).",
					bin: "string (optional): graphify binary override.",
				},
				response:
					"{ ok: true, status, purl, headSha, dirtyHash, slotKey, repoRoot, graphJsonPath, nodeCount, edgeCount, durationMs, meta }",
				errors: {
					"400": "Missing purl or ensure failed.",
					"503": "Graphify is not installed.",
				},
			},
			{
				method: "GET",
				path: "/api/graphify-graph/raw",
				summary: "Ensure (unless cacheOnly) and return a graph.json file.",
				query: {
					purl: "string (required).",
					repoRoot: "string (optional).",
					cacheOnly: '"1" to read the cached graph only.',
					force: '"1" to rebuild.',
				},
				response: "Raw graph.json (application/json)",
				errors: { "400": "Missing purl.", "404": "No cached graph." },
			},
		],
	},
	{
		name: "settings",
		description: "Read and update Studio viewer settings and Ollama config.",
		routes: [
			{
				method: "GET",
				path: "/api/settings",
				summary: "Read redacted viewer settings.",
				response: "{ ok: true, settings }",
			},
			{
				method: "PATCH",
				path: "/api/settings",
				summary: "Patch viewer settings.",
				body: { patch: "PartialViewerSettings (partial)." },
				response: "{ ok: true, settings }",
			},
			{
				method: "PUT",
				path: "/api/settings",
				summary: "Patch viewer settings (alias of PATCH).",
				body: { patch: "PartialViewerSettings (partial)." },
				response: "{ ok: true, settings }",
			},
			{
				method: "GET",
				path: "/api/ollama",
				summary: "Read Ollama integration status and judge/agent readiness.",
				response: "{ ok: true, ...OllamaIntegrationStatus }",
				errors: { "403": "Cross-origin request." },
			},
			{
				method: "PUT",
				path: "/api/ollama",
				summary: "Configure Ollama (base URL, judge model, agent model, provider).",
				body: {
					baseUrl: "string (optional): Ollama origin.",
					agentModel: "string (optional): tool-capable model for Maintain agents.",
					judgeModel: "string | null (optional): second-opinion judge model.",
					secondOpinionProvider: '"typesafe" | "ollama" (optional).',
					restartOpencode: "boolean (optional): default true.",
				},
				response: "{ ok: true, ...OllamaConfigureOutcome }",
				errors: { "400": "Invalid config or model not pulled." },
			},
			{
				method: "POST",
				path: "/api/ollama",
				summary: "Configure Ollama (alias of PUT).",
				body: {
					baseUrl: "string (optional).",
					agentModel: "string (optional).",
					judgeModel: "string | null (optional).",
					secondOpinionProvider: '"typesafe" | "ollama" (optional).',
					restartOpencode: "boolean (optional).",
				},
				response: "{ ok: true, ...OllamaConfigureOutcome }",
			},
			{
				method: "GET",
				path: "/api/ollama/models",
				summary: "List models pulled on the configured Ollama server.",
				response: "{ ok: true, baseUrl, models }",
				errors: { "502": "Ollama is unreachable." },
			},
		],
	},
	{
		name: "theme",
		description: "Inspect, switch, and override Studio themes.",
		routes: [
			{
				method: "GET",
				path: "/theme/schema",
				summary: "Read theme schema, current values, and available themes.",
				query: {
					theme: "string (optional): theme name; defaults to the active theme.",
				},
				response:
					"{ success: true, themeName, themeDescription, schema, currentValues, availableThemes }",
				errors: { "403": "Cross-origin request.", "404": "Unknown theme." },
			},
			{
				method: "POST",
				path: "/theme/select",
				summary: "Switch the active Studio theme.",
				body: { themeName: "string (required): a documented theme name." },
				response: "{ success: true, themeName }",
				errors: { "400": "Unknown theme." },
			},
			{
				method: "POST",
				path: "/theme/update",
				summary: "Set one theme property override.",
				body: {
					propertyPath: "string (required): a path from GET /theme/schema.",
					value: "string (max 500 chars) | finite number (required).",
					themeName: "string (optional): defaults to the active theme.",
				},
				response: "{ success: true, updatedProperty, themeName, activeTheme?, warning? }",
				errors: { "400": "Invalid property/value.", "404": "Unknown theme." },
			},
		],
	},
	{
		name: "model-sources",
		description:
			"Configure remote S3/R2 model sources, browse them, and open remote models.",
		routes: [
			{
				method: "GET",
				path: "/api/model-sources",
				summary: "List configured remote model sources.",
				response: "{ ok: true, sources }",
				errors: { "403": "Cross-origin request." },
			},
			{
				method: "POST",
				path: "/api/model-sources",
				summary: "Configure a remote model source and open its tab.",
				body: {
					bucket: "string (required).",
					prefix: "string (optional).",
					name: "string (optional).",
					provider: '"s3" (default) | "r2".',
					region: "string (optional, S3).",
					profile: "string (optional, S3).",
					accountId: "string (required for R2).",
					jurisdiction: '"eu" (optional, R2).',
				},
				response: "{ ok: true, source, preview?, tabId?, openError? }",
				errors: { "400": "Invalid source config." },
			},
			{
				method: "GET",
				path: "/api/model-sources/:id/models",
				summary: "Browse one page of remote models.",
				parameters: { id: "Remote source id." },
				query: { cursor: "string (optional): page cursor." },
				response: "{ ok: true, ...RemoteModelPage }",
			},
			{
				method: "GET",
				path: "/api/model-sources/:id/model",
				summary: "Read one remote model by key.",
				parameters: { id: "Remote source id." },
				query: { key: "string (required)." },
				response: "{ ok: true, model }",
			},
			{
				method: "POST",
				path: "/api/model-sources/:id/open",
				summary: "Open a remote model's tab.",
				parameters: { id: "Remote source id." },
				query: { key: "string (optional)." },
				response: "{ ok: true, tabId }",
			},
		],
	},
];

export interface StudioRouteLookupRequest {
	path: string;
	method?: string;
}

export interface StudioRouteLookupMatch extends StudioRouteDocumentation {
	category: string;
}

export function lookupStudioRoutes(
	requests: readonly StudioRouteLookupRequest[],
): Array<{
	request: StudioRouteLookupRequest;
	found: boolean;
	routes: StudioRouteLookupMatch[];
	error?: string;
}> {
	return requests.map((request) => {
		const matches = studioRouteCatalog.flatMap((group) =>
			group.routes
				.filter(
					(route) =>
						route.path === request.path &&
						(!request.method || route.method === request.method),
				)
				.map((route) => ({ category: group.name, ...route })),
		);
		return {
			request,
			found: matches.length > 0,
			routes: matches,
			...(matches.length === 0
				? {
						error:
							"No documented route matches this path and method. Use patterns from GET /routes.",
					}
				: {}),
		};
	});
}
