/**
 * OpenCode V2 offline transcript adapter — read `session_v2` + `session_message`
 * from opencode.db and map into UniversalAgentSessionEvent for the shared
 * normalize/accumulate pipeline.
 *
 * Kind is explicit: a row in `session_v2` means V2; a row only in `session`
 * means V1. Do not infer V2 from an empty `event` table.
 */

import { Database } from "bun:sqlite";
import {
	SupportedAgent,
	getFileOperation,
	type UniversalAgentSessionEvent,
	type CommonToolName,
} from "@principal-ai/agent-monitoring";

export type OpencodeSessionKind = "v1" | "v2";

export interface OpencodeV2SessionMeta {
	id: string;
	title: string;
	slug: string;
	agent: string | undefined;
	directory: string | undefined;
	version: string | undefined;
}

export interface OpencodeV2MessageRow {
	id: string;
	session_id: string;
	type: string;
	seq: number;
	time_created: number;
	data: string;
}

function openCodeDBPath(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/opencode.db`;
	const home = env["HOME"] || env["USERPROFILE"] || "/root";
	const xdgData = env["XDG_DATA_HOME"] || `${home}/.local/share`;
	return `${xdgData}/opencode/opencode.db`;
}

function tableExists(db: Database, name: string): boolean {
	const row = db
		.prepare(
			`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
		)
		.get(name) as { ok: number } | null;
	return row != null;
}

function openReadonlyDb(): Database {
	return new Database(openCodeDBPath(), { readonly: true });
}

/**
 * Classify an OpenCode sqlite session id.
 * - `v2` if present in `session_v2`
 * - `v1` if present only in `session`
 * - `null` if neither (not an opencode durable session)
 */
export function resolveOpencodeSessionKind(
	sessionId: string,
	db?: Database,
): OpencodeSessionKind | null {
	const owned = !db;
	let conn = db ?? null;
	try {
		if (!conn) conn = openReadonlyDb();
		if (tableExists(conn, "session_v2")) {
			const v2 = conn
				.prepare(`SELECT 1 AS ok FROM session_v2 WHERE id = ?`)
				.get(sessionId) as { ok: number } | null;
			if (v2) return "v2";
		}
		if (tableExists(conn, "session")) {
			const v1 = conn
				.prepare(`SELECT 1 AS ok FROM session WHERE id = ?`)
				.get(sessionId) as { ok: number } | null;
			if (v1) return "v1";
		}
		return null;
	} catch {
		return null;
	} finally {
		if (owned) {
			try {
				conn?.close();
			} catch {
				/* ignore */
			}
		}
	}
}

export function isOpencodeV2Session(sessionId: string): boolean {
	return resolveOpencodeSessionKind(sessionId) === "v2";
}

export function readOpencodeV2Session(
	sessionId: string,
): {
	meta: OpencodeV2SessionMeta;
	messages: OpencodeV2MessageRow[];
} | null {
	let db: Database | null = null;
	try {
		db = openReadonlyDb();
		if (!tableExists(db, "session_v2")) return null;
		const metaRow = db
			.prepare(
				`SELECT id, title, slug, agent, directory, version
				 FROM session_v2 WHERE id = ?`,
			)
			.get(sessionId) as {
			id: string;
			title: string | null;
			slug: string | null;
			agent: string | null;
			directory: string | null;
			version: string | null;
		} | null;
		if (!metaRow) return null;

		const messages = tableExists(db, "session_message")
			? (db
					.prepare(
						`SELECT id, session_id, type, seq, time_created, data
						 FROM session_message
						 WHERE session_id = ?
						 ORDER BY seq ASC`,
					)
					.all(sessionId) as OpencodeV2MessageRow[])
			: [];

		return {
			meta: {
				id: metaRow.id,
				title: (metaRow.title ?? "").trim() || metaRow.id.slice(0, 12),
				slug: metaRow.slug ?? "",
				agent: metaRow.agent ?? undefined,
				directory: metaRow.directory ?? undefined,
				version: metaRow.version ?? undefined,
			},
			messages,
		};
	} catch {
		return null;
	} finally {
		try {
			db?.close();
		} catch {
			/* ignore */
		}
	}
}

function mapToolName(name: string): CommonToolName {
	const n = name.trim().toLowerCase();
	if (n === "shell" || n === "bash") return "Bash";
	if (n === "read") return "Read";
	if (n === "write") return "Write";
	if (n === "edit" || n === "multiedit") return "Edit";
	if (n === "glob") return "Glob";
	if (n === "grep") return "Grep";
	if (n === "list" || n === "ls") return "Bash";
	if (n === "webfetch") return "WebFetch";
	if (n === "websearch") return "WebSearch";
	if (n === "task") return "Task";
	// Processors pass through agent-native names when unknown.
	return name as CommonToolName;
}

function pathsFromToolInput(input: unknown): string[] {
	if (!input || typeof input !== "object") return [];
	const obj = input as Record<string, unknown>;
	const paths: string[] = [];
	for (const key of ["filePath", "file_path", "path", "pattern", "glob"]) {
		if (typeof obj[key] === "string" && (obj[key] as string).trim()) {
			paths.push(obj[key] as string);
		}
	}
	return paths;
}

function applyFileContext(
	event: UniversalAgentSessionEvent,
	toolName: string,
	toolInput: unknown,
): void {
	const paths = pathsFromToolInput(toolInput);
	if (paths.length === 0) return;
	event.rawFilePaths = [...new Set(paths)];
	const op = getFileOperation(toolName);
	if (op) event.operation = op;
}

/**
 * Map durable V2 session_message rows into universal events for the shared
 * accumulate path.
 */
export function sessionMessagesToUniversalEvents(
	sessionId: string,
	messages: OpencodeV2MessageRow[],
	opts?: { workingDirectory?: string },
): UniversalAgentSessionEvent[] {
	const workingDirectory = opts?.workingDirectory?.trim() || "";
	const out: UniversalAgentSessionEvent[] = [];

	for (const row of messages) {
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(row.data) as Record<string, unknown>;
		} catch {
			continue;
		}
		const time = parsed["time"] as Record<string, unknown> | undefined;
		const created =
			typeof time?.["created"] === "number"
				? time["created"]
				: typeof row.time_created === "number"
					? row.time_created
					: Date.now();

		const base: Omit<UniversalAgentSessionEvent, "eventType"> = {
			sessionId,
			workingDirectory,
			timestamp: created,
			provider: SupportedAgent.OPENCODE,
			raw: { id: row.id, type: row.type, seq: row.seq, data: parsed },
		};

		if (row.type === "user") {
			const text = typeof parsed["text"] === "string" ? parsed["text"] : "";
			out.push({
				...base,
				eventType: "user-prompt-submit",
				data: { prompt: text, messageID: row.id },
			});
			continue;
		}

		if (row.type !== "assistant") continue;

		const content = Array.isArray(parsed["content"])
			? (parsed["content"] as Array<Record<string, unknown>>)
			: [];

		for (const part of content) {
			const partType = typeof part["type"] === "string" ? part["type"] : "";
			const partTime = part["time"] as Record<string, unknown> | undefined;
			const partCreated =
				typeof partTime?.["created"] === "number"
					? partTime["created"]
					: typeof partTime?.["completed"] === "number"
						? partTime["completed"]
						: created;
			const partBase: Omit<UniversalAgentSessionEvent, "eventType"> = {
				...base,
				timestamp: partCreated,
				raw: { ...(base.raw as object), part },
			};

			if (partType === "reasoning") {
				const text = typeof part["text"] === "string" ? part["text"] : "";
				out.push({
					...partBase,
					eventType: "model-reasoning",
					data: { messageID: row.id, message: text },
				});
				continue;
			}

			if (partType === "text") {
				const text = typeof part["text"] === "string" ? part["text"] : "";
				out.push({
					...partBase,
					eventType: "notification",
					data: { messageID: row.id, message: text },
				});
				continue;
			}

			if (partType !== "tool") continue;

			const rawName =
				typeof part["name"] === "string"
					? part["name"]
					: typeof part["tool"] === "string"
						? part["tool"]
						: "unknown";
			const toolName = mapToolName(rawName);
			const callID =
				typeof part["id"] === "string" ? part["id"] : `${row.id}-${partCreated}`;
			const state =
				typeof part["state"] === "object" && part["state"] !== null
					? (part["state"] as Record<string, unknown>)
					: {};
			const input = state["input"];
			const status =
				typeof state["status"] === "string"
					? state["status"].toLowerCase()
					: "";
			const failed =
				status.includes("fail") ||
				status.includes("error") ||
				part["error"] != null;

			const pre: UniversalAgentSessionEvent = {
				...partBase,
				eventType: "pre-tool-use",
				toolName,
				toolInput: input,
				data: { callID, tool: rawName },
			};
			applyFileContext(pre, rawName, input);
			out.push(pre);

			const post: UniversalAgentSessionEvent = {
				...partBase,
				timestamp:
					typeof partTime?.["completed"] === "number"
						? partTime["completed"]
						: partCreated,
				eventType: failed ? "post-tool-use-failure" : "post-tool-use",
				toolName,
				toolInput: input,
				toolOutput: state["content"] ?? state["output"] ?? state["metadata"],
				data: { callID, tool: rawName, status: state["status"] },
			};
			applyFileContext(post, rawName, input);
			out.push(post);
		}
	}

	return out;
}
