/**
 * Single-instance + IPC for the principal studio.
 *
 * Wire format: a Unix domain socket at `~/.principal/principal-studio.sock`. Each
 * connection carries one JSON object terminated by `\n`, then closes. The
 * server replies with a single JSON line `{ ok: true } | { ok: false, error }`.
 *
 * Boot logic in the bun host:
 *   1. Try to connect — if a listener answers, send our trail and exit 0.
 *   2. If connect refuses, attempt to bind (unlinking a stale socket file
 *      first if it exists). On success, become the server.
 *
 * Message kinds: `LOAD_TRAIL`, `ACTIVATE_TAB`, `FOCUS`, `LOAD_SUBSYSTEM_GRAPH`.
 */

import { mkdirSync, unlinkSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createServer, createConnection, type Socket } from "node:net";
import { stopHttpServer } from "./http-server";

export const SOCKET_PATH = join(homedir(), ".principal", "principal-studio.sock");

export interface LoadTrailMessage {
	kind: "LOAD_TRAIL";
	trailFile: string;
	mode: "local" | "remote";
	repoRoot?: string;
	ghToken?: string;
	repoOwner?: string;
	repoName?: string;
	repoPurl?: string;
}

export interface ActivateTabMessage {
	kind: "ACTIVATE_TAB";
	/** Permanent tab id to switch to (e.g. `agent-sessions`, `library`). */
	tabId: string;
}

/** Bring a running Studio window forward without changing the active tab. */
export interface FocusMessage {
	kind: "FOCUS";
}

export interface LoadSubsystemModelMessage {
	kind: "LOAD_SUBSYSTEM_GRAPH";
	graphId: string;
}

export type IpcMessage =
	| LoadTrailMessage
	| ActivateTabMessage
	| FocusMessage
	| LoadSubsystemModelMessage;
export type IpcResponse = { ok: true } | { ok: false; error: string };

const CONNECT_TIMEOUT_MS = 500;

/**
 * Try to hand off to a running instance. Returns true if a running instance
 * accepted the message — caller should exit with 0. Returns false if no
 * running instance was reachable (caller becomes the server).
 */
export async function handoffToRunning(message: IpcMessage): Promise<boolean> {
	if (!existsSync(SOCKET_PATH)) return false;

	return new Promise((resolve) => {
		const client = createConnection(SOCKET_PATH);
		const timer = setTimeout(() => {
			client.destroy();
			resolve(false);
		}, CONNECT_TIMEOUT_MS);

		let buffer = "";
		client.on("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
		client.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			const newline = buffer.indexOf("\n");
			if (newline === -1) return;
			clearTimeout(timer);
			try {
				const response = JSON.parse(buffer.slice(0, newline)) as IpcResponse;
				resolve(response.ok);
			} catch {
				resolve(false);
			}
			client.end();
		});
		client.on("connect", () => {
			client.write(`${JSON.stringify(message)}\n`);
		});
	});
}

/**
 * Start the IPC server. Calls `onMessage` for each accepted connection's
 * payload. The server attempts to clean up a stale socket file before binding.
 */
export function startIpcServer(
	onMessage: (msg: IpcMessage) => Promise<IpcResponse>,
): void {
	const dir = dirname(SOCKET_PATH);
	mkdirSync(dir, { recursive: true });

	// If a previous run left a socket file, unlink it. Only do this if no one is
	// listening — handoffToRunning() already proved that for us when it returned
	// false. Still guard against a TOCTOU by stat'ing the file as a Socket type.
	if (existsSync(SOCKET_PATH)) {
		try {
			const stat = statSync(SOCKET_PATH);
			if (stat.isSocket()) unlinkSync(SOCKET_PATH);
		} catch {
			// best effort
		}
	}

	const server = createServer((socket: Socket) => {
		let buffer = "";
		socket.on("data", async (chunk) => {
			buffer += chunk.toString("utf8");
			const newline = buffer.indexOf("\n");
			if (newline === -1) return;
			const line = buffer.slice(0, newline);
			let response: IpcResponse;
			try {
				const msg = JSON.parse(line) as IpcMessage;
				response = await onMessage(msg);
			} catch (err) {
				response = { ok: false, error: (err as Error).message };
			}
			socket.write(`${JSON.stringify(response)}\n`);
			socket.end();
		});
		socket.on("error", () => socket.destroy());
	});

	server.on("error", (err) => {
		console.error(`[principal-studio] IPC server error: ${err.message}`);
	});

	server.listen(SOCKET_PATH, () => {
		console.log(`[principal-studio] IPC listening at ${SOCKET_PATH}`);
	});

	const cleanup = () => {
		try {
			stopHttpServer();
			server.close();
			if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
		} catch {
			// ignore
		}
		process.exit(0);
	};
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	process.on("exit", () => {
		try {
			if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
		} catch {
			// ignore
		}
	});
}
