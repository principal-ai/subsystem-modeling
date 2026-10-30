/**
 * Detached tab windows — the pure bookkeeping behind "drag a tab out".
 *
 * The host owns the single tab list; a tab is "detached" when it is assigned
 * to a secondary BrowserWindow here. Tabs with no assignment live in the main
 * window. Each detached window also keeps its own active-tab suggestion, the
 * counterpart of the host's `suggestedTabId` for the main window.
 *
 * Kept free of electrobun so it can be unit tested.
 */

export interface Rectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Fixed size for a freshly detached window (shrunk to fit small displays). */
export const DETACHED_WINDOW_SIZE = { width: 1100, height: 800 };

/** Vertical distance from the cursor to the top edge: mid-titlebar. */
const TITLEBAR_GRAB_OFFSET = 18;

function contains(rect: Rectangle, point: Point): boolean {
	return (
		point.x >= rect.x &&
		point.x < rect.x + rect.width &&
		point.y >= rect.y &&
		point.y < rect.y + rect.height
	);
}

function distanceToRect(rect: Rectangle, point: Point): number {
	const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
	const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
	return dx * dx + dy * dy;
}

/** The display whose bounds contain `point`, else the nearest one. */
export function displayNearestPoint<T extends { bounds: Rectangle }>(
	displays: readonly T[],
	point: Point,
): T | null {
	let best: T | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const display of displays) {
		if (contains(display.bounds, point)) return display;
		const distance = distanceToRect(display.bounds, point);
		if (distance < bestDistance) {
			best = display;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * Frame for a window dropped at `point`: the titlebar lands under the cursor
 * and the window is clamped to `workArea` so it never opens half off-screen.
 */
export function placeWindowAtDropPoint(
	point: Point,
	size: { width: number; height: number },
	workArea: Rectangle,
): Rectangle {
	const width = Math.min(size.width, workArea.width);
	const height = Math.min(size.height, workArea.height);
	const maxX = workArea.x + workArea.width - width;
	const maxY = workArea.y + workArea.height - height;
	const x = Math.round(Math.min(Math.max(point.x - width / 2, workArea.x), maxX));
	const y = Math.round(
		Math.min(Math.max(point.y - TITLEBAR_GRAB_OFFSET, workArea.y), maxY),
	);
	return { x, y, width, height };
}

/** Which detached window (if any) hosts each tab, plus per-window suggestions. */
export class TabWindowRegistry {
	private readonly tabWindow = new Map<string, number>();
	private readonly suggestions = new Map<number, string>();

	/** Window hosting `tabId`; `null` means the main window. */
	windowOf(tabId: string): number | null {
		return this.tabWindow.get(tabId) ?? null;
	}

	/** Move `tabId` into detached window `windowId`. */
	assign(tabId: string, windowId: number): void {
		this.tabWindow.set(tabId, windowId);
	}

	/** Return `tabId` to the main window. */
	release(tabId: string): void {
		this.tabWindow.delete(tabId);
	}

	/** Drop all state for a closed tab. */
	forget(tabId: string): void {
		const windowId = this.tabWindow.get(tabId);
		this.tabWindow.delete(tabId);
		if (windowId !== undefined && this.suggestions.get(windowId) === tabId) {
			const next = this.tabsIn(windowId)[0];
			if (next === undefined) this.suggestions.delete(windowId);
			else this.suggestions.set(windowId, next);
		}
	}

	/** Tab ids currently in detached window `windowId`, in insertion order. */
	tabsIn(windowId: number): string[] {
		const ids: string[] = [];
		for (const [tabId, id] of this.tabWindow) if (id === windowId) ids.push(tabId);
		return ids;
	}

	/** Detached window ids that still host at least one tab. */
	windowIds(): number[] {
		return Array.from(new Set(this.tabWindow.values()));
	}

	suggest(windowId: number, tabId: string): void {
		this.suggestions.set(windowId, tabId);
	}

	suggestion(windowId: number): string | null {
		return this.suggestions.get(windowId) ?? null;
	}

	/**
	 * A detached window closed: every tab it still hosted returns to the main
	 * window. Returns those tab ids so the caller can re-focus one.
	 */
	closeWindow(windowId: number): string[] {
		const returned = this.tabsIn(windowId);
		for (const tabId of returned) this.tabWindow.delete(tabId);
		this.suggestions.delete(windowId);
		return returned;
	}
}
