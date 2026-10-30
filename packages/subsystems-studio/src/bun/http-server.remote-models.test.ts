import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSubsystemModelRequest } from "./http-server";

let home: string;
const previous = process.env["PRINCIPAL_REMOTE_MODEL_SOURCES_HOME"];
const noop = async () => ({ ok: true });

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "remote-http-dispatch-"));
	process.env["PRINCIPAL_REMOTE_MODEL_SOURCES_HOME"] = home;
});
afterEach(() => {
	if (previous === undefined) delete process.env["PRINCIPAL_REMOTE_MODEL_SOURCES_HOME"];
	else process.env["PRINCIPAL_REMOTE_MODEL_SOURCES_HOME"] = previous;
	rmSync(home, { recursive: true, force: true });
});

test("Studio HTTP dispatcher routes model source discovery", async () => {
	const response = await handleSubsystemModelRequest(
		new Request("http://127.0.0.1:3045/api/model-sources"), noop, noop, noop,
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ ok: true, sources: [] });
});

test("Studio dispatcher rejects invalid source configuration before accessing AWS", async () => {
	const response = await handleSubsystemModelRequest(
		new Request("http://127.0.0.1:3045/api/model-sources", { method: "POST", body: JSON.stringify({ bucket: "s3://invalid" }) }),
		noop, noop, noop,
	);
	expect(response.status).toBe(400);
	expect((await response.json()).error).toContain("bucket name");
});

test("Studio dispatcher does not grant wildcard CORS access to AWS-backed routes", async () => {
	const response = await handleSubsystemModelRequest(
		new Request("http://127.0.0.1:3045/api/model-sources", { method: "OPTIONS", headers: { Origin: "https://example.com" } }),
		noop, noop, noop,
	);
	expect(response.status).toBe(403);
	expect(response.headers.get("access-control-allow-origin")).toBeNull();
});
