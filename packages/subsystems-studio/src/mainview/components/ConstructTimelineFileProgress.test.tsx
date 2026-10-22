import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import type { ConstructTimelineFileSnapshot, ConstructTimelineFileStatus } from "../../shared/construct-timeline";
import { timelineChangeLayers, timelineChangeSnapshot, timelineFileExplanation, timelineFileLayers } from "./timelineFileCity";
import { timelineFileStatus } from "../../shared/construct-timeline";

mock.module("../rpc", () => ({ electrobun: { rpc: { request: {} } } }));
const { ConstructTimelineFileProgress, ConstructTimelineFilesView, ConstructTimelineFileDetails, ConstructTimelineFileDetailsOverlay } = await import("./ConstructTimelineFileProgress");

const statuses: ConstructTimelineFileStatus[] = ["verified", "partial", "unresolved", "unsupported", "error", "uncovered", "non-code"];
const snapshot: ConstructTimelineFileSnapshot = {
	sha: "a".repeat(40), coverageAvailable: true,
	files: statuses.map((status) => ({ path: `src/${status}.ts`, size: 100, kind: "file", status })),
};

function render(files = snapshot) {
	return renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}><ConstructTimelineFilesView snapshot={files} /></ThemeProvider>);
}

describe("timeline file progress", () => {
	test("replaces the snapshot heading with the commit subject while following analysis", () => {
		const renderProgress = (running: boolean) => {
			const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
				<ConstructTimelineFileProgress purl="pkg:github/test/repo" running={running}
					commits={[{ sha: snapshot.sha, committedAt: "2026-02-22T12:00:00Z", subject: "Snapshot", introduced: 0, removed: 0, changed: 0 }]} />
			</ThemeProvider>);
			return html.slice(html.indexOf('aria-label="File coverage summary"'), html.indexOf('aria-label="Commit file map"'));
		};
		const sidebar = renderProgress(true);
		expect(sidebar).toContain('aria-label="Commit message"');
		expect(sidebar).toContain("Snapshot");
		expect(sidebar).not.toContain("Feb 22, 2026 snapshot");
		expect(sidebar).not.toContain("File coverage</h3>");
		expect(renderProgress(false)).toContain("Feb 22, 2026 snapshot");
		expect(sidebar).not.toContain("Updating");
		expect(sidebar).not.toContain("Loading");
		expect(sidebar).not.toContain("Showing the previous snapshot");
	});

	test("shows the escaped commit message and Git legend instead of coverage statistics", () => {
		const live: ConstructTimelineFileSnapshot = { ...snapshot, message: "Fix <parser>\n\nKeep multiline details & context.",
			changes: [{ path: "src/verified.ts", status: "modified" }, { path: "new.ts", status: "added" },
				{ path: "deleted.ts", status: "removed", before: { size: 123, kind: "file" } }] };
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}><ConstructTimelineFilesView snapshot={live} showChanges /></ThemeProvider>);
		expect(html).toContain("Fix &lt;parser&gt;\n\nKeep multiline details &amp; context.");
		expect(html).toContain('aria-label="Commit change legend"');
		expect(html).toContain("Added 1");
		expect(html).toContain("Modified 1");
		expect(html).toContain("Removed 1");
		expect(html).not.toContain("files verified");
		expect(html).not.toContain("tracked files");
		expect(html).not.toContain("Observed declarations");
		expect(html).not.toContain("Historical coverage unavailable");
		expect(html).not.toContain('aria-label="File coverage legend"');
		expect(render(live)).toContain("files verified");
		expect(render(live)).not.toContain("Fix &lt;parser&gt;");
	});

	test("limits commit messages to the first 200 characters with an ellipsis only when truncated", () => {
		const preview = (message: string | undefined, subject?: string) => {
			const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
				<ConstructTimelineFilesView snapshot={{ ...snapshot, message }} showChanges commitSubject={subject} />
			</ThemeProvider>);
			return html.match(/aria-label="Commit message"[^>]*>([\s\S]*?)<\/div>/)?.[1];
		};
		expect(preview("a".repeat(199))).toBe("a".repeat(199));
		expect(preview("a".repeat(200))).toBe("a".repeat(200));
		expect(preview("a".repeat(200) + "hidden tail")).toBe("a".repeat(200) + "…");
		expect(preview("😀".repeat(200) + "hidden tail")).toBe("😀".repeat(200) + "…");
		expect(preview(undefined, "b".repeat(201))).toBe("b".repeat(200) + "…");
		expect(preview("")).toBe("No commit message.");
		expect(preview(undefined)).toBeUndefined();
	});

	test("uses separate high-priority diff highlights and display-only neutral deleted buildings", () => {
		const live: ConstructTimelineFileSnapshot = { ...snapshot, changes: [
			{ path: "src/verified.ts", status: "modified" },
			{ path: "old\t\nname.ts", status: "removed", before: { size: 321, kind: "symlink" } },
		] };
		const visible = timelineChangeSnapshot(live);
		expect(visible.files).toHaveLength(snapshot.files.length + 1);
		expect(visible.files.at(-1)).toEqual({ path: "old\t\nname.ts", size: 321, kind: "symlink", status: "uncovered" });
		expect(visible.files.every((file) => file.status === "uncovered" && !file.coverage)).toBe(true);
		expect(live.files).toEqual(snapshot.files);
		const layers = timelineChangeLayers(visible);
		expect(layers.map((layer) => layer.id)).toEqual(["change-modified", "change-removed"]);
		expect(layers.every((layer) => layer.priority > timelineFileLayers(visible)[0]!.priority)).toBe(true);
		expect(layers[1]!.items).toEqual([{ path: "old\t\nname.ts", type: "file", renderStrategy: "fill" }]);
		expect(timelineChangeSnapshot({ ...live, changes: [] }).files).toHaveLength(snapshot.files.length);
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFileDetails file={visible.files.at(-1)!} coverageAvailable={false} analyzed={false} removed />
		</ThemeProvider>);
		expect(html).toContain("Removed in this commit.");
		expect(html).toContain("321 bytes before removal");
		expect(html).not.toContain("Not analyzed");
	});

	test("distinguishes empty diffs from unavailable metadata without inventing changes", () => {
		const show = (changes: ConstructTimelineFileSnapshot["changes"]) => renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFilesView snapshot={{ ...snapshot, changes }} commitSubject="Fallback subject" showChanges />
		</ThemeProvider>);
		expect(show([])).toContain("No file changes.");
		expect(show([])).not.toContain("unavailable");
		expect(show(undefined)).toContain("Commit file changes unavailable.");
		expect(show(undefined)).toContain("Fallback subject");
		expect(show(undefined)).not.toContain("No file changes.");
		expect(timelineChangeLayers(snapshot)).toEqual([]);
	});

	test("colors every file with its recorded status using exact repo-relative paths", () => {
		const layers = timelineFileLayers(snapshot);
		expect(layers).toHaveLength(7);
		expect(layers.find((layer) => layer.id === "verified")!.items).toEqual([
			{ path: "src/verified.ts", type: "file", renderStrategy: "fill" },
		]);
		expect(layers.every((layer) => layer.enabled)).toBe(true);
	});

	test("shows map coverage without file tree controls", () => {
		const html = render();
		expect(html).toContain("1 / 7 files verified (14%)");
		expect(html).toContain('aria-label="Partial 1"');
		expect(html).not.toContain('aria-label="Commit file tree"');
		expect(html).not.toContain('aria-label="Filter file tree by coverage"');
		expect(html).not.toContain('aria-label="Search commit files"');
		expect(html).not.toContain("Click a building for file details");
	});

	test("keeps the summary concise without the removed help section or building hint", () => {
		const html = render();
		expect(html).toContain("files verified");
		expect(html).toContain("Observed declarations, not full source coverage");
		expect(html).toContain('aria-label="Unsupported 1"');
		expect(html).not.toContain("Current verifier supports");
		expect(html).not.toContain("About these results");
		expect(html).not.toContain("Click a building for file details");
		expect(html).not.toContain("<details");
	});

	test("groups controls, coverage and file details to the left of the map", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFilesView snapshot={snapshot} sidebar={<h3>Commit controls</h3>} />
		</ThemeProvider>);
		const summary = html.indexOf('aria-label="File coverage summary"');
		const map = html.indexOf('aria-label="Commit file map"');
		expect(summary).toBeGreaterThan(-1);
		expect(map).toBeGreaterThan(summary);
		const left = html.slice(summary, map);
		expect(left).toContain("Commit controls");
		expect(left).toContain("1 / 7 files verified");
		expect(left).toContain('aria-label="File coverage legend"');
		expect(left).not.toContain('aria-label="Selected file coverage"');
		expect(left).not.toContain("Click a building for file details");
		expect(html).toContain("flex-wrap:wrap");
		expect(html).toContain("flex:2 1 480px");
	});

	test("renders selected-file details as a bounded, dismissible sidebar overlay", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFileDetailsOverlay file={snapshot.files[0]!} coverageAvailable onClose={() => {}} />
		</ThemeProvider>);
		expect(html).toContain('role="region" aria-label="Selected file coverage"');
		expect(html).toContain('aria-label="Close file details"');
		expect(html).toContain("position:absolute");
		expect(html).toContain("inset:0");
		expect(html).toContain("overflow-y:auto");
		expect(html).toContain("src/verified.ts");
		expect(html).not.toContain('aria-modal="true"');
	});

	test("surfaces unsupported types in legacy snapshots without claiming historical verification", () => {
		const files = ["main.zig", "main.c", "README.md", "logo.png", "main.ts"].map((path) => ({
			path, kind: "file" as const, size: 100, status: timelineFileStatus(undefined, path),
		}));
		const legacy = { ...snapshot, coverageAvailable: false, files };
		const html = render(legacy);
		expect(html).toContain('aria-label="Unsupported 2"');
		expect(html).toContain("Non-code 2");
		expect(html).toContain("No evidence 1");
		expect(html).toContain("Historical coverage unavailable");
		expect(html).toContain("Colors reflect current file-type support");
		expect(timelineFileExplanation(files[0]!, false)).toContain("current analyzer");
		expect(timelineFileExplanation(files[2]!, false)).toContain("not a construct-verification target");
		expect(timelineFileExplanation(files[4]!, false)).toContain("not recorded for this commit");
		const layers = timelineFileLayers(legacy);
		expect(layers.find((layer) => layer.id === "unsupported")!.items.map((item) => item.path)).toEqual(["main.zig", "main.c"]);
	});

	test("labels old coverage and no-supported-code snapshots honestly", () => {
		const html = render({ ...snapshot, coverageAvailable: false, files: [{ path: "flake.nix", kind: "file", size: 10, status: "uncovered" }],
			extraction: { status: "no-supported-code", unclassifiedFiles: 7, sensitiveFiles: 1 } });
		expect(html).toContain("Historical coverage unavailable");
		expect(html).toContain("0 / 1 files verified (0%)");
		expect(html).toContain("No supported code found in this snapshot");
	});

	test("renders an empty tracked tree without a city or division by zero", () => {
		const html = render({ ...snapshot, files: [] });
		expect(html).toContain("0 / 0 files verified (0%)");
		expect(html).toContain("no tracked files");
		expect(html).not.toContain("NaN");
	});

	test("shows each candidate's outcome, reason and qualified location without treating graph lines as verified", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFileDetails coverageAvailable file={{ path: "src/parser.ts", size: 100, kind: "file", status: "partial",
				coverage: { file: "src/parser.ts", verified: 1, unresolved: 1, unsupported: 1, error: 1, declarations: [
					{ symbol: "Parser.parse", construct: "method", status: "verified", startLine: 2, endLine: 8 },
					{ symbol: "Parser.missing", status: "unresolved", graphStartLine: 12, evidence: "No matching declaration." },
					{ symbol: "Parser.unsupported", status: "unsupported", evidence: "No bundled parser." },
					{ symbol: "<unsafe>", status: "error", evidence: "Could not read source." },
				] } }} />
		</ThemeProvider>);
		expect(html).toContain('aria-label="Declaration verification outcomes"');
		expect(html).toContain("Parser.parse");
		expect(html).toContain("Verified lines 2–8");
		expect(html).toContain("Parser.missing");
		expect(html).toContain("Unresolved");
		expect(html).toContain("Graph candidate at line 12 (unverified location)");
		expect(html).not.toContain("Verified lines 12");
		expect(html).toContain("No matching declaration.");
		expect(html).toContain("No bundled parser.");
		expect(html).toContain("Could not read source.");
		expect(html).toContain("&lt;unsafe&gt;");
	});

	test("keeps older count-only results readable without inventing declaration names", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFileDetails coverageAvailable file={{ path: "old.ts", kind: "file", size: 100, status: "partial",
				coverage: { file: "old.ts", verified: 2, unresolved: 1, unsupported: 0, error: 0 } }} />
		</ThemeProvider>);
		expect(html).toContain("2 verified · 1 unresolved");
		expect(html).toContain("This commit saved counts only");
		expect(html).toContain("Reanalysis is required");
		expect(html).not.toContain('aria-label="Declaration verification outcomes"');
	});

	test("offers follow-latest and historical commit selection without starting analysis", () => {
		const html = renderToStaticMarkup(<ThemeProvider theme={slateNeonTheme}>
			<ConstructTimelineFileProgress purl="pkg:github/example/repo" running commits={[
				{ sha: snapshot.sha, subject: "Current snapshot", committedAt: "2026-10-21", introduced: 1, changed: 0, removed: 0 },
			]} />
		</ThemeProvider>);
		expect(html).toContain("Follow latest");
		expect(html).toContain('aria-label="Activity year"');
		expect(html).not.toContain('aria-label="File coverage commit"');
		expect(html).toContain("Current snapshot");
		expect(html).not.toContain("Oct 21, 2026 snapshot");
		expect(html).not.toContain(snapshot.sha.slice(0, 8));
		expect(html).not.toContain("Colors update after each commit finishes");
		expect(html).not.toContain("Updating");
		expect(html).not.toContain("Selected commit:");
		expect(html).not.toContain("Displaying map:");
		expect(html).not.toContain("File colors show recorded");
	});

	test("labels an unanalyzed Git preview without implying failed or zero-percent verification", () => {
		const preview = { ...snapshot, analyzed: false, coverageAvailable: false,
			files: snapshot.files.map((file) => ({ ...file, status: "uncovered" as const, coverage: undefined })) };
		const html = render(preview);
		expect(html).toContain("Not analyzed");
		expect(html).toContain("Git snapshot only");
		expect(html).toContain("does not start analysis");
		expect(html).not.toContain("Historical coverage unavailable");
		expect(html).not.toContain('aria-label="Files with verified candidates only"');
		expect(html).not.toContain('aria-label="File coverage legend"');
		const layers = timelineFileLayers({ ...snapshot, analyzed: false });
		expect(layers).toHaveLength(1);
		expect(layers[0]!.id).toBe("uncovered");
	});
});
