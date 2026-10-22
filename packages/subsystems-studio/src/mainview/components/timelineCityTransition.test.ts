import { describe, expect, test } from "bun:test";
import type { CityData } from "@principal-ai/file-city-builder";
import { allowTimelineScroll, buildTimelineCity, timelineCityTransition, TIMELINE_CAMERA_CONTROLS } from "./timelineCityTransition";

function city(paths: string[], offset = 0): CityData {
	return {
		buildings: paths.map((path, index) => ({
			path, type: "file", color: "#a78bfa", position: { x: offset + index * 20, y: 0, z: 0 },
			dimensions: [10, 20 + offset, 10],
		})),
		districts: [], bounds: { minX: offset, maxX: offset + 100, minZ: 0, maxZ: 100 },
		metadata: { totalFiles: paths.length, totalDirectories: 0, analyzedAt: new Date(0), rootPath: "" },
	};
}

describe("timeline city transitions", () => {
	test("stops camera wheel handlers without canceling native panel scrolling", () => {
		const wheel = new Event("wheel", { bubbles: true, cancelable: true });
		allowTimelineScroll(wheel);
		expect(wheel.cancelBubble).toBe(true);
		expect(wheel.defaultPrevented).toBe(false);
	});

	test("matches repo-relative paths and preserves verification colors", () => {
		const built = buildTimelineCity({ sha: "a".repeat(40), coverageAvailable: false,
			files: [{ path: "src/main.zig", size: 100, kind: "file", status: "unsupported" }] });
		expect(built.buildings[0]?.path).toBe("src/main.zig");
		expect(built.buildings[0]?.color).toBe("#a78bfa");
	});

	test("moves and resizes matching buildings with exact endpoints and immutable inputs", () => {
		const before = city(["same.ts"]);
		const after = city(["same.ts"], 100);
		const saved = JSON.stringify({ before, after });
		const interpolate = timelineCityTransition(before, after);
		expect(interpolate(0)).toBe(before);
		const middle = interpolate(.5);
		expect(middle.buildings[0]!.position.x).toBe(50);
		expect(middle.buildings[0]!.dimensions[1]).toBe(70);
		expect(middle.bounds.minX).toBe(50);
		expect(interpolate(1)).toBe(after);
		expect(JSON.stringify({ before, after })).toBe(saved);
	});

	test("animates additions and removals without Git red/green evidence colors", () => {
		const before = city(["removed.zig"]);
		const after = city(["added.zig"]);
		const interpolate = timelineCityTransition(before, after);
		for (const progress of [.1, .3, .5, .7, .9]) {
			const frame = interpolate(progress);
			expect(frame.buildings.length).toBeGreaterThan(0);
			for (const building of frame.buildings) expect(building.color).toBe("#a78bfa");
		}
		expect(interpolate(1).buildings.map((building) => building.path)).toEqual(["added.zig"]);
	});

	test("retargets from the currently displayed intermediate geometry", () => {
		const middle = timelineCityTransition(city(["same.ts"]), city(["same.ts"], 100))(.5);
		const redirected = timelineCityTransition(middle, city(["same.ts"], 200));
		expect(redirected(0)).toBe(middle);
		expect(redirected(.5).buildings[0]!.position.x).toBe(125);
	});

	test("supports transitions to and from empty tracked trees", () => {
		const empty = buildTimelineCity({ sha: "a".repeat(40), coverageAvailable: true, files: [] });
		expect(empty.buildings).toEqual([]);
		expect(timelineCityTransition(city(["one.ts"]), empty)(1)).toBe(empty);
		expect(timelineCityTransition(empty, city(["one.ts"]))(.5).buildings.length).toBe(1);
	});

	test("disables every gesture and wheel/pinch speed without disabling building events", () => {
		expect(TIMELINE_CAMERA_CONTROLS).toEqual({
			leftDrag: "none", rightDrag: "none", middleDrag: "none", wheel: "pan",
			oneFingerTouch: "none", twoFingerTouch: "none", panSpeed: 0, rotateSpeed: 0, zoomSpeed: 0,
		});
	});
});
