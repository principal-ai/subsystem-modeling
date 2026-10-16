import { describe, expect, mock, test } from "bun:test";
import { assessConstructComplexity } from "./jev-complexity";
import { JEV_MODEL, JEV_SYSTEMONE_URL } from "./jev-maintenance";

const input = {
	purl: "pkg:github/example/repo",
	file: "src/example.ts",
	startLine: 10,
	endLine: 12,
	contentHash: "1234567890abcdef1234567890abcdef",
};
const source = "function example() {\n  return 1;\n}";

// Match Jev's documented wire format: five rubric levels mean scores 0–4.
const jevResponse = {
	model: "jev-1.13.0",
	answers: {
		complexity: {
			type: "score",
			score: 2.88,
			confidence: 0.9,
			legend: { "0": "Simple", "1": "Low", "2": "Moderate", "3": "High", "4": "Very high" },
			probabilities: { "0": 0, "1": 0, "2": 0.12, "3": 0.88, "4": 0 },
		},
	},
	usage: { input_tokens: 500, output_tokens: 30 },
};

function setup(body: unknown = jevResponse, status = 200) {
	const readSpan = mock(async () => ({ ok: true, text: source, verified: true }));
	const fetcher = mock(async (_url: unknown, _init?: RequestInit) =>
		Response.json(body, { status }));
	return {
		readSpan,
		fetcher,
		opts: { apiKey: "test-key", readSpan, fetch: fetcher as unknown as typeof fetch },
	};
}

describe("assessConstructComplexity", () => {
	test("sends only the verified construct on an authenticated, bounded request", async () => {
		const { opts, readSpan, fetcher } = setup();
		const response = await assessConstructComplexity(input, opts);
		expect(readSpan).toHaveBeenCalledWith(input);
		expect(fetcher).toHaveBeenCalledTimes(1);
		const [url, init] = fetcher.mock.calls[0]!;
		expect(url).toBe(JEV_SYSTEMONE_URL);
		expect(init?.method).toBe("POST");
		expect(init?.headers).toEqual({
			Authorization: "Bearer test-key",
			"Content-Type": "application/json",
		});
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		const request = JSON.parse(init!.body as string);
		expect(request.model).toBe(JEV_MODEL);
		expect(JSON.parse(request.state)).toEqual({
			file: input.file, startLine: 10, endLine: 12, source,
		});
		expect(request.questions.complexity.type).toBe("score");
		expect(request.questions.complexity.criteria).toHaveLength(5);
		expect(request.questions.complexity.instructions).toContain("Do not score business importance");
		expect(response).toEqual({
			ok: true,
			result: {
				score: 0.72, confidence: 0.9, model: JEV_MODEL,
				contentHash: input.contentHash, checkedAt: expect.any(String),
			},
		});
	});

	test("never sends drifted source", async () => {
		const { opts, fetcher } = setup();
		const response = await assessConstructComplexity(input, {
			...opts,
			readSpan: async () => ({ ok: true, text: source, verified: false }),
		});
		expect(response.ok).toBe(false);
		expect(response.error).toContain("drifted");
		expect(fetcher).not.toHaveBeenCalled();
	});

	test("returns source read errors without contacting Jev", async () => {
		const { opts, fetcher } = setup();
		expect(await assessConstructComplexity(input, {
			...opts,
			readSpan: async () => ({ ok: false, error: "no local checkout for this repo" }),
		})).toEqual({ ok: false, error: "no local checkout for this repo" });
		expect(fetcher).not.toHaveBeenCalled();
	});

	test("missing API key returns setup instructions without reading or sending source", async () => {
		const previous = [process.env["TYPESAFE_API_KEY"], process.env["PRINCIPAL_JEV_API_KEY"]];
		delete process.env["TYPESAFE_API_KEY"];
		delete process.env["PRINCIPAL_JEV_API_KEY"];
		try {
			const { opts, readSpan, fetcher } = setup();
			const response = await assessConstructComplexity(input, { ...opts, apiKey: "" });
			expect(response.error).toContain("Settings → Jev");
			expect(readSpan).not.toHaveBeenCalled();
			expect(fetcher).not.toHaveBeenCalled();
		} finally {
			for (const [index, key] of ["TYPESAFE_API_KEY", "PRINCIPAL_JEV_API_KEY"].entries()) {
				if (previous[index] == null) delete process.env[key];
				else process.env[key] = previous[index];
			}
		}
	});

	test("does not reflect HTTP error bodies", async () => {
		const { opts } = setup({ secret: "do not display" }, 401);
		expect(await assessConstructComplexity(input, opts)).toEqual({ ok: false, error: "Jev HTTP 401" });
	});

	for (const [score, normalized] of [[0, 0], [0.72, 0.18], [1, 0.25], [2, 0.5], [2.88, 0.72], [4, 1]] as const) {
		test(`normalizes rubric score ${score} to ${normalized}`, async () => {
			const { opts } = setup({ answers: { complexity: { score } } });
			const response = await assessConstructComplexity(input, opts);
			expect(response.ok).toBe(true);
			expect(response.result?.score).toBeCloseTo(normalized);
			expect(response.result?.confidence).toBeUndefined();
		});
	}

	for (const answer of [{}, { score: "0.5" }, { score: -0.1 }, { score: 4.1 }, { score: null }]) {
		test(`rejects malformed complexity answer ${JSON.stringify(answer)}`, async () => {
			const { opts } = setup({ answers: { complexity: answer } });
			const response = await assessConstructComplexity(input, opts);
			expect(response.ok).toBe(false);
			expect(response.result).toBeUndefined();
			expect(response.error).toContain("expected 0–4");
		});
	}

	test("rejects missing answers", async () => {
		const { opts } = setup({});
		expect((await assessConstructComplexity(input, opts)).ok).toBe(false);
	});

	test("ignores invalid optional confidence", async () => {
		const { opts } = setup({ answers: { complexity: { score: 0.5, confidence: 2 } } });
		const response = await assessConstructComplexity(input, opts);
		expect(response.ok).toBe(true);
		expect(response.result?.confidence).toBeUndefined();
	});

	test("handles timeouts", async () => {
		const { opts } = setup();
		const response = await assessConstructComplexity(input, {
			...opts,
			fetch: (async () => { throw new DOMException("timeout", "TimeoutError"); }) as unknown as typeof fetch,
		});
		expect(response).toEqual({ ok: false, error: "Jev complexity request timed out." });
	});

	test("does not reflect transport details", async () => {
		const { opts } = setup();
		const response = await assessConstructComplexity(input, {
			...opts,
			fetch: (async () => { throw new Error("sensitive request details"); }) as unknown as typeof fetch,
		});
		expect(response).toEqual({ ok: false, error: "Jev complexity assessment failed. Please retry." });
	});

	test("handles invalid JSON", async () => {
		const { opts } = setup();
		const response = await assessConstructComplexity(input, {
			...opts,
			fetch: (async () => new Response("not json")) as unknown as typeof fetch,
		});
		expect(response.ok).toBe(false);
	});
});
