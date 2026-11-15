import { describe, expect, test } from "bun:test";
import { inActivityWindow, windowStart } from "./repoActivityWindows";

describe("repo activity windows", () => {
	test("starts the month at local midnight on its first day", () => {
		const now = new Date(2026, 10, 14, 12, 30);
		expect(windowStart("month", now)).toEqual(new Date(2026, 10, 1));
		expect(
			inActivityWindow(new Date(2026, 10, 1, 0, 0).toISOString(), "month", now),
		).toBe(true);
		expect(
			inActivityWindow(new Date(2026, 9, 31, 23, 59).toISOString(), "month", now),
		).toBe(false);
		expect(
			inActivityWindow(new Date(2026, 10, 14, 12, 31).toISOString(), "month", now),
		).toBe(false);
	});

	test("starts the week on Sunday", () => {
		const now = new Date(2026, 10, 14, 12, 30);
		expect(windowStart("week", now)).toEqual(new Date(2026, 10, 8));
	});
});
