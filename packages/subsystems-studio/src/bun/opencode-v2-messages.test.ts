import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createAccumulatedState, eventOp } from "@principal-ai/agent-monitoring";
import {
	resolveOpencodeSessionKind,
	sessionMessagesToUniversalEvents,
	type OpencodeV2MessageRow,
} from "./opencode-v2-messages";

function fixtureMessages(): OpencodeV2MessageRow[] {
	const userData = JSON.stringify({
		time: { created: 1_000 },
		text: "Fill gaps in the subsystem model",
	});
	const assistantData = JSON.stringify({
		time: { created: 1_100, completed: 1_500 },
		content: [
			{ type: "reasoning", text: "Checking the graph…", time: { created: 1_100 } },
			{
				type: "tool",
				id: "call_read_1",
				name: "read",
				state: {
					status: "completed",
					input: { filePath: "/tmp/model.json" },
					content: "ok",
				},
				time: { created: 1_200, completed: 1_300 },
			},
			{
				type: "text",
				text: "Done looking at the model.",
				time: { created: 1_400 },
			},
		],
	});
	return [
		{
			id: "msg_user",
			session_id: "ses_test_v2",
			type: "user",
			seq: 1,
			time_created: 1_000,
			data: userData,
		},
		{
			id: "msg_asst",
			session_id: "ses_test_v2",
			type: "assistant",
			seq: 2,
			time_created: 1_100,
			data: assistantData,
		},
	];
}

describe("opencode-v2-messages", () => {
	test("resolveOpencodeSessionKind prefers session_v2 over session", () => {
		const db = new Database(":memory:");
		db.run(`CREATE TABLE session (id TEXT PRIMARY KEY)`);
		db.run(`CREATE TABLE session_v2 (id TEXT PRIMARY KEY)`);
		db.run(`INSERT INTO session VALUES ('ses_v1_only')`);
		db.run(`INSERT INTO session_v2 VALUES ('ses_v2_only')`);
		db.run(`INSERT INTO session VALUES ('ses_both')`);
		db.run(`INSERT INTO session_v2 VALUES ('ses_both')`);

		expect(resolveOpencodeSessionKind("ses_v2_only", db)).toBe("v2");
		expect(resolveOpencodeSessionKind("ses_v1_only", db)).toBe("v1");
		expect(resolveOpencodeSessionKind("ses_both", db)).toBe("v2");
		expect(resolveOpencodeSessionKind("ses_missing", db)).toBeNull();
		db.close();
	});

	test("sessionMessagesToUniversalEvents maps prompt, reasoning, tool, text", () => {
		const events = sessionMessagesToUniversalEvents("ses_test_v2", fixtureMessages(), {
			workingDirectory: "/tmp",
		});
		const types = events.map((e) => e.eventType);
		expect(types).toEqual([
			"user-prompt-submit",
			"model-reasoning",
			"pre-tool-use",
			"post-tool-use",
			"notification",
		]);
		expect(events[0]?.data).toMatchObject({ prompt: "Fill gaps in the subsystem model" });
		expect(events[2]?.toolName).toBe("Read");
		expect(events[2]?.rawFilePaths).toContain("/tmp/model.json");
		expect(events[3]?.eventType).toBe("post-tool-use");
		expect(events.every((e) => e.sessionId === "ses_test_v2")).toBe(true);
		expect(events.every((e) => e.workingDirectory === "/tmp")).toBe(true);
	});

	test("mapped events accumulate without throwing", () => {
		const events = sessionMessagesToUniversalEvents("ses_test_v2", fixtureMessages());
		const state = createAccumulatedState("Maintain — fixture");
		let rows = 0;
		for (const ev of events) {
			const row = eventOp(state, ev as never);
			if (row) rows++;
		}
		// eventOp may skip some types (e.g. reasoning); tools/prompts should emit.
		expect(rows).toBeGreaterThan(0);
		expect(state.sessionName).toBeTruthy();
	});
});
