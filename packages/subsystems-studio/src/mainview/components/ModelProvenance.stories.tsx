/**
 * Stories for the commit-provenance surface — the UI answering "is this model
 * still current with my code?"
 *
 * An **iteration surface, not a wired feature**. Nothing in
 * `SubsystemModelsView` renders `ModelProvenance` yet.
 *
 * ## Read the fixture names carefully
 *
 * Local fixtures (`LocalMatch`, `LocalMoved`, …) use only `purlFreshness` —
 * fields the host actually sends today. **Remote fixtures (`Remote*`) set
 * `remoteFreshness`, which nothing produces.** The host resolves only local
 * checkouts through Alexandria and runs `git rev-parse HEAD`; it has no remote
 * read. Those stories show the shape a remote axis would take, not working
 * data. `combineStatus` already tolerates the field's absence, which is why the
 * local-only stories stay meaningful.
 *
 * Fixtures are typed as the real contract with realistic 40-char shas, so
 * truncation and `pinned → head` pairing render exactly as they will in
 * production. There is deliberately no story showing a commit *count*:
 * `commitStatus` is a string compare, so distance is not computable yet.
 */

import type { CommitDot } from "./ModelProvenance";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
	ModelProvenance,
	CommitDots as CommitDotStrip,
	DirtyBadge,
	ProvenanceBadge,
	ProvenanceDetail,
	provenanceRows,
	summarizeProvenance,
	provenanceCopy,
	type ModelProvenanceData,
} from "./ModelProvenance";

const CORE = "pkg:github/principal-ai/subsystem-modeling";
const REACT = "pkg:github/principal-ai/subsystems-react";
const TEMPORAL = "pkg:github/temporalio/temporal";

/** Real-shaped 40-char shas so `slice(0, 7)` behaves as it will in the app. */
const sha = (seed: string): string =>
	(seed + "0f3c9a17be42d5086ac3719fe5b2d4e08a6c9137").slice(0, 40);

const PIN_CORE = sha("83a9a50950ef50cb11c9c559cbc500cbd92311ee");
const PIN_REACT = sha("e05e6571c633d53e8fa02ded3b5c26fcf23d7050");
const PIN_TMP = sha("0405f547aa6ef018b567d1a6983ffb35be9d567e");
const LIVE_CORE = sha("b2c4e81f0a9d3756ce14b8f2d9071aa5e63c4b21");
const LIVE_TMP = sha("9a71c30e5f8b62d4170ac39e6b5f2d08c4713ea90");

/* ------------------------------------------------------------------ *
 * Local axis — what the host sends today.
 * ------------------------------------------------------------------ */

/** Every referenced repo is still at its pinned commit. */
const LocalMatch: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE, [REACT]: PIN_REACT },
	verifiedAtCommits: { [CORE]: PIN_CORE, [REACT]: PIN_REACT },
	purlFreshness: [
		{ purl: CORE, pinned: PIN_CORE, live: PIN_CORE, status: "match" },
		{ purl: REACT, pinned: PIN_REACT, live: PIN_REACT, status: "match" },
	],
};

/** One repo's local checkout advanced — the row that motivates the surface. */
const LocalMoved: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
};

/**
 * Pinned, but the repo is not registered locally so `headSha` could not run.
 * `unresolved` is **not** a failure — the commit is recorded, it just cannot be
 * compared, and the badge must not imply the model is wrong.
 */
const LocalUnresolved: ModelProvenanceData = {
	createdAtCommits: { [TEMPORAL]: PIN_TMP },
	verifiedAtCommits: { [TEMPORAL]: PIN_TMP },
	purlFreshness: [{ purl: TEMPORAL, pinned: PIN_TMP, status: "unresolved" }],
};

/* ------------------------------------------------------------------ *
 * Anchor-scoped — the drift signal narrowed to what the model anchors to.
 * `changedFiles` is ALSO aspirational; see the doc note above.
 * ------------------------------------------------------------------ */

/**
 * The case that justifies anchor-scoping: the repo moved, but `changedFiles` is
 * empty because nothing this model references is among the changes.
 *
 * In this repo that is a real measurement, not a contrivance: 216 files differ
 * between one model pin and HEAD, while a model anchoring
 * `packages/subsystems-core/src/types/subsystem-model.ts` sees exactly one.
 * This must NOT read as a red "Moved" — it is the false alarm the coarse
 * compare produces constantly.
 */
const DriftButAnchorsClean_FIXTURE: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
	anchorChanges: { [CORE]: { committed: [], dirty: [] } },
};

/**
 * Uncommitted edits only — the repo did **not** move past the pin in any way
 * that verification can be run against. There is no coordinate to re-pin to and
 * nothing owed, but the model may already describe something the working tree
 * no longer says. Deliberately quiet.
 */
const DirtyOnly_FIXTURE: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: PIN_CORE, status: "match" }],
	anchorChanges: {
		[CORE]: {
			dirty: [
				"packages/subsystems-studio/src/bun/purl-commits.ts",
				"packages/subsystems-studio/src/bun/git-repo.ts",
			],
		},
	},
};

/* ----------------------------- auto re-pin ----------------------------- */

/**
 * ⚠️ Aspirational — 22 commits moved, nothing anchored changed, and the pin was
 * promoted automatically. Reads `Current` in green because that is now a
 * *proven* claim: git is content-addressed, so identical anchored files mean an
 * audit at the old pin would return the same verdict.
 */
const RePinApplied_FIXTURE: ModelProvenanceData = {
	...DriftButAnchorsClean_FIXTURE,
	anchorChanges: {
		[CORE]: { committed: [], dirty: [], commitsSincePin: 22, pinOnlyCommits: 0 },
	},
	autoRePin: { status: "applied", commit: LIVE_CORE, at: "2026-09-30T12:00:00.000Z" },
};

/** ⚠️ Aspirational — eligible but not yet promoted. */
const RePinEligible_FIXTURE: ModelProvenanceData = {
	...DriftButAnchorsClean_FIXTURE,
	autoRePin: { status: "eligible", commit: LIVE_CORE },
};

/** ⚠️ Aspirational — uncommitted edits on a referenced file. */
const RePinBlockedDirty_FIXTURE: ModelProvenanceData = {
	...DriftButAnchorsClean_FIXTURE,
	autoRePin: { status: "blocked", blockedBy: "dirty-tree" },
};

/** ⚠️ Aspirational — the pin was orphaned, so "unchanged" is unverifiable. */
const RePinBlockedRewritten_FIXTURE: ModelProvenanceData = {
	...DriftButAnchorsClean_FIXTURE,
	anchorChanges: {
		[CORE]: { committed: [], commitsSincePin: 9, historyRewritten: true },
	},
	autoRePin: { status: "blocked", blockedBy: "history-rewritten" },
};

/* ------------------------------ distance ------------------------------ */

/**
 * ⚠️ Aspirational — the headline case. 22 commits have landed on an anchored
 * file. The badge reads `Changed 22`, which is the number that conveys urgency;
 * the sha it replaced conveyed nothing.
 *
 * 22 is the real measured figure for this repo, from
 * `git rev-list --left-right --count 83a9a50...HEAD`.
 */
const Changed22Commits_FIXTURE: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 22,
			pinOnlyCommits: 0,
		},
	},
};

/**
 * ⚠️ Aspirational `commits` — per-commit flags. Build a dot list where only
 * some commits touched an anchor, so the visual has something to show.
 */
function dots(total: number, touchedAt: number[]): CommitDot[] {
	return Array.from({ length: total }, (_, i) => ({
		sha: sha(`c${i}`),
		touched: touchedAt.includes(i),
	}));
}

/** Drift spread thinly: 22 commits back, 3 scattered through the middle. */
const DotsScattered_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 22,
			pinOnlyCommits: 0,
			commits: dots(22, [4, 11, 17]),
		},
	},
};

/**
 * ⚠️ Aspirational — the damage is recent. 22 commits back but only the last
 * three touched an anchor, which is the case a net diff cannot distinguish from
 * the scattered one above and the one that most changes what you'd do.
 */
const DotsClustered_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 22,
			pinOnlyCommits: 0,
			commits: dots(22, [19, 20, 21]),
		},
	},
};

/**
 * ⚠️ Aspirational — 4 unpushed local commits. The tick sits four dots from the
 * right; everything past it is work the remote has not seen.
 */
const DotsUnpushed_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 22,
			commits: dots(22, [19, 20, 21]),
			remoteIndex: 18,
			remoteAhead: 0,
		},
	},
};

/**
 * ⚠️ Aspirational — the remote is ahead by 3, drawn as hollow rings past the
 * tick. Those commits do not exist in this checkout, so they cannot be dots.
 */
const DotsRemoteAhead_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 22,
			commits: dots(22, [2, 9, 17]),
			remoteIndex: 21,
			remoteAhead: 3,
		},
	},
};

/** ⚠️ Aspirational — in sync: the tick sits at the newest dot. */
const DotsInSync_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 22,
			commits: dots(22, [5, 6]),
			remoteIndex: 21,
			remoteAhead: 0,
		},
	},
};

/** ⚠️ Aspirational — a long range, to exercise the cap and the `+N` overflow. */
const DotsOverflow_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 412,
			pinOnlyCommits: 0,
			commits: dots(412, [409, 410, 411]),
		},
	},
};

/** One commit — the singular case, and the least alarming. */
const ChangedOneCommit_FIXTURE: ModelProvenanceData = {
	...Changed22Commits_FIXTURE,
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 1,
			pinOnlyCommits: 0,
		},
	},
};

/**
 * ⚠️ Aspirational — the pin was orphaned by a rebase or force-push. The raw
 * count would be measured from a merge-base and can overstate reality badly, so
 * it is suppressed and the copy says the history was rewritten instead. The
 * anchor diff still holds, so the verdict is unaffected.
 */
const HistoryRewritten_FIXTURE: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
	anchorChanges: {
		[CORE]: {
			committed: ["packages/subsystems-core/src/types/subsystem-model.ts"],
			commitsSincePin: 1,
			pinOnlyCommits: 1,
			historyRewritten: true,
		},
	},
};

/**
 * ⚠️ Aspirational — drift with anchors clean, but 22 commits behind. The count
 * is deliberately NOT shown here: the verdict says nothing the model references
 * moved, so a number there would manufacture urgency that isn't there.
 */
const Moved22ButClean_FIXTURE: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
	anchorChanges: {
		[CORE]: { committed: [], dirty: [], commitsSincePin: 22, pinOnlyCommits: 0 },
	},
};

/**
 * Drift with no anchor data — the local axis moved but `anchorChanges` was
 * never populated. Reads `22 behind`, not `Unverified`: the audit *did* run and
 * stamped a commit, so the honest claim is an age. What is unknown is whether
 * that verification still holds.
 */
const DriftUnchecked: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
	anchorChanges: { [CORE]: { commitsSincePin: 22 } },
};

/** Three repos, two drifted — one of them anchors-clean, one touched. */
const MultiRepoAnchorMixed_FIXTURE: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE, [REACT]: PIN_REACT, [TEMPORAL]: PIN_TMP },
	verifiedAtCommits: { [CORE]: PIN_CORE, [REACT]: PIN_REACT, [TEMPORAL]: PIN_TMP },
	purlFreshness: [
		{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" },
		{ purl: REACT, pinned: PIN_REACT, live: PIN_REACT, status: "match" },
		{ purl: TEMPORAL, pinned: PIN_TMP, live: LIVE_TMP, status: "moved" },
	],
	anchorChanges: {
		[CORE]: { committed: [], dirty: [] },
		[TEMPORAL]: { committed: ["go/scheduler/workflow.go"] },
	},
};

/* ------------------------------------------------------------------ *
 * Remote axis — ASPIRATIONAL. No host code produces `remoteFreshness`.
 * ------------------------------------------------------------------ */

/** Local is clean, but the remote moved: someone pushed after you verified. */
const RemoteAhead: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: PIN_CORE, status: "match" }],
	remoteFreshness: [
		{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" },
	],
};

/** Your local work moved past the pin; the remote has not. */
const LocalAhead: ModelProvenanceData = {
	...LocalMoved,
	remoteFreshness: [
		{ purl: CORE, pinned: PIN_CORE, live: PIN_CORE, status: "match" },
	],
};

/** Both endpoints moved — the honest label is "we cannot tell how far". */
const Diverged: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
	remoteFreshness: [
		{ purl: CORE, pinned: PIN_CORE, live: LIVE_TMP, status: "moved" },
	],
};

/** No remote configured — the remote axis silently drops out, local stands. */
const NoRemote: ModelProvenanceData = {
	createdAtCommits: { [CORE]: PIN_CORE },
	verifiedAtCommits: { [CORE]: PIN_CORE },
	purlFreshness: [{ purl: CORE, pinned: PIN_CORE, live: LIVE_CORE, status: "moved" }],
};

/**
 * Every badge the rollup can produce.
 *
 * The two drifted-but-clean rows are transient by design: auto re-pin promotes
 * those models to `Current`, so they are what the host reports *before* the
 * promotion lands rather than a steady state worth a story of its own. Kept
 * here because `AllBadges` is the one place that shows the whole matrix, and
 * the distance gate below is what decides whether the count appears.
 */
const BADGE_FIXTURES: Array<[string, ModelProvenanceData]> = [
	["current", LocalMatch],
	["moved, anchors clean", DriftButAnchorsClean_FIXTURE],
	["moved 22, but clean", Moved22ButClean_FIXTURE],
	["uncommitted only", DirtyOnly_FIXTURE],
	["changed 1", ChangedOneCommit_FIXTURE],
	["changed 22", Changed22Commits_FIXTURE],
	["history rewritten", HistoryRewritten_FIXTURE],
	["22 behind, unchecked", DriftUnchecked],
	["behind remote", RemoteAhead],
	["diverged", Diverged],
	["unresolved", LocalUnresolved],
];

/* ------------------------------------------------------------------ */

/* ================================================================== *
 * Stories — one per genuinely distinct state, not per fixture.
 *
 * There are far more fixtures above than stories below, on purpose: the
 * fixtures are the state matrix (and several encode bugs that were actually
 * hit), while the stories are the review surface. Every fixture is reachable
 * from `LogicTable`, so nothing is unreachable — it just does not each earn
 * its own sidebar entry.
 *
 *   States      — the eight outcomes the badge can land on
 *   Aspirational— remote axis + auto re-pin, fields no host sends yet
 *   Badge       — density, all badges at once, and the expand interaction
 *   Regression  — orderings that silently broke before
 * ================================================================== */

const meta = {
	title: "Subsystem/ModelProvenance/States",
	component: ModelProvenance,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => JSX.Element) => (
			<div style={{ padding: 24, maxWidth: 760 }}>
				<Story />
			</div>
		),
	],
	args: { provenance: LocalMatch, open: true },
} satisfies Meta<typeof ModelProvenance>;

export default meta;
type Story = StoryObj<typeof meta>;

/* --------------------------------- states -------------------------------- */

/**
 * The healthy case, and the one that sets the density bar: a bare sha, click
 * to copy. An earlier strip rendered `sha · matches · no remote · created sha ·
 * current` here — four restatements, with `created` duplicating the pin on any
 * model verified only once.
 */
export const Current: Story = {
	args: { provenance: LocalMatch },
};

/**
 * A committed change reached an anchored file. The count leads and the sha is
 * dropped: nobody diffs shas by hand, and 22 commits is the actionable fact.
 */
export const Changed: Story = {
	args: { provenance: Changed22Commits_FIXTURE },
};

/** Uncommitted edits only. Nothing is owed until the edit becomes a commit. */
export const Dirty: Story = {
	args: { provenance: DirtyOnly_FIXTURE },
};

/**
 * Drifted with no anchor data — the local axis is all the host sends today.
 * Reads as an age (`22 behind`), never as "unverified": the audit *did* run.
 */
export const Unchecked: Story = {
	args: { provenance: DriftUnchecked },
};

/** Pinned, but the repo has no local checkout to measure against. */
export const Unresolved: Story = {
	args: { provenance: LocalUnresolved },
};

/**
 * Per-repo granularity: one repo drifted and anchors-clean, one touched, one
 * current. A single model-level verdict would have to throw all three away.
 */
export const MultiRepo: Story = {
	args: { provenance: MultiRepoAnchorMixed_FIXTURE },
};

/* ------------------------------ aspirational ------------------------------ */

const metaAspirational = {
	title: "Subsystem/ModelProvenance/Aspirational",
	component: ModelProvenance,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => JSX.Element) => (
			<div style={{ padding: 24, maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 }}>
				<Story />
			</div>
		),
	],
	args: { provenance: RemoteAhead, open: true },
} satisfies Meta<typeof ModelProvenance>;

export const Aspirational = metaAspirational;
type AspStory = StoryObj<typeof metaAspirational>;

/**
 * ⚠️ Nothing in the host sends `remoteFreshness`. `git rev-parse HEAD` cannot
 * see a remote ref, so this axis needs an `ls-remote` or
 * `refs/remotes/origin/HEAD` lookup plus a second freshness pass. Shown so the
 * four combined states can be argued about, not because they work today.
 */
export const RemoteAxis: AspStory = {
	render: () => (
		<>
			{(
				[
					["behind remote", RemoteAhead],
					["local ahead", LocalAhead],
					["diverged", Diverged],
					["no remote configured", NoRemote],
				] as Array<[string, ModelProvenanceData]>
			).map(([name, data]) => (
				<div key={name}>
					<div style={{ color: "#8b7968", fontSize: 11, marginBottom: 4 }}>{name}</div>
					<ModelProvenance provenance={data} open />
				</div>
			))}
		</>
	),
};

/**
 * ⚠️ Nothing populates `autoRePin`. The pin can only be promoted when nothing
 * anchored moved — a proof, not a shortcut, since git is content-addressed.
 * The two refusals that survive are conditions on *now*: the tree went dirty
 * after verification, or the pin was orphaned by a rewrite.
 */
export const AutoRePinOutcomes: AspStory = {
	render: () => (
		<>
			{(
				[
					["applied", RePinApplied_FIXTURE],
					["eligible", RePinEligible_FIXTURE],
					["blocked · dirty tree", RePinBlockedDirty_FIXTURE],
					["blocked · history rewritten", RePinBlockedRewritten_FIXTURE],
				] as Array<[string, ModelProvenanceData]>
			).map(([name, data]) => (
				<div key={name}>
					<div style={{ color: "#8b7968", fontSize: 11, marginBottom: 4 }}>{name}</div>
					<ModelProvenance provenance={data} open />
				</div>
			))}
		</>
	),
};

/* ---------------------------------- badge ---------------------------------- */

const metaBadge = {
	title: "Subsystem/ModelProvenance/Badge",
	component: ProvenanceBadge,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => JSX.Element) => (
			<div style={{ padding: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<Story />
			</div>
		),
	],
	args: { provenance: LocalMatch },
} satisfies Meta<typeof ProvenanceBadge>;

export const Badge = metaBadge;
type BadgeStory = StoryObj<typeof metaBadge>;

/**
 * ⚠️ Aspirational `commits` — one dot per commit, oldest → newest, coloured
 * where it touched an anchored file.
 *
 * The net diff cannot tell `DotsScattered` from `DotsClustered`: both are "22
 * commits, 1 file changed". The dots show that one is spread across the range
 * and the other is three commits old — which is the difference between
 * re-auditing now and not worrying about it.
 */
export const CommitDots: BadgeStory = {
	render: () => (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			{(
				[
					["scattered — 22 commits, 3 touched", DotsScattered_FIXTURE],
					["clustered — 22 commits, last 3 touched", DotsClustered_FIXTURE],
					["in sync — tick at the newest dot", DotsInSync_FIXTURE],
					["4 unpushed — tick 4 from the right", DotsUnpushed_FIXTURE],
					["remote ahead 3 — hollow rings past the tick", DotsRemoteAhead_FIXTURE],
					["overflow — 412 commits, capped + showing newest", DotsOverflow_FIXTURE],
				] as Array<[string, ModelProvenanceData]>
			).map(([name, data]) => (
				<div key={name}>
					<div style={{ color: "#8b7968", fontSize: 11, marginBottom: 6 }}>{name}</div>
					<ProvenanceDetail provenance={data} />
				</div>
			))}
			<div style={{ maxWidth: 520 }}>
				<div style={{ color: "#8b7968", fontSize: 11, marginBottom: 6 }}>
					legend — filled dot: a local commit · filled + ringed: touched an
					anchored file · heavy outline: the commit the remote ref points at ·
					hollow ring: a commit only the remote has
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
					<CommitDotStrip commits={dots(12, [1, 2, 11])} />
					<CommitDotStrip commits={dots(12, [1, 2, 11])} limit={6} />
					<CommitDotStrip commits={dots(12, [1, 2, 11])} remoteIndex={8} />
					<CommitDotStrip commits={[]} remoteAhead={4} />
				</div>
			</div>
		</div>
	),
};

/**
 * `staleLabel` folds the former "Unverified" states into an age ("22 behind")
 * because the model *was* verified — `verifiedAtCommits` records the commit
 * the audit ran against.
 */
export const AllBadges: BadgeStory = {
	render: () => (
		<>
			{BADGE_FIXTURES.map(([name, data]) => (
				<span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
					<ProvenanceBadge provenance={data} />
					<DirtyBadge provenance={data} />
					<span style={{ color: "#8b7968", fontSize: 11 }}>{name}</span>
				</span>
			))}
		</>
	),
};

/** The list-row interaction: clicking the chip expands the strip in place. */
export const Expands: BadgeStory = {
	render: function Render() {
		const [open, setOpen] = useState(false);
		return (
			<div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 8 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 12px",
						borderRadius: 4,
						border: "1px solid #333",
						background: "rgba(255,255,255,0.02)",
					}}
				>
					<span style={{ flex: 1, fontSize: 14 }}>
						Subsystems Studio — closing a tab with ⌘W
					</span>
					<ProvenanceBadge
						provenance={MultiRepoAnchorMixed_FIXTURE}
						onToggle={() => setOpen(!open)}
						open={open}
					/>
				</div>
				{open && <ProvenanceDetail provenance={MultiRepoAnchorMixed_FIXTURE} />}
			</div>
		);
	},
};

/**
 * Row density across every state. This is the story that caught the ragged
 * column: two branches rendered at content width while the rest stretched, so
 * their text started at a different offset.
 */
export const Density: BadgeStory = {
	render: () => (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			{(
				[
					["current", LocalMatch],
					["touched", Changed22Commits_FIXTURE],
					["dirty", DirtyOnly_FIXTURE],
					["unchecked", DriftUnchecked],
					["no checkout", LocalUnresolved],
				] as Array<[string, ModelProvenanceData]>
			).map(([name, data]) => (
				<div key={name}>
					<div style={{ color: "#8b7968", fontSize: 11, marginBottom: 4 }}>{name}</div>
					<ProvenanceDetail provenance={data} />
				</div>
			))}
		</div>
	),
};

/**
 * The rollup every badge label and colour reads from, over the full fixture
 * matrix — including the ones with no story of their own. This is where a
 * fixture stays reachable.
 */
export const LogicTable: BadgeStory = {
	render: () => (
		<table style={{ borderCollapse: "collapse", fontSize: 13 }}>
			<thead>
				<tr style={{ color: "#8b7968", textAlign: "left" }}>
					<th style={{ padding: "4px 10px 4px 0" }}>fixture</th>
					<th style={{ padding: "4px 10px 4px 0" }}>drift</th>
					<th style={{ padding: "4px 10px 4px 0" }}>anchor</th>
					<th style={{ padding: "4px 10px 4px 0" }}>since pin</th>
					<th style={{ padding: "4px 10px 4px 0" }}>label</th>
				</tr>
			</thead>
			<tbody style={{ fontFamily: "monospace" }}>
				{BADGE_FIXTURES.map(([name, data]) => {
					const s = summarizeProvenance(provenanceRows(data));
					const { label } = provenanceCopy(
						s,
						(data.remoteFreshness ?? []).length > 0,
						data.autoRePin,
					);
					return (
						<tr key={name}>
							<td style={{ padding: "4px 10px 4px 0", fontFamily: "body" }}>{name}</td>
							<td style={{ padding: "4px 10px 4px 0" }}>{s.status}</td>
							<td
								style={{
									padding: "4px 10px 4px 0",
									color:
										s.anchor === "clean"
											? "#3d9a5f"
											: s.anchor === "touched"
												? "#e5534b"
												: "#8b7968",
								}}
							>
								{s.anchor}
							</td>
							<td style={{ padding: "4px 10px 4px 0", opacity: s.historyRewritten ? 0.4 : 1 }}>
								{s.historyRewritten ? "—" : (s.commitsSincePin ?? "—")}
							</td>
							<td style={{ padding: "4px 0", fontFamily: "body" }}>{label}</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	),
};

/* -------------------------------- regression -------------------------------- */

const metaRegression = {
	title: "Subsystem/ModelProvenance/Regression",
	component: ProvenanceBadge,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story: () => JSX.Element) => (
			<div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
				<Story />
			</div>
		),
	],
	args: { provenance: LocalMatch },
} satisfies Meta<typeof ProvenanceBadge>;

export const Regression = metaRegression;
type RegStory = StoryObj<typeof metaRegression>;

/**
 * Two precedence rules, each of which silently broke once.
 *
 * - `dirty` outranks `current` — a model can sit exactly on its pin with
 *   uncommitted edits to an anchor; `anchorVerdict` once short-circuited to
 *   `clean` on `match` and rendered a green "Current".
 * - `current` outranks `clean` — every current model also reads `clean`, so
 *   testing the anchor first swallowed every healthy model into the muted
 *   drift branch.
 */
export const Precedence: RegStory = {
	render: () => (
		<>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<ProvenanceBadge provenance={LocalMatch} />
				<span style={{ color: "#8b7968", fontSize: 11 }}>
					current → green, never muted
				</span>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<ProvenanceBadge provenance={DirtyOnly_FIXTURE} />
				<span style={{ color: "#8b7968", fontSize: 11 }}>
					current + dirty → dirty, never green
				</span>
			</div>
		</>
	),
};

/**
 * The distance gate. A count is only shown when the history is intact, because
 * a rebase orphans the pin and `rev-list` then counts from a merge-base — every
 * rewritten commit reads as both added and removed. Withheld when the anchors
 * are clean, where a number would manufacture urgency the verdict ruled out.
 */
export const DistanceGate: RegStory = {
	render: () => (
		<>
			{(
				[
					["22 commits, touched → shows 22", Changed22Commits_FIXTURE],
					["22 commits, anchors clean → withheld", Moved22ButClean_FIXTURE],
					["rewritten → withheld", HistoryRewritten_FIXTURE],
				] as Array<[string, ModelProvenanceData]>
			).map(([name, data]) => (
				<div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<ProvenanceBadge provenance={data} />
					<span style={{ color: "#8b7968", fontSize: 11 }}>{name}</span>
				</div>
			))}
		</>
	),
};