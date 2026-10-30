import {
	remoteModelSources, RemoteSourceError, remoteSourceErrorMessage,
	type createRemoteModelSources,
} from "./remote-model-sources";

export type OpenRemoteModelsHandler = (sourceId: string, key?: string) => Promise<{
	ok: boolean; tabId?: string; error?: string;
}>;

export async function handleRemoteModelRequest(
	req: Request,
	open?: OpenRemoteModelsHandler,
	sources: ReturnType<typeof createRemoteModelSources> = remoteModelSources,
): Promise<Response | null> {
	const url = new URL(req.url);
	if (url.pathname !== "/api/model-sources" && !url.pathname.startsWith("/api/model-sources/")) return null;
	const reply = (data: unknown, status = 200) => Response.json(data, { status });
	// These endpoints exercise the user's storage credentials. Do not let arbitrary
	// websites use the loopback bridge as an authenticated bucket proxy.
	if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
		(req.headers.has("origin") && req.headers.get("origin") !== url.origin)) {
		return reply({ ok: false, error: "Cross-origin model source requests are not allowed" }, 403);
	}
	try {
		if (url.pathname === "/api/model-sources") {
			if (req.method === "GET") return reply({ ok: true, sources: sources.list() });
			if (req.method === "POST") {
				let body: unknown;
				try { body = await req.json(); }
				catch { throw new RemoteSourceError("Invalid JSON body"); }
				const result = await sources.configure(body);
				// Saving succeeded even if a window cannot be opened.
				const opened = open
					? await open(result.source.id).catch(() => ({ ok: false, error: "Source saved; could not open its tab", tabId: undefined }))
					: undefined;
				return reply({ ok: true, ...result, tabId: opened?.tabId, openError: opened?.ok === false ? opened.error : undefined }, 201);
			}
		}
		const match = /^\/api\/model-sources\/([^/]+)\/(models|model|open)$/.exec(url.pathname);
		if (match) {
			let id: string;
			try { id = decodeURIComponent(match[1]!); }
			catch { throw new RemoteSourceError("Invalid source ID"); }
			if (match[2] === "models" && req.method === "GET") {
				return reply({ ok: true, ...await sources.browse(id, url.searchParams.get("cursor") ?? undefined) });
			}
			if (match[2] === "model" && req.method === "GET") {
				return reply({ ok: true, model: await sources.get(id, url.searchParams.get("key") ?? "") });
			}
			if (match[2] === "open" && req.method === "POST") {
				sources.getSource(id);
				if (!open) throw new RemoteSourceError("Tab opening is unavailable", 503);
				const result = await open(id, url.searchParams.get("key") ?? undefined);
				return reply(result, result.ok ? 200 : 400);
			}
		}
		return reply({ ok: false, error: "Not found" }, 404);
	} catch (err) {
		return reply({ ok: false, error: remoteSourceErrorMessage(err) },
			err instanceof RemoteSourceError ? err.status : 400);
	}
}
