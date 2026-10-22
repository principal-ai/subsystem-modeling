import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConstructTimelinePanel, ConstructTimelineSection } from "./ConstructTimelineControl";
import type { ConstructTimelineCommit, ConstructTimelineMeta, ConstructTimelineOptions, ConstructTimelineSummary } from "../../shared/construct-timeline";
import { ConstructTimelineExtendDialog } from "./ConstructTimelineExtendDialog";
import { mockConstructTimelineFiles, mockConstructTimelineHistory } from "../../../.storybook/mocks/rpc";

const purl = "pkg:github/example/project-overview";
const history: ConstructTimelineCommit[] = [
	{ sha: "c".repeat(40), committedAt: "2026-10-21T12:00:00Z", subject: "Latest project change" },
	{ sha: "b".repeat(40), committedAt: "2026-10-20T12:00:00Z", subject: "Analyzed snapshot" },
	{ sha: "a".repeat(40), committedAt: "2020-01-01T12:00:00Z", subject: "Project started" },
];
function seed(advanced = false) {
	mockConstructTimelineFiles(history.map((commit) => {
		const analyzed = commit.sha === history[1]!.sha || advanced && commit.sha === history[0]!.sha;
		return { sha: commit.sha, analyzed, coverageAvailable: analyzed,
			files: [{ path: "src/main.ts", size: 400, kind: "file", status: analyzed ? "verified" : "uncovered" }] };
	}));
	mockConstructTimelineHistory(history);
}
function ProjectOverviewDemo({ standalone = false }: { standalone?: boolean }) {
	const [advanced, setAdvanced] = useState(false);
	const [cleared, setCleared] = useState(false);
	const [closed, setClosed] = useState(false);
	const commits = history.filter((_, index) => index === 1 || advanced && index === 0)
		.map((commit) => ({ ...commit, introduced: 0, removed: 0, changed: 0 }));
	const meta: ConstructTimelineMeta = {
		version: 1, analyzerVersion: "construct-timeline-v2", purl, status: "idle",
		updatedAt: "2026-10-21T12:00:00Z", events: commits.length, constructs: 10, elapsedMs: 90_000, retainedBytes: 1_000_000,
		epoch: { sha: history[1]!.sha, committedAt: history[1]!.committedAt },
		cursor: { sha: commits[0]!.sha, committedAt: commits[0]!.committedAt },
	};
	const summary: ConstructTimelineSummary = { commits, introduced: 0, removed: 0, changed: 0, lifetimes: [] };
	const timeline = {
		purl, loaded: true, busy: false, error: undefined,
		meta: cleared ? undefined : meta, summary: cleared ? undefined : summary,
		extend: async () => { seed(true); setAdvanced(true); setCleared(false); },
		cancel: async () => {},
		reset: async () => { setCleared(true); return true; },
	};
	if (closed) return <button type="button" onClick={() => setClosed(false)}>Reopen timeline</button>;
	return standalone ? <ConstructTimelinePanel timeline={timeline} onClose={() => setClosed(true)} />
		: <ConstructTimelineSection timeline={timeline} />;
}
const meta = {
	title: "Constructs/Timeline project overview",
	component: ProjectOverviewDemo,
	decorators: [(Story) => <div style={{ padding: 24, maxWidth: 1200 }}><Story /></div>],
} satisfies Meta<typeof ProjectOverviewDemo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProjectOverview: Story = {
	beforeEach: () => seed(),
	render: () => <ProjectOverviewDemo />,
};
export const StandalonePanel: Story = {
	beforeEach: () => seed(),
	render: () => <ProjectOverviewDemo standalone />,
};

function AnalysisPresetsDemo() {
	const [open, setOpen] = useState(false);
	const [options, setOptions] = useState<ConstructTimelineOptions>({ maxCommits: 50 });
	const [submitted, setSubmitted] = useState<ConstructTimelineOptions>();
	return <>
		<button type="button" onClick={() => setOpen(true)}>Open analysis presets</button>
		{submitted && <output aria-label="Submitted analysis preset">{JSON.stringify(submitted)}</output>}
		{open && <ConstructTimelineExtendDialog options={options} onOptionsChange={setOptions} hasTimeline
			busy={false} running={false} onClose={() => setOpen(false)}
			onSubmit={() => { setSubmitted(options); setOpen(false); }} />}
	</>;
}
export const AnalysisPresets: Story = {
	render: () => <AnalysisPresetsDemo />,
};
