import {
	probeOpencodeServer,
	resolveOpencodeConnection,
	type OpencodeConnection,
} from "./server-sessions";
import { resolveOpencode2Bin } from "./opencode-v2";

/** Share service discovery between the model catalog and session execution. */
export async function ensureOpencodeServiceRunning(): Promise<
	{ ok: true; connection: OpencodeConnection } | { ok: false; error: string }
> {
	const existing = resolveOpencodeConnection();
	if (existing) {
		const health = await probeOpencodeServer();
		if (health.running) return { ok: true, connection: existing };
	}

	const bin = resolveOpencode2Bin();
	if (!bin) {
		return {
			ok: false,
			error: "opencode2 is not installed — open the OpenCode V2 tab to install it",
		};
	}

	const proc = Bun.spawn({
		cmd: [bin, "service", "start"],
		stdio: ["ignore", "pipe", "pipe"],
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	if (code !== 0) {
		return {
			ok: false,
			error: `opencode2 service start failed (exit ${code}): ${(stderr || stdout).trim() || "unknown error"}`,
		};
	}

	for (let i = 0; i < 20; i++) {
		await Bun.sleep(150);
		const connection = resolveOpencodeConnection();
		if (!connection) continue;
		const health = await probeOpencodeServer();
		if (health.running) return { ok: true, connection };
	}
	return { ok: false, error: "service started but Studio could not connect yet" };
}
