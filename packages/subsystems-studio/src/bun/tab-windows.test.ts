import { describe, expect, test } from "bun:test";
import {
	displayNearestPoint,
	placeWindowAtDropPoint,
	TabWindowRegistry,
} from "./tab-windows";

const size = { width: 1100, height: 800 };

describe("placeWindowAtDropPoint", () => {
	const workArea = { x: 0, y: 25, width: 1920, height: 1055 };

	test("centers the titlebar under the drop point", () => {
		expect(placeWindowAtDropPoint({ x: 960, y: 200 }, size, workArea)).toEqual({
			x: 410,
			y: 182,
			width: 1100,
			height: 800,
		});
	});

	test("clamps to the work area near the edges", () => {
		expect(placeWindowAtDropPoint({ x: 10, y: 5 }, size, workArea)).toEqual({
			x: 0,
			y: 25,
			width: 1100,
			height: 800,
		});
		expect(placeWindowAtDropPoint({ x: 1915, y: 1075 }, size, workArea)).toEqual({
			x: 820,
			y: 280,
			width: 1100,
			height: 800,
		});
	});

	test("shrinks a window larger than the display", () => {
		const small = { x: 0, y: 0, width: 1024, height: 700 };
		expect(placeWindowAtDropPoint({ x: 500, y: 300 }, size, small)).toEqual({
			x: 0,
			y: 0,
			width: 1024,
			height: 700,
		});
	});
});

describe("displayNearestPoint", () => {
	const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
	const second = { id: 2, bounds: { x: 1920, y: 0, width: 1440, height: 900 } };

	test("prefers the display containing the point", () => {
		expect(displayNearestPoint([primary, second], { x: 2000, y: 100 })).toBe(second);
		expect(displayNearestPoint([primary, second], { x: 100, y: 100 })).toBe(primary);
	});

	test("falls back to the nearest display", () => {
		expect(displayNearestPoint([primary, second], { x: 3500, y: 950 })).toBe(second);
		expect(displayNearestPoint([], { x: 0, y: 0 })).toBeNull();
	});
});

describe("TabWindowRegistry", () => {
	test("tabs live in main until assigned", () => {
		const registry = new TabWindowRegistry();
		expect(registry.windowOf("a")).toBeNull();
		registry.assign("a", 7);
		expect(registry.windowOf("a")).toBe(7);
		expect(registry.tabsIn(7)).toEqual(["a"]);
		registry.release("a");
		expect(registry.windowOf("a")).toBeNull();
		expect(registry.windowIds()).toEqual([]);
	});

	test("closing a window returns its tabs to main", () => {
		const registry = new TabWindowRegistry();
		registry.assign("a", 7);
		registry.assign("b", 7);
		registry.assign("c", 8);
		registry.suggest(7, "b");
		expect(registry.closeWindow(7)).toEqual(["a", "b"]);
		expect(registry.windowOf("a")).toBeNull();
		expect(registry.windowOf("c")).toBe(8);
		expect(registry.suggestion(7)).toBeNull();
	});

	test("forgetting the suggested tab falls back to a sibling", () => {
		const registry = new TabWindowRegistry();
		registry.assign("a", 7);
		registry.assign("b", 7);
		registry.suggest(7, "a");
		registry.forget("a");
		expect(registry.suggestion(7)).toBe("b");
		registry.forget("b");
		expect(registry.suggestion(7)).toBeNull();
		expect(registry.tabsIn(7)).toEqual([]);
	});
});
