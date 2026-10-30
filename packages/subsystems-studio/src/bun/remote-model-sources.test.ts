import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Files } from "files-sdk";
import { memory } from "files-sdk/memory";
import type { ListOptions } from "files-sdk";
import {
	createRemoteModelSources, parseRemoteModelSource, remoteSourceErrorMessage, s3ModelStorage, r2ModelStorage,
	type ModelStorage,
} from "./remote-model-sources";
import { handleRemoteModelRequest } from "./remote-model-http";
import type { R2ModelSourceInput } from "../shared/remote-models";

const document = {
	title: "File storage",
	description: "Read a stored model",
	components: [{
		alias: "reader", name: "readModel", construct: "function" as const,
		file: "src/read.ts", purl: "pkg:github/acme/storage#src/read.ts", symbol: "readModel",
	}],
};

let dir: string;
let storePath: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "remote-models-"));
	storePath = join(dir, "sources.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fixture(initial: Record<string, string> = { "models/file.json": JSON.stringify(document) }) {
	const files = new Files({ adapter: memory({ initial }) });
	let closed = 0;
	const calls: ListOptions[] = [];
	const storage: ModelStorage = {
		list: (options) => { calls.push(options); return files.list(options); },
		download: (key, options) => files.download(key, options),
		close: () => { closed++; },
	};
	const sources = createRemoteModelSources({ storePath: () => storePath, storage: async () => storage });
	return { sources, files, storage, calls, get closed() { return closed; } };
}

describe("remote model sources", () => {
	test("validates previews, then saves without confirmation, and reloads configuration", async () => {
		const f = fixture();
		const { source, preview } = await f.sources.configure({ bucket: "acme-models", prefix: "models/", profile: "dev", region: "us-east-1" });
		expect(preview.models).toMatchObject([{ key: "models/file.json", title: document.title, componentCount: 1, trailCount: 0 }]);
		expect(source.prefix).toBe("models/");
		expect(f.calls[0]).toMatchObject({ prefix: "models/", limit: 50 });
		expect(f.closed).toBe(1);
		const reloaded = createRemoteModelSources({ storePath: () => storePath });
		expect(reloaded.list()).toEqual([source]);
		expect(readFileSync(storePath, "utf8")).not.toContain("accessKey");
	});

	test("configuration is idempotent; updating a region/name preserves ID and creation time", async () => {
		const { sources } = fixture();
		const first = await sources.configure({ bucket: "acme-models" });
		const second = await sources.configure({ bucket: "acme-models", region: "us-west-2", name: "Team models" });
		expect(second.source.id).toBe(first.source.id);
		expect(second.source.createdAt).toBe(first.source.createdAt);
		expect(sources.list()).toHaveLength(1);
		expect(sources.list()[0]?.name).toBe("Team models");
	});

	test("same keys across buckets or profiles retain distinct source identities", async () => {
		const { sources } = fixture();
		await sources.configure({ bucket: "acme-one" });
		await sources.configure({ bucket: "acme-two" });
		await sources.configure({ bucket: "acme-one", profile: "other-account" });
		expect(new Set(sources.list().map((s) => s.id)).size).toBe(3);
	});

	test("concurrent configurations preserve both successful sources", async () => {
		const { sources } = fixture();
		await Promise.all(["acme-one", "acme-two"].map((bucket) => sources.configure({ bucket })));
		expect(sources.list()).toHaveLength(2);
	});

	test("invalid JSON and non-model objects are skipped; portable fields only are returned", async () => {
		const { sources } = fixture({
			"models/model.json": JSON.stringify({ ...document, id: "local-id", repoRoot: "/private/checkout", verification: { secret: "host-only" } }),
			"models/invalid.json": "{",
			"models/config.json": JSON.stringify({ not: "a model" }),
			"other.json": JSON.stringify(document),
		});
		const { source, preview } = await sources.configure({ bucket: "acme-models", prefix: "models/" });
		expect(preview.skipped).toBe(2);
		expect(preview.models).toHaveLength(1);
		const result = await sources.get(source.id, "models/model.json");
		expect(result.document).toEqual(document);
		expect(JSON.stringify(result.document)).not.toContain("private/checkout");
		await expect(sources.get(source.id, "other.json")).rejects.toThrow("outside this source prefix");
	});

	test("unreadable, empty, or invalid sources are not saved", async () => {
		const { sources } = fixture({ "invalid.json": "{}" });
		await expect(sources.configure({ bucket: "acme-models" })).rejects.toThrow("No readable");
		expect(sources.list()).toEqual([]);
	});

	test("a failed update preserves the previous source", async () => {
		const { sources, files } = fixture();
		const { source } = await sources.configure({ bucket: "acme-models", name: "Original" });
		await files.delete("models/file.json");
		await expect(sources.configure({ bucket: "acme-models", name: "Changed" })).rejects.toThrow();
		expect(sources.list()).toEqual([source]);
	});

	test("access denial fails validation rather than silently skipping objects", async () => {
		const f = fixture();
		f.storage.download = async () => { throw new Error("secret credential-process output"); };
		await expect(f.sources.configure({ bucket: "acme-models" })).rejects.toThrow();
		expect(f.sources.list()).toEqual([]);
		expect(f.closed).toBe(1);
		expect(remoteSourceErrorMessage(new Error("secret credential-process output"))).not.toContain("secret");
	});

	test("pagination scans past non-JSON objects and preserves the continuation cursor", async () => {
		const initial: Record<string, string> = {};
		for (let i = 0; i < 52; i++) initial[`a-${i.toString().padStart(3, "0")}.txt`] = "text";
		for (let i = 0; i < 55; i++) initial[`z-${i.toString().padStart(3, "0")}.json`] = JSON.stringify(document);
		const f = fixture(initial);
		const { source, preview } = await f.sources.configure({ bucket: "acme-models" });
		expect(preview.models).toHaveLength(48);
		expect(preview.cursor).toBeDefined();
		const next = await f.sources.browse(source.id, preview.cursor);
		expect(next.models).toHaveLength(7);
		expect(next.cursor).toBeUndefined();
		expect(new Set([...preview.models, ...next.models].map((m) => m.key)).size).toBe(55);
	});

	test("oversized model objects are skipped before downloading", async () => {
		const f = fixture();
		const list = f.storage.list;
		let downloads = 0;
		const download = f.storage.download;
		f.storage.list = async (opts) => {
			const result = await list(opts);
			return { ...result, items: result.items.map((item) => ({ ...item, size: 6 * 1024 * 1024 })) };
		};
		f.storage.download = async (...args) => { downloads++; return download(...args); };
		await expect(f.sources.configure({ bucket: "acme-models" })).rejects.toThrow();
		expect(downloads).toBe(0);
		expect(f.sources.list()).toEqual([]);
	});

	test("model loads validate the latest object, not only its previous preview", async () => {
		const { sources, files } = fixture();
		const { source } = await sources.configure({ bucket: "acme-models" });
		await files.upload("models/file.json", JSON.stringify({ ...document, title: "Updated" }));
		expect((await sources.get(source.id, "models/file.json")).document.title).toBe("Updated");
		await files.upload("models/file.json", "{}");
		await expect(sources.get(source.id, "models/file.json")).rejects.toThrow("not a valid");
	});

	test("corrupt settings are not silently overwritten", async () => {
		const { sources } = fixture();
		writeFileSync(storePath, "broken");
		await expect(sources.configure({ bucket: "acme-models" })).rejects.toThrow("saved model sources");
		expect(readFileSync(storePath, "utf8")).toBe("broken");
	});

	test("a named local AWS profile supplies credentials and region without copying keys into source config", async () => {
		const envKeys = ["AWS_SHARED_CREDENTIALS_FILE", "AWS_CONFIG_FILE", "AWS_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"];
		const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
		try {
			for (const key of envKeys) delete process.env[key];
			const credsPath = join(dir, "credentials");
			const configPath = join(dir, "config");
			writeFileSync(credsPath, "[studio-test]\naws_access_key_id = TEST_ONLY\naws_secret_access_key = NOT_A_REAL_KEY\n");
			writeFileSync(configPath, "[profile studio-test]\nregion = us-west-2\n");
			process.env["AWS_SHARED_CREDENTIALS_FILE"] = credsPath;
			process.env["AWS_CONFIG_FILE"] = configPath;
			const storage = await s3ModelStorage({ bucket: "acme-models", profile: "studio-test" });
			expect(typeof storage.list).toBe("function");
			storage.close?.();
		} finally {
			for (const key of envKeys) {
				if (previous[key] === undefined) delete process.env[key];
				else process.env[key] = previous[key];
			}
		}
	});

	test("rejects a stream exceeding the size limit even if its metadata understates the size", async () => {
		const f = fixture();
		const { source } = await f.sources.configure({ bucket: "acme-models" });
		const download = f.storage.download;
		f.storage.download = async (...args) => ({
			...await download(...args), size: 0,
			stream: () => new ReadableStream({
				start(controller) { controller.enqueue(new Uint8Array(6 * 1024 * 1024)); controller.close(); },
			}),
		});
		await expect(f.sources.get(source.id, "models/file.json")).rejects.toThrow("5 MiB");
	});

	test("refuses a repeated listing cursor instead of looping forever", async () => {
		const f = fixture();
		f.storage.list = async () => ({ items: [], cursor: "same" });
		await expect(f.sources.configure({ bucket: "acme-models" })).rejects.toThrow("repeated cursor");
		expect(f.sources.list()).toEqual([]);
	});

	test("rejects credential fields, endpoints, and malformed bucket input", () => {
		for (const input of [
			null, [], {}, { bucket: "s3://bucket" }, { bucket: "https://example.com" },
			{ bucket: "acme-models", credentials: {} }, { bucket: "acme-models", endpoint: "https://example.com" },
			{ bucket: "acme-models", region: 1 }, { bucket: "acme-models", prefix: "\0" },
		]) expect(() => parseRemoteModelSource(input)).toThrow();
		expect(parseRemoteModelSource({ bucket: " acme-models ", prefix: " models/" })).toEqual({ bucket: "acme-models", prefix: " models/" });
	});

	test("previews keep large descriptions bounded without truncating the stored model", async () => {
		const description = "x".repeat(2000);
		const { sources } = fixture({ "model.json": JSON.stringify({ ...document, description }) });
		const result = await sources.configure({ bucket: "acme-models" });
		expect(result.preview.models[0]?.description).toHaveLength(1000);
		expect((await sources.get(result.source.id, "model.json")).document.description).toBe(description);
	});
});

function request(path = "", method = "GET", body?: unknown, headers?: HeadersInit) {
	return new Request(`http://127.0.0.1:3045/api/model-sources${path}`, {
		method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
}

const R2_CONFIG: R2ModelSourceInput = {
	provider: "r2", bucket: "acme-models",
	accountId: "0123456789abcdef0123456789abcdef", prefix: "models/",
};

describe("Cloudflare R2 model sources", () => {
	let previousAccess: string | undefined;
	let previousSecret: string | undefined;
	beforeEach(() => {
		previousAccess = process.env["R2_ACCESS_KEY_ID"];
		previousSecret = process.env["R2_SECRET_ACCESS_KEY"];
		process.env["R2_ACCESS_KEY_ID"] = "TEST_R2_ACCESS_KEY";
		process.env["R2_SECRET_ACCESS_KEY"] = "TEST_ONLY_NOT_A_REAL_R2_SECRET";
	});
	afterEach(() => {
		if (previousAccess === undefined) delete process.env["R2_ACCESS_KEY_ID"];
		else process.env["R2_ACCESS_KEY_ID"] = previousAccess;
		if (previousSecret === undefined) delete process.env["R2_SECRET_ACCESS_KEY"];
		else process.env["R2_SECRET_ACCESS_KEY"] = previousSecret;
	});

	test("the real R2 adapter signs read-only list/download requests for the configured account", async () => {
		const requests: Request[] = [];
		const key = "models/storage #1.json";
		const body = JSON.stringify(document);
		const storage = await r2ModelStorage(R2_CONFIG, async (req) => {
			requests.push(req);
			const url = new URL(req.url);
			expect(req.method).toBe("GET");
			expect(url.hostname).toBe(`${R2_CONFIG.accountId}.r2.cloudflarestorage.com`);
			expect(req.headers.get("authorization")).toContain("TEST_R2_ACCESS_KEY/");
			expect(req.headers.get("authorization")).toContain("/auto/s3/aws4_request");
			if (url.searchParams.get("list-type") === "2") {
				expect(url.searchParams.get("prefix")).toBe("models/");
				return new Response(`<ListBucketResult>
					<IsTruncated>true</IsTruncated><NextContinuationToken>next+page/one</NextContinuationToken>
					<Contents><Key>${key}</Key><Size>${body.length}</Size><ETag>"model-etag"</ETag>
					<LastModified>2026-10-28T00:00:00Z</LastModified></Contents>
				</ListBucketResult>`, { headers: { "Content-Type": "application/xml" } });
			}
			expect(decodeURIComponent(url.pathname)).toBe(`/acme-models/${key}`);
			return new Response(body, { headers: { "Content-Type": "application/json", "Content-Length": String(body.length) } });
		});
		const page = await storage.list({ prefix: R2_CONFIG.prefix, limit: 50 });
		expect(page.items[0]?.key).toBe(key);
		expect(page.cursor).toBe("next+page/one");
		const file = await storage.download(key, { signal: AbortSignal.timeout(1000) });
		expect(JSON.parse(await file.text())).toEqual(document);
		expect(requests).toHaveLength(2);
	});

	test("EU jurisdiction uses the account's EU endpoint", async () => {
		const storage = await r2ModelStorage({ ...R2_CONFIG, jurisdiction: "eu" }, async (req) => {
			expect(new URL(req.url).hostname).toBe(`${R2_CONFIG.accountId}.eu.r2.cloudflarestorage.com`);
			return new Response("<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>");
		});
		expect((await storage.list({})).items).toEqual([]);
	});

	test("previews, saves and reloads R2 configuration without credentials", async () => {
		const { sources } = fixture();
		const result = await sources.configure(R2_CONFIG);
		expect(result.preview.models).toHaveLength(1);
		expect(result.source.id).toStartWith("r2-");
		expect(result.source).toMatchObject(R2_CONFIG);
		expect(createRemoteModelSources({ storePath: () => storePath }).list()).toEqual([result.source]);
		const saved = readFileSync(storePath, "utf8");
		expect(saved).not.toContain("TEST_R2_ACCESS_KEY");
		expect(saved).not.toContain("TEST_ONLY_NOT_A_REAL_R2_SECRET");
		expect(saved).not.toContain("secretAccessKey");
	});

	test("R2 protocol responses flow through preview validation, saving and read-only model loading", async () => {
		const body = JSON.stringify(document);
		const sources = createRemoteModelSources({
			storePath: () => storePath,
			storage: async (input) => {
				if (input.provider !== "r2") throw new Error("Expected R2 input");
				return r2ModelStorage(input, async (req) => {
					if (new URL(req.url).searchParams.get("list-type") === "2") {
						return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>
							<Contents><Key>models/file.json</Key><Size>${body.length}</Size></Contents>
						</ListBucketResult>`);
					}
					return new Response(body, { headers: { "Content-Type": "application/json", "Content-Length": String(body.length) } });
				});
			},
		});
		const { source, preview } = await sources.configure(R2_CONFIG);
		expect(preview.models[0]?.title).toBe(document.title);
		const result = await sources.get(source.id, "models/file.json");
		expect(result.source.provider).toBe("r2");
		expect(result.document).toEqual(document);
	});

	test("provider, account and jurisdiction keep same-named buckets distinct", async () => {
		const { sources } = fixture();
		await sources.configure({ bucket: R2_CONFIG.bucket, prefix: R2_CONFIG.prefix });
		await sources.configure(R2_CONFIG);
		await sources.configure({ ...R2_CONFIG, accountId: "abcdef0123456789abcdef0123456789" });
		await sources.configure({ ...R2_CONFIG, jurisdiction: "eu" });
		expect(new Set(sources.list().map((s) => s.id)).size).toBe(4);
	});

	test("legacy S3 source IDs remain stable when adding an explicit provider", async () => {
		const { sources } = fixture();
		const config = { bucket: "acme-models", prefix: "models/", profile: "dev" };
		const first = await sources.configure(config);
		const expected = "s3-" + createHash("sha256").update(JSON.stringify([config.bucket, config.prefix, config.profile])).digest("hex").slice(0, 24);
		expect(first.source.id).toBe(expected);
		const result = await sources.configure({ ...config, provider: "s3" });
		expect(result.source.id).toBe(expected);
		expect(result.source.createdAt).toBe(first.source.createdAt);
		expect(sources.list()).toHaveLength(1);
	});

	test("R2 validation rejects endpoints, secrets, AWS settings and invalid accounts", () => {
		for (const input of [
			{ ...R2_CONFIG, accountId: "" },
			{ ...R2_CONFIG, accountId: "account.evil.example/" },
			{ ...R2_CONFIG, endpoint: "https://example.com" },
			{ ...R2_CONFIG, accessKeyId: "do-not-store" },
			{ ...R2_CONFIG, secretAccessKey: "do-not-store" },
			{ ...R2_CONFIG, profile: "aws-profile" },
			{ ...R2_CONFIG, region: "us-east-1" },
			{ ...R2_CONFIG, jurisdiction: "unrecognized" },
			{ ...R2_CONFIG, bucket: "dotted.bucket" },
			{ ...R2_CONFIG, provider: "unrecognized" },
		]) expect(() => parseRemoteModelSource(input)).toThrow();
	});

	test("default storage dispatch refuses missing R2 credentials instead of using AWS credentials", async () => {
		delete process.env["R2_ACCESS_KEY_ID"];
		delete process.env["R2_SECRET_ACCESS_KEY"];
		const sources = createRemoteModelSources({ storePath: () => storePath });
		await expect(sources.configure(R2_CONFIG)).rejects.toThrow("R2_ACCESS_KEY_ID");
		expect(sources.list()).toEqual([]);
	});

	test("R2 permission failures are redacted and never saved", async () => {
		const sources = createRemoteModelSources({
			storePath: () => storePath,
			storage: async (config) => {
				if (config.provider !== "r2") throw new Error("Expected R2 config");
				return r2ModelStorage(config, async () => new Response(
					"<Error><Code>AccessDenied</Code><Message>TEST_ONLY_NOT_A_REAL_R2_SECRET</Message></Error>", { status: 403 },
				));
			},
		});
		const response = await handleRemoteModelRequest(request("", "POST", R2_CONFIG), undefined, sources);
		expect(response?.status).toBe(400);
		const result = await response!.text();
		expect(result).toContain("R2");
		expect(result).not.toContain("TEST_ONLY_NOT_A_REAL_R2_SECRET");
		expect(sources.list()).toEqual([]);
	});

	test("agent HTTP configuration accepts R2 and opens after previews without confirmation", async () => {
		const { sources } = fixture();
		let opened: string | undefined;
		const result = await handleRemoteModelRequest(request("", "POST", R2_CONFIG),
			async (id) => { opened = id; return { ok: true, tabId: "shared-subsystems" }; }, sources);
		expect(result?.status).toBe(201);
		const json = await result!.json();
		expect(json.source.provider).toBe("r2");
		expect(json.source.id).toBe(opened);
		expect(json.preview.models).toHaveLength(1);
		expect(json.tabId).toBe("shared-subsystems");
	});
});

describe("remote model HTTP routes", () => {
	test("agent POST checks, previews, saves and opens immediately", async () => {
		const { sources } = fixture();
		const opened: string[] = [];
		const response = await handleRemoteModelRequest(request("", "POST", { bucket: "acme-models" }),
			async (id) => { opened.push(id); return { ok: true, tabId: "shared-subsystems" }; }, sources);
		expect(response?.status).toBe(201);
		const result = await response!.json();
		expect(result.ok).toBe(true);
		expect(result.tabId).toBe("shared-subsystems");
		expect(result.preview.models[0].title).toBe(document.title);
		expect(opened).toEqual([result.source.id]);
		expect(sources.list()).toHaveLength(1);
	});

	test("failed validation neither saves nor opens a tab, and redacts provider errors", async () => {
		const f = fixture();
		f.storage.list = async () => { throw new Error("secret-token"); };
		let opened = false;
		const response = await handleRemoteModelRequest(request("", "POST", { bucket: "acme-models" }),
			async () => { opened = true; return { ok: true }; }, f.sources);
		expect(response?.status).toBe(400);
		expect(await response!.text()).not.toContain("secret-token");
		expect(f.sources.list()).toEqual([]);
		expect(opened).toBe(false);
	});

	test("lists saved sources and models, and loads an encoded object key", async () => {
		const key = "models/a file #1.json";
		const { sources } = fixture({ [key]: JSON.stringify(document) });
		const { source } = await sources.configure({ bucket: "acme-models" });
		const all = await handleRemoteModelRequest(request(), undefined, sources);
		expect((await all!.json()).sources[0].id).toBe(source.id);
		const page = await handleRemoteModelRequest(request(`/${source.id}/models`), undefined, sources);
		expect((await page!.json()).models[0].key).toBe(key);
		const model = await handleRemoteModelRequest(request(`/${source.id}/model?key=${encodeURIComponent(key)}`), undefined, sources);
		expect((await model!.json()).model.document).toEqual(document);
	});

	test("rejects unknown IDs, malformed JSON, and cross-origin requests", async () => {
		const { sources } = fixture();
		expect((await handleRemoteModelRequest(request("/unknown/models"), undefined, sources))?.status).toBe(404);
		const badJson = new Request("http://127.0.0.1:3045/api/model-sources", { method: "POST", body: "{" });
		expect((await handleRemoteModelRequest(badJson, undefined, sources))?.status).toBe(400);
		expect((await handleRemoteModelRequest(request("", "GET", undefined, { Origin: "https://evil.example" }), undefined, sources))?.status).toBe(403);
		expect(sources.list()).toEqual([]);
	});

	test("saved source is still successful when opening its tab fails", async () => {
		const { sources } = fixture();
		const result = await handleRemoteModelRequest(request("", "POST", { bucket: "acme-models" }),
			async () => { throw new Error("Window unavailable"); }, sources);
		expect(result?.status).toBe(201);
		expect((await result!.json()).openError).toContain("Source saved");
		expect(sources.list()).toHaveLength(1);
	});

	test("supports explicitly opening a saved source or model", async () => {
		const { sources } = fixture();
		const { source } = await sources.configure({ bucket: "acme-models" });
		const calls: Array<[string, string | undefined]> = [];
		const open = async (id: string, key?: string) => { calls.push([id, key]); return { ok: true, tabId: "remote-1" }; };
		await handleRemoteModelRequest(request(`/${source.id}/open`, "POST"), open, sources);
		await handleRemoteModelRequest(request(`/${source.id}/open?key=models%2Ffile.json`, "POST"), open, sources);
		expect(calls).toEqual([[source.id, undefined], [source.id, "models/file.json"]]);
	});

	test("does not intercept unrelated HTTP routes", async () => {
		expect(await handleRemoteModelRequest(new Request("http://127.0.0.1:3045/health"))).toBeNull();
	});
});
