import { describe, expect, test } from "bun:test";
import { selectTimelineExtensionCommits } from "./construct-timeline";

const commits = (...dates: string[]) => dates.map((committedAt, index) => ({ sha: `${index}`, committedAt }));

describe("timeline extension selection", () => {
	test("keeps the 50-commit default but does not impose it on timed or history runs", () => {
		const history = Array.from({ length: 1001 }, (_, index) => ({ sha: `${index}`, committedAt: "2026-10-22T12:00:00Z" }));
		expect(selectTimelineExtensionCommits(history, {})).toHaveLength(50);
		for (const count of [10, 100, 1000]) expect(selectTimelineExtensionCommits(history, { maxCommits: count })).toHaveLength(count);
		for (const maxMinutes of [10, 60]) expect(selectTimelineExtensionCommits(history, { maxMinutes })).toHaveLength(1001);
		for (const historyPeriod of ["day", "week", "month"] as const) {
			expect(selectTimelineExtensionCommits(history, { historyPeriod })).toHaveLength(1001);
		}
	});

	test("uses the next commit's UTC day, with an exclusive midnight boundary", () => {
		const history = commits("2026-10-21T23:00:00-01:00", "2026-10-22T23:59:59Z", "2026-10-23T00:00:00Z");
		expect(selectTimelineExtensionCommits(history, { historyPeriod: "day" })).toEqual(history.slice(0, 2));
	});

	test("covers seven UTC dates starting with the next commit, including across years", () => {
		const history = commits("2026-12-28T18:00:00Z", "2027-01-03T23:59:59Z", "2027-01-04T00:00:00Z");
		expect(selectTimelineExtensionCommits(history, { historyPeriod: "week" })).toEqual(history.slice(0, 2));
	});

	test("uses calendar months and clamps month-end boundaries, including leap years", () => {
		for (const [start, last, end] of [
			["2026-01-31T12:00:00Z", "2026-02-27T23:59:59Z", "2026-02-28T00:00:00Z"],
			["2024-01-31T12:00:00Z", "2024-02-28T23:59:59Z", "2024-02-29T00:00:00Z"],
			["2026-12-15T12:00:00Z", "2027-01-14T23:59:59Z", "2027-01-15T00:00:00Z"],
		]) {
			const history = commits(start!, last!, end!);
			expect(selectTimelineExtensionCommits(history, { historyPeriod: "month" })).toEqual(history.slice(0, 2));
		}
	});

	test("never skips or reorders commits when committer dates are out of order", () => {
		const history = commits("2026-10-22T12:00:00Z", "2026-10-21T12:00:00Z", "2026-10-24T12:00:00Z", "2026-10-22T15:00:00Z");
		expect(selectTimelineExtensionCommits(history, { historyPeriod: "day" })).toEqual(history.slice(0, 2));
	});

	test("handles empty history, explicit combined caps and invalid dates", () => {
		expect(selectTimelineExtensionCommits([], { historyPeriod: "month" })).toEqual([]);
		const history = commits("2026-10-22T12:00:00Z", "2026-10-22T16:00:00Z");
		expect(selectTimelineExtensionCommits(history, { historyPeriod: "day", maxCommits: 1 })).toEqual(history.slice(0, 1));
		expect(() => selectTimelineExtensionCommits(commits("invalid"), { historyPeriod: "day" })).toThrow("invalid commit date");
	});
});
