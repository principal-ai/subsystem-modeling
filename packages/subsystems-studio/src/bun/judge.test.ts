import { describe, expect, mock, test } from "bun:test";
import {
	describeJudgeFailure,
	judgeAnswerSchema,
	ollamaJudge,
	ollamaOrigin,
	parseOllamaJudgeAnswers,
	resolveJudge,
	typesafeJudge,
	type JudgeQuestions,
} from "./judge";

const questions: JudgeQuestions = {
	accurate: { type: "noul", instructions: "Is it accurate?" },
	change_kind: {
		type: "choice",
		instructions: "What kind?",
		criteria: { signature_augment: "Confirming types", identity_fix: "Correcting identity" },
	},
	risk: { type: "score", instructions: "Risk?", criteria: ["Safe", "Needs human", "Unsafe"] },
};

function fetcher(reply: (req: { url: string; body: unknown; init: RequestInit }) => Response | Promise<Response>) {
	return mock(async (url: unknown, init?: RequestInit) =>
		reply({ url: String(url), body: JSON.parse(String(init?.body)), init: init! })) as unknown as typeof fetch;
}

describe("ollamaOrigin", () => {
	test("defaults and normalizes to the origin", () => {
		expect(ollamaOrigin(null)).toBe("http://localhost:11434");
		expect(ollamaOrigin("http://gpu-box:11434/v1/")).toBe("http://gpu-box:11434");
		expect(ollamaOrigin("not a url")).toBe("http://localhost:11434");
	});
});

describe("judgeAnswerSchema", () => {
	test("requires one object per question with bounded fields", () => {
		const schema = judgeAnswerSchema(questions) as { required: string[]; properties: Record<string, { properties: Record<string, unknown>; required: string[] }> };
		expect(schema.required).toEqual(["accurate", "change_kind", "risk"]);
		expect(schema.properties["accurate"]!.required).toEqual(["noul"]);
		expect((schema.properties["change_kind"]!.properties["choice"] as { enum: string[] }).enum)
			.toEqual(["signature_augment", "identity_fix"]);
		expect((schema.properties["risk"]!.properties["score"] as { maximum: number }).maximum).toBe(2);
	});
});

describe("parseOllamaJudgeAnswers", () => {
	test("reshapes a valid reply into Jev's answer format", () => {
		const parsed = parseOllamaJudgeAnswers({
			accurate: { noul: 0.93 },
			change_kind: { choice: "signature_augment", confidence: 0.8 },
			risk: { score: 0.2, confidence: 0.7 },
		}, questions);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.answers["accurate"]).toEqual({ type: "noul", noul: 0.93 });
		expect(parsed.answers["change_kind"]).toEqual({ type: "choice", choice: "signature_augment", confidence: 0.8 });
		expect(parsed.answers["risk"]).toMatchObject({ type: "score", score: 0.2, legend: { "0": "Safe", "2": "Unsafe" } });
	});

	test("clamps noul and confidence but rejects out-of-range scores and unknown choices", () => {
		const clamped = parseOllamaJudgeAnswers({
			accurate: { noul: 1.4 },
			change_kind: { choice: "identity_fix", confidence: -1 },
			risk: { score: 2, confidence: 0.5 },
		}, questions);
		expect(clamped.ok).toBe(true);
		if (clamped.ok) {
			expect((clamped.answers["accurate"] as { noul: number }).noul).toBe(1);
			expect((clamped.answers["change_kind"] as { confidence: number }).confidence).toBe(0);
		}
		expect(parseOllamaJudgeAnswers({
			accurate: { noul: 0.5 }, change_kind: { choice: "made_up", confidence: 1 }, risk: { score: 1, confidence: 1 },
		}, questions)).toMatchObject({ ok: false, message: expect.stringContaining("unknown option") });
		expect(parseOllamaJudgeAnswers({
			accurate: { noul: 0.5 }, change_kind: { choice: "identity_fix", confidence: 1 }, risk: { score: 3, confidence: 1 },
		}, questions)).toMatchObject({ ok: false, message: expect.stringContaining("0–2") });
		expect(parseOllamaJudgeAnswers({ accurate: { noul: 0.5 } }, questions))
			.toMatchObject({ ok: false, message: expect.stringContaining("change_kind") });
	});
});

describe("ollamaJudge", () => {
	test("posts a schema-constrained chat request and returns Jev-shaped answers", async () => {
		const seen: { url: string; body: Record<string, unknown> }[] = [];
		const judge = ollamaJudge({
			model: "qwen3.6:27b",
			baseUrl: "http://gpu-box:11434",
			fetch: fetcher(({ url, body }) => {
				seen.push({ url, body: body as Record<string, unknown> });
				return Response.json({
					message: {
						role: "assistant",
						content: JSON.stringify({
							accurate: { noul: 0.9 },
							change_kind: { choice: "identity_fix", confidence: 0.6 },
							risk: { score: 1.2, confidence: 0.4 },
						}),
					},
					done: true,
				});
			}),
		});
		expect(judge.source).toBe("ollama/qwen3.6:27b");
		const result = await judge.ask({ state: "Proposal rationale: x", questions });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.answers["accurate"] as { noul: number }).noul).toBe(0.9);
		expect(seen).toHaveLength(1);
		expect(seen[0]!.url).toBe("http://gpu-box:11434/api/chat");
		const body = seen[0]!.body;
		expect(body["model"]).toBe("qwen3.6:27b");
		expect(body["stream"]).toBe(false);
		expect(body["format"]).toEqual(judgeAnswerSchema(questions));
		const messages = body["messages"] as { role: string; content: string }[];
		expect(messages[0]!.role).toBe("system");
		expect(messages[1]!.content).toContain("Proposal rationale: x");
		expect(messages[1]!.content).toContain("signature_augment: Confirming types");
		expect(messages[1]!.content).toContain("1: Needs human");
	});

	test("reports HTTP, non-JSON content, and malformed answers as failures", async () => {
		const http = ollamaJudge({ model: "m", fetch: fetcher(() => Response.json({ error: "model not found" }, { status: 404 })) });
		expect(await http.ask({ state: "s", questions })).toMatchObject({ ok: false, kind: "http", status: 404 });

		const text = ollamaJudge({ model: "m", fetch: fetcher(() => Response.json({ message: { content: "I think it is fine" } })) });
		expect(await text.ask({ state: "s", questions })).toMatchObject({ ok: false, kind: "invalid" });

		const partial = ollamaJudge({ model: "m", fetch: fetcher(() => Response.json({ message: { content: JSON.stringify({ accurate: { noul: 0.5 } }) } })) });
		expect(await partial.ask({ state: "s", questions })).toMatchObject({ ok: false, kind: "invalid" });
	});

	test("maps aborts to a timeout failure", async () => {
		const judge = ollamaJudge({
			model: "m",
			fetch: (async () => { throw new DOMException("aborted", "AbortError"); }) as unknown as typeof fetch,
		});
		const result = await judge.ask({ state: "s", questions });
		expect(result).toEqual({ ok: false, kind: "timeout" });
		expect(describeJudgeFailure(judge.name, result as never)).toBe("Ollama request timed out");
	});
});

describe("typesafeJudge", () => {
	test("keeps Jev's wire format", async () => {
		let seen: { url: string; body: Record<string, unknown>; init: RequestInit } | null = null;
		const judge = typesafeJudge({
			apiKey: "k",
			fetch: fetcher((req) => {
				seen = req as never;
				return Response.json({ answers: { accurate: { noul: 0.7 } } });
			}),
		});
		const result = await judge.ask({ state: "s", questions });
		expect(result).toEqual({ ok: true, answers: { accurate: { noul: 0.7 } } });
		expect(seen!.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(seen!.init.headers).toMatchObject({ Authorization: "Bearer k" });
		expect(seen!.body).toEqual({ model: judge.source, state: "s", questions });
	});
});

describe("resolveJudge", () => {
	test("picks Ollama when configured and explains when the model is missing", () => {
		const ready = resolveJudge({ secondOpinionProvider: "ollama", ollamaJudgeModel: "qwen3.6:27b", ollamaBaseUrl: null });
		expect(ready.ok).toBe(true);
		if (ready.ok) expect(ready.judge.source).toBe("ollama/qwen3.6:27b");
		const missing = resolveJudge({ secondOpinionProvider: "ollama", ollamaJudgeModel: null });
		expect(missing).toMatchObject({ ok: false, provider: "ollama", error: expect.stringContaining("judgeModel") });
	});

	test("prefers an explicit key, then settings, for TypeSafe", () => {
		const fromSettings = resolveJudge({ secondOpinionProvider: "typesafe", typesafeApiKey: "stored" });
		expect(fromSettings.ok).toBe(true);
		if (fromSettings.ok) expect(fromSettings.judge.provider).toBe("typesafe");
		const explicit = resolveJudge({ typesafeApiKey: "stored" }, { apiKey: "override", model: "jev-preview" });
		expect(explicit.ok).toBe(true);
		if (explicit.ok) expect(explicit.judge.source).toBe("jev-preview");
	});
});
