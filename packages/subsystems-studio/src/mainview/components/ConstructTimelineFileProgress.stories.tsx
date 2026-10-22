import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConstructTimelineFileProgress, ConstructTimelineFilesView } from "./ConstructTimelineFileProgress";
import { electrobun, mockConstructTimelineFiles, mockConstructTimelineHistory } from "../../../.storybook/mocks/rpc";
import type { ConstructTimelineCommit, ConstructTimelineFileSnapshot, ConstructTimelineFileStatus } from "../../shared/construct-timeline";
import { timelineFileCoverage, timelineFileStatus } from "../../shared/construct-timeline";

const statuses: ConstructTimelineFileStatus[] = ["verified", "verified", "verified", "partial", "unresolved", "unsupported", "error", "uncovered"];
const snapshot: ConstructTimelineFileSnapshot = {
	sha: "a".repeat(40), coverageAvailable: true,
	files: [
		...Array.from({ length: 64 }, (_, index) => {
			const status = statuses[index % statuses.length]!;
			const folder = ["src/parser", "src/render", "tests", "lib/storage"][Math.floor(index / 16)]!;
			return { path: `${folder}/module-${index}.ts`, size: 200 + index * 80, kind: "file" as const, status,
				...(status === "uncovered" ? {} : { coverage: { file: `${folder}/module-${index}.ts`,
					verified: status === "verified" ? 3 : status === "partial" ? 2 : 0,
					unresolved: status === "unresolved" || status === "partial" ? 1 : 0,
					unsupported: status === "unsupported" ? 1 : 0, error: status === "error" ? 1 : 0 } }) };
		}),
		{ path: "README.md", size: 1200, kind: "file", status: "non-code" },
		{ path: "vendor/library", size: 0, kind: "submodule", status: "uncovered" },
	],
};

const meta = {
	title: "Constructs/Analysis file city",
	component: ConstructTimelineFilesView,
	args: { snapshot },
	decorators: [(Story) => <div style={{ padding: 24, maxWidth: 1200 }}><Story /></div>],
} satisfies Meta<typeof ConstructTimelineFilesView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MixedCoverage: Story = {};
export const DeclarationOutcomes: Story = {
	args: { snapshot: { sha: "d".repeat(40), coverageAvailable: true, files: [{
		path: "src/Parser.ts", size: 1000, kind: "file", status: "partial",
		coverage: timelineFileCoverage([
			{ file: "src/Parser.ts", symbol: "Parser.parse", construct: "method", span: { startLine: 2, endLine: 8 },
				verification: { status: "verified", evidence: "Source declaration verified." } },
			{ file: "src/Parser.ts", symbol: "Parser.missing", graphStartLine: 12,
				verification: { status: "unresolved", evidence: "The graph anchor and name do not identify one supported source declaration." } },
		])[0]!,
	}] } },
};
export const LegacyCommit: Story = {
	args: { snapshot: { ...snapshot, coverageAvailable: false, files: snapshot.files.map((file) => ({ ...file, status: timelineFileStatus(undefined, file.path, file.kind), coverage: undefined })) } },
};
export const UnsupportedLanguages: Story = {
	args: { snapshot: { sha: "c".repeat(40), coverageAvailable: false,
		files: ["src/main.zig", "src/math.c", "src/math.h", "README.md", "fonts/regular.ttf", "build.zig"].map((path) => ({
			path, size: 400, kind: "file", status: timelineFileStatus(undefined, path),
		})) } },
};
export const NoSupportedCode: Story = {
	args: { snapshot: { sha: "b".repeat(40), coverageAvailable: true, extraction: { status: "no-supported-code", unclassifiedFiles: 1, sensitiveFiles: 0 },
		files: [{ path: "flake.nix", kind: "file", size: 400, status: "unsupported" }] } },
};

function CommitProgressDemo() {
	const [advanced, setAdvanced] = useState(false);
	const commits = [
		...(advanced ? [{ sha: snapshot.sha, subject: "Verify source files", committedAt: "2026-10-21T12:00:00Z", introduced: 24, changed: 0, removed: 0 }] : []),
		{ sha: "b".repeat(40), subject: "Initial configuration", committedAt: "2026-10-20T12:00:00Z", introduced: 0, changed: 0, removed: 0 },
	];
	return <>
		<button type="button" disabled={advanced} onClick={() => setAdvanced(true)}>Record next fixture commit</button>
		<ConstructTimelineFileProgress purl="pkg:github/example/repo" commits={commits} running={!advanced} />
	</>;
}

export const CommitProgress: Story = {
	beforeEach: () => mockConstructTimelineFiles([
		snapshot,
		{ sha: "b".repeat(40), coverageAvailable: true, extraction: { status: "no-supported-code", unclassifiedFiles: 1, sensitiveFiles: 0 },
			files: [{ path: "flake.nix", kind: "file", size: 400, status: "unsupported" }] },
	]),
	render: () => <CommitProgressDemo />,
};

const animationSnapshots: ConstructTimelineFileSnapshot[] = [
	{ sha: "1".repeat(40), coverageAvailable: true, files: [
		{ path: "src/shared.ts", size: 500, kind: "file", status: "verified" },
		{ path: "src/removed.zig", size: 300, kind: "file", status: "unsupported" },
	] },
	{ sha: "2".repeat(40), coverageAvailable: true, files: [
		{ path: "src/shared.ts", size: 5000, kind: "file", status: "partial" },
		{ path: "lib/added.zig", size: 1200, kind: "file", status: "unsupported" },
	] },
	{ sha: "3".repeat(40), coverageAvailable: true, files: [] },
	{ sha: "4".repeat(40), coverageAvailable: true, files: [
		{ path: "retry.ts", size: 100, kind: "file", status: "unresolved" },
	] },
];

function AnimatedCommitsDemo() {
	const [otherRepo, setOtherRepo] = useState(false);
	return <>
		<button type="button" onClick={() => setOtherRepo(!otherRepo)}>Switch fixture repository</button>
		<ConstructTimelineFileProgress purl={`pkg:github/example/${otherRepo ? "other" : "repo"}`} running={false}
			commits={animationSnapshots.map((snapshot, index) => ({
				sha: snapshot.sha, subject: ["Initial layout", "Move, resize, add and remove", "Empty tree", "Retry fixture"][index]!,
				committedAt: "2026-10-21", introduced: 0, changed: 0, removed: 0,
			}))} />
	</>;
}

export const AnimatedCommits: Story = {
	beforeEach: () => {
		mockConstructTimelineFiles(animationSnapshots);
		const original = electrobun.rpc.request["getConstructTimelineFiles"]!;
		let failed = false;
		electrobun.rpc.request["getConstructTimelineFiles"] = async (params) => {
			await new Promise((resolve) => setTimeout(resolve, 600));
			if ((params as { sha: string }).sha === "4".repeat(40) && !failed) {
				failed = true;
				return { ok: false, error: "Fixture snapshot temporarily unavailable." };
			}
			return original(params);
		};
		return () => { electrobun.rpc.request["getConstructTimelineFiles"] = original; };
	},
	render: () => <AnimatedCommitsDemo />,
};

const activityHistory: ConstructTimelineCommit[] = [
	{ sha: "e".repeat(40), committedAt: "2026-10-22T12:00:00Z", subject: "Latest unprocessed snapshot" },
	{ sha: "d".repeat(40), committedAt: "2026-10-21T18:00:00Z", subject: "Unprocessed snapshot on mixed day" },
	{ sha: snapshot.sha, committedAt: "2026-10-21T12:00:00Z", subject: "Analyzed snapshot" },
	...Array.from({ length: 60 }, (_, index) => ({
		sha: (index + 100).toString(16).padStart(40, "0"),
		committedAt: new Date(Date.UTC(2026, 3, index + 1)).toISOString(), subject: `Historical snapshot ${index + 1}`,
	})).reverse(),
	{ sha: "b".repeat(40), committedAt: "2025-12-31T12:00:00Z", subject: "Last year's analyzed snapshot" },
	{ sha: "c".repeat(40), committedAt: "2024-02-29T12:00:00Z", subject: "Leap-day snapshot" },
];
const activityPreviews: ConstructTimelineFileSnapshot[] = ["c", "d", "e"].map((id) => ({
	sha: id.repeat(40), analyzed: false, coverageAvailable: false,
	files: snapshot.files.slice(0, 12).map((file) => ({ ...file, status: "uncovered", coverage: undefined })),
}));
function seedActivity(advanced = false) {
	mockConstructTimelineFiles([snapshot, { ...snapshot, sha: "b".repeat(40) }, ...activityPreviews,
		...(advanced ? [{ ...snapshot, sha: "d".repeat(40), analyzed: true }] : [])]);
	mockConstructTimelineHistory(activityHistory);
}
function ActivitySelectionDemo() {
	const [advanced, setAdvanced] = useState(false);
	const analyzed = new Set([snapshot.sha, "b".repeat(40), ...(advanced ? ["d".repeat(40)] : [])]);
	return <>
		<button type="button" disabled={advanced} onClick={() => { seedActivity(true); setAdvanced(true); }}>Finish preview analysis</button>
		<ConstructTimelineFileProgress purl="pkg:github/example/activity" running={false}
			commits={activityHistory.filter((commit) => analyzed.has(commit.sha)).map((commit) => ({
				...commit, introduced: commit.sha === snapshot.sha ? 30 : 12, changed: 4, removed: commit.sha === snapshot.sha ? 8 : 3,
			}))} />
	</>;
}
export const ActivitySelection: Story = {
	beforeEach: () => seedActivity(),
	render: () => <ActivitySelectionDemo />,
};

const pulseHistory = [
	activityHistory[0]!,
	{ sha: "f".repeat(40), committedAt: "2026-10-21T20:00:00Z", subject: "Next commit on the same day" },
	...activityHistory.slice(1),
];
function seedPulse(completed = 0) {
	mockConstructTimelineFiles([
		snapshot, { ...snapshot, sha: "b".repeat(40) }, ...activityPreviews,
		{ ...activityPreviews[0]!, sha: "f".repeat(40) },
		...(completed >= 1 ? [{ ...snapshot, sha: "d".repeat(40), analyzed: true }] : []),
		...(completed >= 2 ? [{ ...snapshot, sha: "f".repeat(40), analyzed: true }] : []),
	]);
	mockConstructTimelineHistory(pulseHistory);
}
function DailyCommitPulseDemo() {
	const [completed, setCompleted] = useState(0);
	const analyzed = new Set([snapshot.sha, "b".repeat(40),
		...(completed >= 1 ? ["d".repeat(40)] : []), ...(completed >= 2 ? ["f".repeat(40)] : [])]);
	const processing = completed < 2 ? pulseHistory.find((commit) => commit.sha === (completed === 0 ? "d" : "f").repeat(40)) : undefined;
	return <>
		<button type="button" disabled={completed >= 2} onClick={() => { seedPulse(completed + 1); setCompleted(completed + 1); }}>Complete active commit</button>
		<ConstructTimelineFileProgress purl="pkg:github/example/pulse" running={completed < 2} processing={processing}
			commits={pulseHistory.filter((commit) => analyzed.has(commit.sha)).map((commit) => ({
				...commit, introduced: commit.sha === snapshot.sha ? 30 : 12, changed: 4, removed: commit.sha === snapshot.sha ? 8 : 3,
			}))} />
	</>;
}
export const DailyCommitPulse: Story = {
	beforeEach: () => seedPulse(),
	render: () => <DailyCommitPulseDemo />,
};

const liveCommits = [
	{ sha: "3".repeat(40), committedAt: "2026-10-22T12:00:00Z", subject: "Simplify storage" },
	{ sha: "2".repeat(40), committedAt: "2026-10-21T12:00:00Z", subject: "Replace the parser" },
	{ sha: snapshot.sha, committedAt: "2026-10-20T12:00:00Z", subject: "Initial modules" },
];
const removedPaths = ["src/parser/module-12.ts", "tests/module-40.ts", "lib/storage/module-60.ts"];
const liveParserFiles: ConstructTimelineFileSnapshot["files"] = [
	...snapshot.files.filter((file) => !removedPaths.includes(file.path)),
	{ path: "src/parser/nested.ts", size: 2000, kind: "file", status: "verified" },
];
const liveSnapshots: ConstructTimelineFileSnapshot[] = [
	{ ...snapshot, message: "Initial modules" },
	{ ...snapshot, sha: liveCommits[1]!.sha, message: "Replace the parser\n\nHandle nested declarations and preserve source locations.",
		files: liveParserFiles,
		changes: [
			{ path: "src/parser/nested.ts", status: "added" },
			...["src/parser/module-0.ts", "src/parser/module-1.ts", "src/render/module-16.ts"].map((path) => ({ path, status: "modified" as const })),
			...removedPaths.map((path) => {
				const file = snapshot.files.find((file) => file.path === path)!;
				return { path, status: "removed" as const, before: { size: file.size, kind: file.kind } };
			}),
		] },
	{ ...snapshot, sha: liveCommits[0]!.sha, message: "Simplify storage\n\nKeep the commit message and map synchronized.",
		files: liveParserFiles,
		changes: [{ path: "lib/storage/module-48.ts", status: "modified" }, { path: "lib/storage/module-49.ts", status: "modified" }] },
];
function seedLiveChanges() {
	mockConstructTimelineFiles(liveSnapshots);
	mockConstructTimelineHistory(liveCommits);
}
function LiveCommitChangesDemo() {
	const [completed, setCompleted] = useState(0);
	const processing = completed < 2 ? liveCommits[1 - completed] : undefined;
	const analyzed = new Set([snapshot.sha, ...(completed >= 1 ? [liveCommits[1]!.sha] : []), ...(completed >= 2 ? [liveCommits[0]!.sha] : [])]);
	return <>
		<button type="button" disabled={completed >= 2} onClick={() => setCompleted((value) => value + 1)}>Complete active commit</button>
		<ConstructTimelineFileProgress purl="pkg:github/example/live-changes" running={completed < 2} processing={processing}
			commits={liveCommits.filter((commit) => analyzed.has(commit.sha)).map((commit) => ({ ...commit, introduced: 4, changed: 2, removed: 1 }))} />
	</>;
}
export const LiveCommitChanges: Story = {
	beforeEach: () => {
		seedLiveChanges();
		const original = electrobun.rpc.request["getConstructTimelineFiles"]!;
		electrobun.rpc.request["getConstructTimelineFiles"] = async (params) => {
			await new Promise((resolve) => setTimeout(resolve, 350));
			return original(params);
		};
		return () => { electrobun.rpc.request["getConstructTimelineFiles"] = original; };
	},
	render: () => <LiveCommitChangesDemo />,
};

export const ScrollableTimeline: Story = {
	beforeEach: () => seedLiveChanges(),
	render: () => <div aria-label="Scrollable timeline" style={{ height: 520, overflowY: "auto" }}>
		<LiveCommitChangesDemo />
	</div>,
};
