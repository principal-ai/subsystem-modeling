import { CodeCityBuilderWithGrid, diffCityData, interpolateCityData, toCityData, type CityData } from "@principal-ai/file-city-builder";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import type { ConstructTimelineFileSnapshot } from "../../shared/construct-timeline";
import { TIMELINE_FILE_STYLES } from "./timelineFileCity";

export const TIMELINE_CAMERA_CONTROLS = {
	leftDrag: "none", rightDrag: "none", middleDrag: "none", wheel: "pan",
	oneFingerTouch: "none", twoFingerTouch: "none",
	panSpeed: 0, rotateSpeed: 0, zoomSpeed: 0,
} as const;

export function allowTimelineScroll(event: Pick<Event, "stopPropagation">) {
	// File City's wheel handler cancels scrolling even with zero camera speeds.
	// Stop it during capture, leaving the browser's native scrolling intact.
	event.stopPropagation();
}

export function buildTimelineCity(snapshot: ConstructTimelineFileSnapshot): CityData {
	if (!snapshot.files.length) return {
		buildings: [], districts: [], bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
		metadata: { totalFiles: 0, totalDirectories: 0, analyzedAt: new Date(0), rootPath: "/snapshot" },
	};
	const tree = new GitFileTreeBuilder().build({
		files: snapshot.files.map((file) => ({ path: file.path, size: Math.max(1, file.size) })),
		rootPath: "/snapshot", commitSha: snapshot.sha, branch: "snapshot",
	});
	const city = new CodeCityBuilderWithGrid().buildCityFromFileSystem(tree, "");
	const colors = new Map(snapshot.files.map((file) => [file.path, TIMELINE_FILE_STYLES[snapshot.analyzed === false ? "uncovered" : file.status].color]));
	for (const building of city.buildings) {
		building.path = building.path.replace(/^\/snapshot\//, "");
		building.color = colors.get(building.path);
	}
	return city;
}

/** Animate geometry only. Git add/remove colors are not verification evidence. */
export function timelineCityTransition(before: CityData, after: CityData) {
	const diff = diffCityData(before, after);
	// Staged removal-before-addition can empty the city and unmount its canvas.
	// Animate all changes together, including full replacements.
	diff.hasMixedChanges = false;
	const colors = new Map([...before.buildings, ...after.buildings].map((building) => [building.path, building.color]));
	return (progress: number): CityData => {
		if (progress <= 0) return before;
		if (progress >= 1) return after;
		const city = toCityData(interpolateCityData(diff, progress, after));
		city.bounds = { ...city.bounds };
		for (const building of city.buildings) building.color = colors.get(building.path);
		// The renderer frames these bounds, so interpolate them instead of snapping.
		const eased = progress * progress * (3 - 2 * progress);
		for (const key of ["minX", "maxX", "minZ", "maxZ"] as const) {
			city.bounds[key] = before.bounds[key] + (after.bounds[key] - before.bounds[key]) * eased;
		}
		return city;
	};
}
