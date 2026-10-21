import type { Meta, StoryObj } from "@storybook/react";
import type { ConstructInventoryRepo, SourceConstruct } from "../../shared/contract";
import type { ConstructTimelineMeta, ConstructTimelineSummary } from "../../shared/construct-timeline";
import { mockConstructInventory, mockConstructTimeline } from "../../../.storybook/mocks/rpc";
import { VerifiedConstructsView } from "./VerifiedConstructsView";

const purl = "pkg:github/example/repo";
const construct: SourceConstruct = {
	id: "src/calculate.ts\0calculate", name: "calculate", symbol: "calculate", construct: "function",
	file: "src/calculate.ts", packageRelativeFile: "src/calculate.ts", purl, repoKey: purl,
	graphNodeIds: [], graphStartLine: 1,
	models: [{ modelId: "example", modelTitle: "Example", alias: "calculate" }],
	verification: { status: "verified", checkedAt: "2026-10-16T00:00:00Z", evidence: "Saved model audit; source freshness is checked when opened." },
	span: { startLine: 1, endLine: 3, contentHash: "example" },
};
const repo: ConstructInventoryRepo = {
	repoKey: purl, owner: "example", name: "repo", modelCount: 1,
	hasPackageInfo: true, isMonorepo: false, graphStatus: "unknown", inventorySource: "model-audits",
	coverage: { verified: 1, unresolved: 0, unsupported: 0, error: 0 },
	packages: [{ path: "", name: "example", constructs: [construct] }],
};
const timeline: ConstructTimelineMeta = {
	version: 1, analyzerVersion: "construct-timeline-v1", purl, status: "idle",
	updatedAt: "2026-10-16T12:00:00Z",
	epoch: { sha: "a".repeat(40), committedAt: "2026-10-15T12:00:00Z" },
	cursor: { sha: "b".repeat(40), committedAt: "2026-10-16T12:00:00Z" },
	events: 2, constructs: 42, elapsedMs: 15_000, retainedBytes: 12_000,
};
const summary: ConstructTimelineSummary = {
	commits: [
		{ sha: "b".repeat(40), committedAt: "2026-10-16T12:00:00Z", subject: "Update calculation", introduced: 1, removed: 0, changed: 1, constructs: 42 },
		{ sha: "a".repeat(40), committedAt: "2026-10-15T12:00:00Z", subject: "Initial census", introduced: 41, removed: 0, changed: 0, constructs: 41 },
	],
	introduced: 42, removed: 0, changed: 1, lifetimes: [],
	size: { newest: 42, oldest: 41, verifiedNewest: 42 },
};

const meta = {
	title: "Constructs/Timeline",
	component: VerifiedConstructsView,
	decorators: [(Story) => <div style={{ height: "100vh", display: "flex" }}><Story /></div>],
	beforeEach: () => {
		mockConstructInventory(repo);
		mockConstructTimeline(timeline, summary);
	},
} satisfies Meta<typeof VerifiedConstructsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SavedConstructs: Story = {};
export const BeforeAnalysis: Story = {
	beforeEach: () => { mockConstructTimeline(); },
};
export const NoSavedConstructs: Story = {
	beforeEach: () => { mockConstructInventory({ ...repo, packages: [] }); },
};
export const Extending: Story = {
	beforeEach: () => { mockConstructTimeline({ ...timeline, status: "running" }, summary); },
};
export const Interrupted: Story = {
	beforeEach: () => {
		mockConstructTimeline({ ...timeline, status: "interrupted", error: "Interrupted. Extend the timeline to continue from the cursor." }, summary);
	},
};
export const Failed: Story = {
	beforeEach: () => {
		mockConstructTimeline({ ...timeline, status: "failed", error: "History was rewritten since the last extension. Start a new timeline." }, summary);
	},
};
