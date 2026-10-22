import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConstructTimelinePanel } from "./ConstructTimelineControl";
import type { ConstructTimelineMeta, ConstructTimelineSummary } from "../../shared/construct-timeline";
import { mockConstructTimelineFiles, mockConstructTimelineHistory } from "../../../.storybook/mocks/rpc";

const purl = "pkg:github/example/timeline-with-graphs";
const subjects = ["Add parser declarations", "Refactor rendering", "Remove legacy helpers", "Improve storage"];
let census = 0;
const commits: ConstructTimelineSummary["commits"] = Array.from({ length: 24 }, (_, index) => {
	const introduced = index === 0 ? 24 : 2 + index % 7;
	const removed = index === 0 ? 0 : index % 4;
	census += introduced - removed;
	return {
		sha: (index + 1).toString(16).padStart(40, "0"),
		committedAt: new Date(Date.UTC(2026, 8, 19 + Math.floor(index / 2) * 3, 12 + index % 2 * 4)).toISOString(),
		subject: index === 0 ? "Initial declaration census" : subjects[index % subjects.length]!,
		introduced, removed, changed: index === 0 ? 0 : 1 + index * 3 % 11,
		constructs: census,
	};
}).reverse();
const summary: ConstructTimelineSummary = {
	commits,
	introduced: commits.reduce((total, commit) => total + commit.introduced, 0),
	removed: commits.reduce((total, commit) => total + commit.removed, 0),
	changed: commits.reduce((total, commit) => total + commit.changed, 0),
	size: { newest: commits[0]!.constructs!, oldest: commits.at(-1)!.constructs!, verifiedNewest: commits[0]!.constructs! },
	lifetimes: [],
};
const timelineMeta: ConstructTimelineMeta = {
	version: 1, analyzerVersion: "construct-timeline-v2", purl, status: "idle",
	updatedAt: commits[0]!.committedAt, events: commits.length, constructs: summary.size!.newest,
	elapsedMs: 180_000, retainedBytes: 1_500_000,
	epoch: { sha: commits.at(-1)!.sha, committedAt: commits.at(-1)!.committedAt },
	cursor: { sha: commits[0]!.sha, committedAt: commits[0]!.committedAt },
};

function seed() {
	mockConstructTimelineHistory(commits);
	mockConstructTimelineFiles(commits.map((commit) => ({
		sha: commit.sha, message: commit.subject, analyzed: true, coverageAvailable: true,
		files: Array.from({ length: 12 }, (_, index) => {
			const path = `${["src/parser", "src/render", "lib/storage"][index % 3]}/module-${index}.ts`;
			const verified = Math.floor(commit.constructs! / 12) + (index < commit.constructs! % 12 ? 1 : 0);
			return {
				path, size: 400 + index * 180 + commit.constructs! * 12, kind: "file" as const,
				status: verified ? "verified" as const : "uncovered" as const,
				coverage: { file: path, verified, unresolved: 0, unsupported: 0, error: 0 },
			};
		}),
	})));
}

function PopulatedTimelineDemo() {
	const [cleared, setCleared] = useState(false);
	const [closed, setClosed] = useState(false);
	if (closed) return <button type="button" onClick={() => setClosed(false)}>Reopen timeline</button>;
	return <div style={{ height: 720, display: "flex" }}>
		<ConstructTimelinePanel timeline={{
			purl, loaded: true, busy: false, error: undefined,
			meta: cleared ? undefined : timelineMeta, summary: cleared ? undefined : summary,
			extend: async () => { seed(); setCleared(false); },
			cancel: async () => {},
			reset: async () => { setCleared(true); return true; },
		}} onClose={() => setClosed(true)} />
	</div>;
}

const meta = {
	title: "Constructs/Timeline with graphs",
	component: PopulatedTimelineDemo,
	decorators: [(Story) => <div style={{ padding: 24, maxWidth: 1200 }}><Story /></div>],
	beforeEach: seed,
	parameters: {
		docs: { description: { story: "Full analysis timeline with 24 analyzed commits. Scroll below File City for entry/change/exit bars, census size, and average commit age. Switch between Commits and Days to compare individual commits with UTC-day totals." } },
	},
} satisfies Meta<typeof PopulatedTimelineDemo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
