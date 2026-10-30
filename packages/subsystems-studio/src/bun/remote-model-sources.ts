import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Files } from "files-sdk";
import { s3 } from "files-sdk/s3";
import { r2 } from "files-sdk/r2";
import type { R2HttpOptions } from "files-sdk/r2";
import type { ListOptions, ListResult, StoredFile } from "files-sdk";
import type {
	RemoteModel, RemoteModelPage, RemoteModelSource, RemoteModelSourceInput,
	R2ModelSourceInput, S3ModelSourceInput,
} from "../shared/remote-models";
import { findSubsystemModelProblems, portableDocumentFrom } from "./subsystem-model-validation";

const MAX_MODEL_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 50;
const MAX_SCAN_PAGES = 20;

export class RemoteSourceError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
	}
}

export interface ModelStorage {
	list(options: ListOptions): Promise<ListResult>;
	download(key: string, options: { signal: AbortSignal }): Promise<StoredFile>;
	close?(): void;
}

/** Resolve profiles/SSO in the host; never copy credentials into saved settings. */
export async function s3ModelStorage(source: S3ModelSourceInput): Promise<ModelStorage> {
	const resolver = new S3Client({ region: source.region, profile: source.profile });
	try {
		const [region, credentials] = await Promise.all([
			resolver.config.region(),
			resolver.config.credentials(),
		]);
		const adapter = s3({ bucket: source.bucket, region, credentials });
		const files = new Files({ adapter });
		return {
			list: (options) => files.list(options),
			download: (key, options) => files.download(key, options),
			close: () => adapter.raw.destroy(),
		};
	} finally {
		resolver.destroy();
	}
}

/** R2 never falls back to the AWS credential chain or accepts arbitrary endpoints. */
export async function r2ModelStorage(
	source: R2ModelSourceInput,
	fetchOverride?: R2HttpOptions["fetch"],
): Promise<ModelStorage> {
	const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
	const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
	if (!accessKeyId || !secretAccessKey) {
		throw new RemoteSourceError("Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in Studio's host environment");
	}
	const endpoint = `https://${source.accountId}${source.jurisdiction ? `.${source.jurisdiction}` : ""}.r2.cloudflarestorage.com`;
	const files = new Files({
		adapter: r2({
			bucket: source.bucket, accountId: source.accountId, endpoint,
			accessKeyId, secretAccessKey, client: "fetch", fetch: fetchOverride,
		}),
	});
	return {
		list: (options) => files.list(options),
		download: (key, options) => files.download(key, options),
	};
}

function modelStorage(source: RemoteModelSourceInput): Promise<ModelStorage> {
	return source.provider === "r2" ? r2ModelStorage(source) : s3ModelStorage(source);
}

export function parseRemoteModelSource(input: unknown): RemoteModelSourceInput {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new RemoteSourceError("A bucket configuration is required");
	}
	const obj = input as Record<string, unknown>;
	const provider = obj["provider"] ?? "s3";
	if (provider !== "s3" && provider !== "r2") throw new RemoteSourceError("Provider must be s3 or r2");
	const allowed = new Set(["provider", "bucket", "prefix", "name",
		...(provider === "r2" ? ["accountId", "jurisdiction"] : ["region", "profile"])]);
	for (const key of Object.keys(obj)) {
		if (!allowed.has(key)) throw new RemoteSourceError(`Unsupported configuration field: ${key}`);
		if (typeof obj[key] !== "string") throw new RemoteSourceError(`${key} must be a string`);
	}
	const bucket = (obj["bucket"] as string | undefined)?.trim() ?? "";
	if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
		bucket.includes("..") || /^\d+\.\d+\.\d+\.\d+$/.test(bucket)) {
		throw new RemoteSourceError("Provide a bucket name, not a URL or ARN");
	}
	const common: { bucket: string; prefix: string; name?: string } = {
		bucket, prefix: (obj["prefix"] as string | undefined) ?? "",
	};
	const strings: Record<string, string> = {};
	for (const key of provider === "r2" ? ["accountId", "name"] : ["region", "profile", "name"]) {
		const value = (obj[key] as string | undefined)?.trim();
		if (value) {
			if (value.length > 200 || /[\x00-\x1f]/.test(value)) {
				throw new RemoteSourceError(`Invalid ${key}`);
			}
			strings[key] = value;
		}
	}
	// Object-store prefixes are literal, not filesystem paths.
	if (common.prefix.length > 1024 || /[\x00-\x1f]/.test(common.prefix)) {
		throw new RemoteSourceError("Invalid prefix");
	}
	if (strings["name"]) common.name = strings["name"];
	if (provider === "r2") {
		const accountId = strings["accountId"]?.toLowerCase() ?? "";
		if (!/^[a-f0-9]{32}$/.test(accountId)) throw new RemoteSourceError("R2 requires a 32-character hexadecimal Cloudflare account ID");
		if (bucket.includes(".")) throw new RemoteSourceError("R2 bucket names cannot contain periods");
		if (obj["jurisdiction"] !== undefined && obj["jurisdiction"] !== "eu") {
			throw new RemoteSourceError("R2 jurisdiction must be eu or omitted");
		}
		return { ...common, provider: "r2", accountId, ...(obj["jurisdiction"] === "eu" ? { jurisdiction: "eu" as const } : {}) };
	}
	return {
		...common,
		...(obj["provider"] === "s3" ? { provider: "s3" as const } : {}),
		...(strings["region"] ? { region: strings["region"] } : {}),
		...(strings["profile"] ? { profile: strings["profile"] } : {}),
	};
}

function sourceId(input: RemoteModelSourceInput): string {
	const provider = input.provider ?? "s3";
	// Keep the exact S3 identity algorithm so older saved IDs and tabs stay valid.
	const identity = input.provider === "r2"
		? [input.accountId, input.bucket, input.prefix ?? "", input.jurisdiction ?? ""]
		: [input.bucket, input.prefix ?? "", input.profile ?? ""];
	return `${provider}-${createHash("sha256")
		.update(JSON.stringify(identity))
		.digest("hex").slice(0, 24)}`;
}

/** Do not reflect provider errors, credential-process output, or signed URLs. */
export function remoteSourceErrorMessage(err: unknown): string {
	if (err instanceof RemoteSourceError) return err.message;
	return "Could not read bucket models. For S3, check the region, AWS profile/SSO login, and s3:ListBucket / s3:GetObject permissions. For R2, check the account ID, jurisdiction, R2 credentials, and Object Read permission.";
}

async function readDocument(file: StoredFile, signal: AbortSignal) {
	if (file.size > MAX_MODEL_BYTES) throw new RemoteSourceError("Model exceeds the 5 MiB limit");
	const reader = file.stream().getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	const abort = () => { void reader.cancel().catch(() => {}); };
	signal.addEventListener("abort", abort, { once: true });
	try {
		while (true) {
			signal.throwIfAborted();
			const { value, done } = await reader.read();
			signal.throwIfAborted();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_MODEL_BYTES) throw new RemoteSourceError("Model exceeds the 5 MiB limit");
			chunks.push(value);
		}
		const body = new Uint8Array(bytes);
		let offset = 0;
		for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
		let raw: unknown;
		try { raw = JSON.parse(new TextDecoder().decode(body)); }
		catch { throw new RemoteSourceError("Object is not valid model JSON"); }
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new RemoteSourceError("Object is not a subsystem model");
		}
		const input = raw as Record<string, unknown>;
		if (findSubsystemModelProblems(input).length) {
			throw new RemoteSourceError("Object is not a valid subsystem model");
		}
		// Discard local roots, audit state, and other host-only fields in uploaded records.
		return portableDocumentFrom(input);
	} finally {
		signal.removeEventListener("abort", abort);
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

export function createRemoteModelSources(options: {
	storePath?: () => string;
	storage?: (input: RemoteModelSourceInput) => Promise<ModelStorage>;
} = {}) {
	const storePath = options.storePath ?? (() => join(
		process.env["PRINCIPAL_REMOTE_MODEL_SOURCES_HOME"] ?? join(homedir(), ".principal"),
		"remote-model-sources.json",
	));
	const storage = options.storage ?? modelStorage;

	function list(): RemoteModelSource[] {
		let raw: unknown;
		try { raw = JSON.parse(readFileSync(storePath(), "utf8")); }
		catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new RemoteSourceError("Could not read saved model sources", 500);
		}
		if (!Array.isArray(raw)) throw new RemoteSourceError("Invalid saved model sources", 500);
		return raw.map((value) => {
			if (!value || typeof value !== "object") throw new RemoteSourceError("Invalid saved model source", 500);
			const { id, createdAt, updatedAt, ...input } = value;
			const config = parseRemoteModelSource(input);
			if (id !== sourceId(config) || typeof createdAt !== "string" || typeof updatedAt !== "string") {
				throw new RemoteSourceError("Invalid saved model source", 500);
			}
			return { ...config, id, prefix: config.prefix ?? "", createdAt, updatedAt };
		});
	}

	function getSource(id: string): RemoteModelSource {
		const source = list().find((s) => s.id === id);
		if (!source) throw new RemoteSourceError("Unknown model source", 404);
		return source;
	}

	async function browseSource(source: RemoteModelSourceInput, cursor?: string): Promise<RemoteModelPage> {
		const files = await storage(source);
		const signal = AbortSignal.timeout(60_000);
		let skipped = 0;
		try {
			for (let page = 0; page < MAX_SCAN_PAGES; page++) {
				const result = await files.list({ prefix: source.prefix, cursor, limit: PAGE_SIZE, signal });
				const models: RemoteModelPage["models"] = [];
				const candidates = result.items.filter((f) =>
					f.key.startsWith(source.prefix ?? "") && f.key.toLowerCase().endsWith(".json"));
				// Bound concurrent downloads so large buckets cannot flood the host.
				for (let i = 0; i < candidates.length; i += 5) {
					const settled = await Promise.allSettled(candidates.slice(i, i + 5).map(async (item) => {
						try {
							if (item.size > MAX_MODEL_BYTES) throw new RemoteSourceError("Model exceeds the 5 MiB limit");
							const file = await files.download(item.key, { signal });
							const doc = await readDocument(file, signal);
							models.push({
								key: item.key, title: doc.title.slice(0, 500), description: doc.description?.slice(0, 1000),
								componentCount: doc.components.length, trailCount: doc.trails?.length ?? 0,
								etag: file.etag, lastModified: file.lastModified ?? item.lastModified,
							});
						} catch (err) {
							// Invalid/non-model JSON can coexist with models; denied reads cannot.
							if (!(err instanceof RemoteSourceError)) throw err;
							skipped++;
						}
					}));
					const failure = settled.find((result) => result.status === "rejected");
					if (failure?.status === "rejected") throw failure.reason;
				}
				if (result.cursor && result.cursor === cursor) throw new RemoteSourceError("Storage returned a repeated cursor");
				cursor = result.cursor;
				if (models.length || !cursor) {
					return { models: models.sort((a, b) => a.key.localeCompare(b.key)), cursor, skipped };
				}
			}
			return { models: [], cursor, skipped };
		} finally { files.close?.(); }
	}

	return {
		list,
		getSource,
		async configure(input: unknown) {
			const config = parseRemoteModelSource(input);
			const preview = await browseSource(config);
			if (!preview.models.length) {
				throw new RemoteSourceError(preview.cursor
					? "No valid models in the first 1,000 objects. Use a narrower prefix."
					: "No readable, valid subsystem model JSON found in this bucket/prefix");
			}
			// Read after the network roundtrip; synchronous atomic replacement preserves
			// sources added by concurrent requests in this host.
			const sources = list();
			const id = sourceId(config);
			const existing = sources.find((s) => s.id === id);
			const now = new Date().toISOString();
			const source: RemoteModelSource = {
				...config, id, prefix: config.prefix ?? "",
				createdAt: existing?.createdAt ?? now, updatedAt: now,
			};
			const path = storePath();
			try {
				mkdirSync(dirname(path), { recursive: true });
				const temp = `${path}.${randomUUID()}.tmp`;
				writeFileSync(temp, JSON.stringify([...sources.filter((s) => s.id !== id), source], null, 2), { mode: 0o600 });
				renameSync(temp, path);
			} catch {
				throw new RemoteSourceError("Could not save the model source configuration", 500);
			}
			return { source, preview };
		},
		browse(id: string, cursor?: string) {
			return browseSource(getSource(id), cursor);
		},
		async get(id: string, key: string): Promise<RemoteModel> {
			const source = getSource(id);
			if (!key || !key.startsWith(source.prefix)) throw new RemoteSourceError("Key is outside this source prefix");
			const files = await storage(source);
			const signal = AbortSignal.timeout(30_000);
			try {
				const file = await files.download(key, { signal });
				return { source, key, etag: file.etag, document: await readDocument(file, signal) };
			} finally { files.close?.(); }
		},
	};
}

export const remoteModelSources = createRemoteModelSources();
