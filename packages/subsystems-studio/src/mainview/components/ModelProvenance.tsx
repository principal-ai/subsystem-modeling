/**
 * ModelProvenance — how far a stored subsystem model's verification is from the
 * code as it stands right now.
 *
 * A pure presentational component: it renders what the host hands it and never
 * shells out. The badge answers one question at list-row density — *is this
 * model current with the code?* — and clicking it expands the strip, which is
 * where commit shas live. The badge deliberately never prints a sha: a model
 * pins one commit **per referenced repo**, so a single sha on the row would
 * read as a whole-model coordinate and silently be wrong for every model that
 * spans repos.
 *
 * ## Two axes: local and remote
 *
 * `purlFreshness` (the local axis) is live on the wire today. The remote axis
 * is **not** — nothing in the host compares a pin against `origin`. It is
 * modeled here and carried in stories so the shapes can be argued about, but
 * `remoteFreshness` will arrive undefined until the host grows a remote read.
 * See the `remoteFreshness` prop for exactly what would need to change.
 *
 * Combined per repo:
 *
 * | local    | remote   | status        | meaning                                  |
 * | -------- | -------- | ------------- | ---------------------------------------- |
 * | `match`  | `match`  | `current`     | verified against the tip                  |
 * | `match`  | `moved`  | `remote-ahead`| someone pushed since you verified         |
 * | `moved`  | `match`  | `local-ahead` | **your local code moved since verifying**  |
 * | `moved`  | `moved`  | `diverged`    | both endpoints moved; distance unknown    |
 * | `unresolved` | —    | `unresolved`  | no local checkout, nothing to compare     |
 *
 * `diverged` means *both ends moved and we cannot tell how far apart* — not
 * that git proved a divergence. Proving that needs a `merge-base
 * --is-ancestor` call, which the host does not make.
 *
 * ## Deliberate omissions
 *
 * - **No commit distance.** `commitStatus` is a string compare
 *   (`purl-commits.ts:180`), so a rollback and a 500-commit drift are the same
 *   `"moved"`. Anything reading `behindBy` here is inventing data.
 * - **No dirty indicator.** A dirty tree has no reproducible name, so it is
 *   never recorded as a coordinate (`subsystem-model.ts:388-392`). Anchor-level
 *   dirtiness surfaces per declaration instead, via `lineHash`.
 *
 * Extracted as its own module so it can be iterated in Storybook (see
 * `ModelProvenance.stories.tsx`) before any of it is piped through
 * `SubsystemModelsView`.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import {
	ChevronDown,
	ChevronRight,
	CircleCheck,
	Copy,
	Download,
	FileDiff,
	GitCompareArrows,
	Pencil,
	TriangleAlert,
} from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	AnchorChanges,
	CommitDot,
	PurlCommit,
	SubsystemModelPurlFreshness,
} from "../../shared/contract";

/** Sha length rendered in the strip. Seven chars is git's own default. */
const SHORT_SHA = 7;

function shortSha(sha: string | undefined): string {
	return sha ? sha.slice(0, SHORT_SHA) : "";
}

/** `pkg:github/acme/widget` → `acme/widget`; anything unexpected renders raw. */
function ownerName(purl: string): string {
	const parts = purl.split("#")[0]!.split("/").filter(Boolean);
	return parts.length >= 2
		? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
		: purl;
}

/** Per-repo verdict across both axes. */
export type ProvenanceStatus =
	| "current"
	| "moved"
	| "local-ahead"
	| "remote-ahead"
	| "diverged"
	| "unresolved";

/**
 * Anchor-scoped verdict — the question a user actually asks.
 *
 * Commit drift is *necessary but not sufficient* for staleness. In this repo,
 * 216 files changed between one model pin and HEAD while a model anchoring a
 * single declaration file was unaffected.
 *
 * `touched` and `dirty` are deliberately distinct, because they demand
 * different amounts of the reader's trust:
 *
 * - **`touched`** — a *committed* change reached an anchor. The model's pin is
 *   behind real code, so verification is genuinely owed. Act now.
 * - **`dirty`** — only *uncommitted* edits reached an anchor. There is no
 *   commit to be behind of, and no reproducible coordinate to re-pin against,
 *   so there is nothing to verify yet. Worth knowing the model may already be
 *   describing something the working tree no longer says — but not an alarm,
 *   and not a reason to re-audit mid-edit.
 *
 * `unknown` means neither was computed, which is distinct from `clean`.
 */
export type AnchorVerdict = "clean" | "touched" | "dirty" | "unknown";

/**
 * Roll one repo's local and remote rows into a single status.
 *
 * A missing remote row is not a third state — it means the remote axis was
 * never collected, so the local reading stands alone.
 */
export function combineStatus(
	local: SubsystemModelPurlFreshness | undefined,
	remote: SubsystemModelPurlFreshness | undefined,
): ProvenanceStatus {
	if (!local || local.status === "unresolved") return "unresolved";
	const localMoved = local.status === "moved";
	const remoteMoved = remote?.status === "moved";
	if (!localMoved && !remoteMoved) return "current";
	if (localMoved && remoteMoved) return "diverged";
	return localMoved ? "local-ahead" : "remote-ahead";
}

/**
 * Whether drift reached an anchor, and if so whether it was committed.
 *
 * This is the correction to `commitStatus`'s repo-scoped compare
 * (`purl-commits.ts:180`). Two host reads answer it, and they are separate
 * calls because committed and uncommitted are separate facts:
 *
 * - committed — `git diff --name-only <pin> <live> -- <paths>`
 *   (`gitStdout`, `git-repo.ts:23`), scoped by `referencedFilesByPurl`
 *   (`purl-commits.ts:80`), which already yields that pathspec.
 * - uncommitted — `filesClean(root, paths)` (`git-repo.ts:64`), which is
 *   already anchor-scoped and is what gates stamping `verifiedAtCommits`.
 * - distance — `git rev-list --left-right --count <pin>...<live>` returns both
 *   directions in one call, but only when the pin is an ancestor. Guard it
 *   with `git merge-base --is-ancestor <pin> <live>` and set
 *   `historyRewritten` when that fails; otherwise a rebase reports every
 *   rewritten commit as both added and removed.
 *
 * `touched` wins over `dirty` when both are present: a committed change is the
 * durable problem, and the uncommitted edit is on top of it.
 */
export function anchorVerdict(
	local: SubsystemModelPurlFreshness | undefined,
	changed?: AnchorChanges,
): AnchorVerdict {
	if (!local || local.status === "unresolved") return "unknown";
	const committed = changed?.committed;
	const dirty = changed?.dirty;
	// `touched` outranks `dirty`: a committed change is the durable problem and
	// the uncommitted edit is layered on top of it.
	if (committed?.length) return "touched";
	// Dirty-only is meaningful even when the commit has not moved at all — you
	// can be sitting exactly on your pin with unsaved edits to an anchor. So
	// this is checked before the `match` short-circuit, not after.
	if (dirty?.length) return "dirty";
	if (local.status === "match") return "clean";
	if (committed === undefined && dirty === undefined) return "unknown";
	return "clean";
}

/**
 * One commit in the pin→head range, and whether it touched an anchored file.
 *
 * The net diff answers "did anything anchored change". This answers *when* —
 * drift spread thinly over 200 commits reads very differently from three
 * recent ones, and a re-audit only needs to look at the coloured tail.
 */
/**
 * One commit in a pin→head range, and whether it touched an anchored file.
 *
 * Re-exported from the contract rather than redeclared: the host now produces
 * these, so a local copy would be a second definition free to drift.
 */
export type { CommitDot } from "../../shared/contract";

/**
 * Anchor-scoped contact between a pin and the current checkout, split by
 * whether the change is committed.
 *
 * Re-exported from the contract for the same reason as {@link CommitDot}. The
 * `undefined` vs `[]` distinction is load-bearing and must not be eroded: an
 * empty list is "measured, nothing found", absent is "not measured", and only
 * the former may be read as clean.
 */
export type { AnchorChanges } from "../../shared/contract";

/**
 * Auto re-pin — promoting `verifiedAtCommits` to the current head when nothing
 * the model anchors to has moved.
 *
 * The justification is a proof, not a shortcut. Git is content-addressed: if
 * every anchored file is byte-identical at the pin and at head, then every
 * check in the audit resolves identically, so an audit run against the pin
 * *would* return the same verdict. Nothing is being assumed.
 *
 * Coverage of that proof — every check's evidence lies inside the anchored set:
 *
 * - boundary fields (`auditBoundaryFields`, `boundary-audit.ts:85`) are pure
 *   comparisons of the model's own `module` / `file` / `process`, no reads.
 * - the symbol anchor, declaration and signature resolve by the component's own
 *   `file` + `symbol` (`resolveComponentAnchor`), so identical content means an
 *   identical anchor.
 * - construct inference (`inferConstructFromGraphify`, `construct.ts:49`) reads
 *   the node's method edges, which are intra-class and therefore determined by
 *   that same file.
 *
 * The one edge that leaves the file is `implements` (`construct.ts:83`) — a
 * `class Bar implements Foo` in some other file. If that changed, Foo's
 * *inferred* construct would shift while its own declaration did not. That is
 * graphify re-inference instability rather than real staleness, so it
 * deliberately does not gate the re-pin.
 *
 * `blockedBy` therefore holds only the two conditions that verification does
 * *not* already imply. The trust-shaped ones are covered by the pin itself:
 *
 * - A component with a stale `file` cannot reach `fully_verified` at all —
 *   `resolveComponentAnchor` would not return `exact`, so `symbolDeclared`
 *   is false. A `verifiedAtCommits` entry already certifies every grounded
 *   component's file.
 * - A component with no `file` is `external` or `proposed`
 *   (`isUngrounded`, `boundary-audit.ts:74`), and those are skipped rather
 *   than flagged — their claims ("this is a dependency", "this is proposed")
 *   do not rest on repo file content, so there is nothing for them to lose.
 *
 * What remains are conditions on *now*, not on whether the model is sound:
 * - `dirty-tree` — the stamp only fires when `referencedFilesClean` passes
 *   (`verify-subsystem-component.ts:1502`), so the tree was clean when the
 *   model was verified. It can have gone dirty since, and there is then no
 *   reproducible state to promote the pin to.
 * - `history-rewritten` — the pin is orphaned, so "unchanged" is unverifiable.
 */
export type AutoRePinBlockedBy = "dirty-tree" | "history-rewritten";

export interface AutoRePin {
	/** `applied` — pin already promoted. `eligible` — could be. `blocked` — guard hit. */
	status: "applied" | "eligible" | "blocked";
	blockedBy?: AutoRePinBlockedBy;
	/** The commit the pin was or would be promoted to. */
	commit?: string;
	/** When the promotion happened, for `applied`. */
	at?: string;
}

/** Why a re-pin was refused, in the reader's terms. */
export function autoRePinReason(
	blockedBy: AutoRePinBlockedBy | undefined,
): string {
	switch (blockedBy) {
		case "dirty-tree":
			return "Referenced files have uncommitted edits, so there is no state to pin to yet.";
		case "history-rewritten":
			return "History was rewritten since this model was verified, so 'unchanged' cannot be established.";
		default:
			return "This model cannot be re-pinned automatically.";
	}
}

/** The provenance a host would attach to a summary row. */
export interface ModelProvenanceData {
	/** One row per referenced purl, pin vs local HEAD. Absent pre-provenance. */
	purlFreshness?: SubsystemModelPurlFreshness[];
	/**
	 * Aspirational — **not currently sent by the host.** Same row shape, but
	 * `pinned` compared against a remote ref rather than a local checkout.
	 *
	 * To make this real the host would need, per purl: read the default
	 * branch's remote sha (a `git ls-remote` or `refs/remotes/origin/HEAD`
	 * lookup — note `git rev-parse HEAD` in `git-repo.ts:47` cannot see it),
	 * then emit a second freshness pass against that ref. Absent rows mean
	 * "no remote configured", which is not an error.
	 */
	remoteFreshness?: SubsystemModelPurlFreshness[];
	/**
	 * Per-purl anchor contact, split committed vs uncommitted. Aspirational —
	 * nothing populates it.
	 *
	 * To make this real, add next to `purlCommitFreshness`:
	 * `referencedFilesByPurl(components, trails)` for the pathspec
	 * (`purl-commits.ts:80`), then per resolvable root
	 *   - committed: `git diff --name-only <pin> <live> -- <paths>`
	 *     via `gitStdout` (`git-repo.ts:23`)
	 *   - uncommitted: the dirty paths `filesClean` already inspects
	 *     (`git-repo.ts:64`) — it currently returns only a boolean, so it
	 *     would need to surface which paths were dirty, not just that one was.
	 *
	 * `[]` on both means the repo moved but nothing referenced did. `undefined`
	 * means not computed, which is a different claim.
	 */
	anchorChanges?: Record<string, AnchorChanges>;
	/**
	 * Whether the pin was (or could be) auto-promoted to head because nothing
	 * anchored moved. Aspirational — nothing populates it.
	 */
	autoRePin?: AutoRePin;
	/** Per-purl commit at create, immutable. */
	createdAtCommits?: Record<string, PurlCommit>;
	/** Per-purl commit the last fully-verified audit earned. */
	verifiedAtCommits?: Record<string, PurlCommit>;
}

/** One repo's fully-resolved provenance, after combining both axes. */
export interface ProvenanceRow {
	purl: string;
	status: ProvenanceStatus;
	local?: SubsystemModelPurlFreshness;
	remote?: SubsystemModelPurlFreshness;
	createdAt?: string;
	/** Whether drift reached an anchor — see {@link anchorVerdict}. */
	anchor: AnchorVerdict;
	/** Referenced files in contact, when the host computed it. */
	changes?: AnchorChanges;
	/** The pin in force — `verifiedAtCommits`, falling back to `createdAtCommits`. */
	pinned?: string;
}

/** Join both axes into one ordered row per referenced repo. */
export function provenanceRows(
	provenance: ModelProvenanceData,
): ProvenanceRow[] {
	const local = provenance.purlFreshness ?? [];
	const remote = provenance.remoteFreshness ?? [];
	const keys = [
		...new Set([
			...local.map((r) => r.purl),
			...remote.map((r) => r.purl),
			...Object.keys(provenance.createdAtCommits ?? {}),
			...Object.keys(provenance.verifiedAtCommits ?? {}),
		]),
	];
	return keys.map((purl) => {
		const l = local.find((r) => r.purl === purl);
		return {
			purl,
			status: combineStatus(l, remote.find((r) => r.purl === purl)),
			anchor: anchorVerdict(l, provenance.anchorChanges?.[purl]),
			changes: provenance.anchorChanges?.[purl],
			local: l,
			remote: remote.find((r) => r.purl === purl),
			createdAt: provenance.createdAtCommits?.[purl],
			pinned:
				provenance.verifiedAtCommits?.[purl] ?? provenance.createdAtCommits?.[purl],
		};
	});
}

/**
 * Roll rows up to one badge verdict.
 *
 * The rollup is driven by `anchor`, not by commit drift. Drift is the cheap
 * necessary condition; whether it reached an anchor is the question worth
 * answering, and a badge that says "Moved" when nothing the model touches
 * changed is noise that teaches people to ignore it.
 *
 * `touched` outranks `dirty` in the rollup: committed drift is the one that
 * owes the reader a re-audit. A model that is both dirty somewhere and touched
 * elsewhere reports `touched`, and the strip shows both.
 *
 * When no host populates `anchorChanges`, every row reads `unknown` and the
 * badge falls back to the drift signal — which is exactly today's behavior,
 * honestly labelled as unverified rather than clean.
 */
export function summarizeProvenance(rows: ProvenanceRow[]): {
	status: ProvenanceStatus;
	anchor: AnchorVerdict;
	touchedCount: number;
	dirtyCount: number;
	/** Anchored files that changed since the pin, summed across repos. */
	changedFileCount: number;
	/**
	 * Largest `commitsSincePin` across rows whose anchor verdict actually
	 * supports it. `undefined` when nothing measurable qualifies.
	 */
	commitsSincePin?: number;
	/**
	 * At least one repo's pin is not an ancestor of its head, so the counts
	 * above are unreliable and are suppressed. The anchor diff still holds.
	 */
	historyRewritten: boolean;
	staleCount: number;
	total: number;
} {
	const touchedCount = rows.filter((r) => r.anchor === "touched").length;
	const dirtyCount = rows.filter((r) => r.anchor === "dirty").length;
	/**
	 * Anchored files that actually changed, across every repo.
	 *
	 * This — not the commit distance — is the headline number. A commit count is
	 * repo-shaped and says nothing about blast radius; "3 files changed" is
	 * directly actionable and comparable across repos of any size. The list is
	 * already computed for the anchor verdict, so the count is free.
	 */
	const changedFileCount = rows.reduce(
		(sum, r) => sum + (r.anchor === "touched" ? (r.changes?.committed?.length ?? 0) : 0),
		0,
	);
	// The checkout moved the measured distance for any row whose history is
	// intact, whatever the anchor verdict — knowing "22 commits since verified"
	// is useful even when we cannot yet say whether it mattered. Rows whose
	// history was rewritten are excluded because their count is not trustworthy.
	const distances = rows
		.filter((r) => !r.changes?.historyRewritten)
		.map((r) => r.changes?.commitsSincePin)
		.filter((n): n is number => typeof n === "number");
	const commitsSincePin = distances.length > 0 ? Math.max(...distances) : undefined;
	const staleCount = rows.filter(
		(r) => r.status !== "current" && r.status !== "unresolved",
	).length;
	const rank: Record<ProvenanceStatus, number> = {
		diverged: 4,
		"remote-ahead": 3,
		"local-ahead": 2,
		moved: 2,
		unresolved: 1,
		current: 0,
	};
	const status = rows.reduce<ProvenanceStatus>(
		(worst, r) => (rank[r.status] > rank[worst] ? r.status : worst),
		"current",
	);
	const anchor: AnchorVerdict =
		touchedCount > 0
			? "touched"
			: dirtyCount > 0
				? "dirty"
				: rows.every((r) => r.anchor === "clean")
					? "clean"
					: "unknown";
	return {
		status,
		anchor,
		touchedCount,
		dirtyCount,
		changedFileCount,
		commitsSincePin,
		historyRewritten: rows.some((r) => r.changes?.historyRewritten),
		staleCount,
		total: rows.length,
	};
}

/** Badge label + tooltip copy for a rollup. */
export function provenanceCopy(
	{
		status,
		anchor,
		touchedCount,
		dirtyCount,
		changedFileCount,
		commitsSincePin,
		historyRewritten,
		staleCount,
		total,
	}: ReturnType<typeof summarizeProvenance>,
	remoteKnown: boolean,
	/** The model's auto re-pin outcome, when the host reported one. */
	autoRePinArg?: AutoRePin,
): { label: string; title: string; detail?: string } {
	const autoRePin = autoRePinArg;
	const repos = total === 1 ? "repo" : "repos";
	/** "22 commits" / "1 commit" — secondary, used only when impact is unknown. */
	const nCommits =
		commitsSincePin === undefined
			? ""
			: ` ${commitsSincePin} ${commitsSincePin === 1 ? "commit" : "commits"}`;
	/** The badge's lead token when the verdict is "how stale", not "is it bad". */
	const staleLabel =
		commitsSincePin === undefined
			? "Stale"
			: commitsSincePin === 1
				? "1 behind"
				: `${commitsSincePin} behind`;
	/**
	 * A sentence about the model's age. Grammatical with or without a count,
	 * and never claims the model was never verified — `verifiedAtCommits`
	 * records that it was. Only whether it still holds is in question.
	 */
	const age = commitsSincePin === undefined
		? "Last verified at an earlier commit"
		: `Last verified${nCommits} ago`;
	/**
	 * What is actually missing, stated precisely. When a distance is known, the
	 * unknown is the *impact* on anchored files — not the distance — so saying
	 * "the distance is not measured" next to "22 commits ago" would contradict
	 * itself.
	 */
	const impactUnknown = historyRewritten
		? "its pin is no longer in this checkout's history, so neither the distance nor the impact can be measured"
		: "whether the files it references changed is not checked yet";

	if (status === "current") {
		return {
			label: "Current",
			title: `Every referenced ${repos} still points at the commit this model was verified against${remoteKnown ? ", locally and remotely" : ""}.`,
		};
	}
	if (status === "unresolved") {
		// The model WAS verified — at a recorded commit. What is missing is a
		// local checkout to measure against, so the honest claim is an age, or
		// plainly "can't measure", never "unverified".
		return {
			label: commitsSincePin === undefined ? "Unmeasured" : staleLabel,
			title:
				total === 0
					? "No referenced repo resolves to a local checkout, so how far this model has drifted cannot be measured."
					: `${age}, but ${dirtyCount === total ? "none of the referenced repos resolve" : "some referenced repos do not resolve"} to a local checkout, so the age cannot be confirmed.`,
		};
	}
	const count = `${staleCount} of ${total} ${repos}`;

	// Drift that provably missed every anchor is not an alarm — and the model
	// is simply current. Whether the *pin* was carried forward is bookkeeping
	// about `verifiedAtCommits`, not a claim about whether the verification
	// still holds, so it never changes this label. It only colours the tooltip.
	if (anchor === "clean") {
		const pinNote =
			autoRePin?.status === "applied"
				? " The verified pin was carried forward to the current commit."
				: autoRePin?.status === "eligible"
					? " The verified pin can be carried forward without re-running the audit."
					: autoRePin?.status === "blocked"
						? ` The pin was not carried forward — ${autoRePinReason(autoRePin.blockedBy)}`
						: "";
		return {
			label: "Current",
			title: `Your checkout moved on ${count}, but no file this model references changed, so this model is still accurate. No re-audit needed.${pinNote}`,
		};
	}
	if (anchor === "unknown") {
		// Same correction: the audit ran and stamped a commit. We know the
		// model is N commits old; we just have not checked whether it matters.
		return {
			label: staleLabel,
			title: `${age} on ${count}, but ${impactUnknown}. Re-audit to confirm.`,
		};
	}

	const touched = `${touchedCount} of ${total} ${repos}`;
	if (status === "local-ahead") {
		const distance = historyRewritten
			? "Your checkout's history was rewritten since this model was verified, so the distance is unknown"
			: `Your checkout moved${nCommits} since this model was verified`;
		const filePart = `${changedFileCount} ${changedFileCount === 1 ? "file" : "files"} changed`;
		// A complete chip string rather than a verdict word in front of two
		// numbers — "Changed 22 commits · 1 file" reads as a label glued onto
		// a noun phrase. The facts stand on their own.
		const parts: string[] = [];
		if (!historyRewritten && commitsSincePin !== undefined) {
			parts.push(
				`${commitsSincePin} ${commitsSincePin === 1 ? "commit" : "commits"}`,
			);
		}
		parts.push(filePart);
		return {
			label: "",
			detail: parts.join(" · "),
			title: `${changedFileCount === 1 ? "One file this model references has" : `${changedFileCount} files this model references have`} changed since it was verified (${distance}). Re-audit to re-pin.`,
		};
	}
	if (status === "remote-ahead") {
		return {
			label: "Behind",
			title: `${remoteKnown ? "The remote has" : "Someone has"} moved ahead on ${count} — your checkout is behind. Pull, then re-audit to re-pin.`,
		};
	}
	return {
		label: "Diverged",
		title: `Both ends moved and referenced files changed on ${touched}. Pull, then re-audit to re-pin.`,
	};
}

/**
 * The list-row chip. Answers "current or not" and nothing more — no sha, no
 * count of commits. Clicking expands the strip in place.
 *
 * Renders `null` when there is nothing to say: a model authored before
 * provenance existed has no pins, and a chip reading "unverified" would be a
 * claim the host never made.
 */
export function ProvenanceBadge({
	provenance,
	onToggle,
	open = false,
}: {
	provenance: ModelProvenanceData;
	/** Expands/collapses the strip. Omit for a non-interactive chip. */
	onToggle?: () => void;
	open?: boolean;
}) {
	const { theme } = useTheme();
	const rows = provenanceRows(provenance);
	const summary = summarizeProvenance(rows);
	const remoteKnown = (provenance.remoteFreshness ?? []).length > 0;
	const { label, title, detail } = provenanceCopy(
		summary,
		remoteKnown,
		provenance.autoRePin,
	);

	// A record with no pins at all is a migration transient, not a state we
	// support: `commitsFromDeclarationRefs` (`purl-commits.ts:116`) already
	// backfills `createdAtCommits` for records written before pinning existed.
	// Kept as a guard so an un-backfilled record renders nothing rather than an
	// empty chip — but it should never be observed.
	if (
		!provenance.createdAtCommits &&
		!provenance.verifiedAtCommits &&
		rows.length === 0
	) {
		return null;
	}

	// A re-pinned model is genuinely current — the pin was carried forward on a
	// proof, not a hope — so it earns the same green as an unmoved checkout.
	// A clean anchor verdict means the model is current, full stop — including
	// when it drifted, since nothing it references moved. So green covers
	// "unmoved", "drifted but unaffected" and "re-pinned" alike; the pin's
	// bookkeeping is a tooltip detail, not a downgrade.
	const current = summary.status === "current" || summary.anchor === "clean";
	// `anchor === "dirty"` outranks `status === "current"`: you can sit exactly
	// on your pin with unsaved edits to an anchor, and a green "Current" would
	// hide that. Past that, color tracks the anchor verdict rather than raw
	// drift — a moved repo whose referenced files are provably untouched is
	// quiet, not an alarm. Uncommitted edits are NOT handled here: they get
	// their own badge, so a model that is current-but-dirty still reads
	// `Current` here and carries a separate pencil chip beside it.
	const tone =
		current
			? { fg: theme.colors.success, Icon: CircleCheck }
			: summary.status === "unresolved" || summary.anchor === "unknown"
					? { fg: theme.colors.textMuted, Icon: GitCompareArrows }
					: summary.status === "remote-ahead"
						? { fg: theme.colors.info ?? theme.colors.primary, Icon: Download }
						: summary.status === "diverged"
							? { fg: theme.colors.warning, Icon: TriangleAlert }
							: { fg: theme.colors.warning, Icon: FileDiff };

	const { fg, Icon } = tone;

	// The commit count is the badge's payload — a sha conveys nothing to a reader.
	// For `touched` the label is a verdict ("Changed"), so the count rides
	// alongside it. For the `unknown` states the label already reads as an age
	// ("22 behind"), so it must not be repeated here.
	const behind =
		summary.anchor === "touched" && summary.commitsSincePin !== undefined
			? `${summary.commitsSincePin} ${summary.commitsSincePin === 1 ? "commit" : "commits"}`
			: "";
	const repos =
		summary.total > 1 && summary.staleCount > 0
			? ` · ${summary.staleCount}/${summary.total}`
			: "";
	// "22 commits · 3 files" — the range, then the blast radius. Both are
	// needed: the count says how far, the files say how much it matters.
	const files =
		summary.changedFileCount > 0
			? `· ${summary.changedFileCount} ${summary.changedFileCount === 1 ? "file" : "files"}`
			: "";

	const body = (
		<>
			<Icon size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
			{detail ? <span>{detail}</span> : <span>{label}</span>}
			{!detail && behind && (
				<span style={{ fontFamily: theme.fonts.monospace, fontWeight: 400 }}>
					{behind}
				</span>
			)}
			{!detail && files && <span style={{ opacity: 0.9 }}>{files}</span>}
			{repos && <span style={{ opacity: 0.8 }}>{repos}</span>}
			{onToggle &&
				(open ? (
					<ChevronDown size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
				) : (
					<ChevronRight size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
				))}
		</>
	);

	const style: CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: 5,
		flexShrink: 0,
		padding: "3px 8px",
		borderRadius: BADGE_RADIUS,
		border: `1px solid ${fg}55`,
		background: `${fg}14`,
		color: fg,
		fontSize: theme.fontSizes[0],
		fontFamily: theme.fonts.body,
		fontWeight: 600,
		letterSpacing: 0.2,
	};

	if (!onToggle) {
		return (
			<span title={title} style={style}>
				{body}
			</span>
		);
	}
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			title={title}
			aria-label={title}
			aria-expanded={open}
			style={{ ...style, cursor: "pointer" }}
		>
			{body}
		</button>
	);
}

/**
 * The expanded strip: one row per referenced repo, with the local and remote
 * axes side by side.
 *
 * A `current` repo collapses to a single sha per axis — showing "abc → abc"
 * teaches the reader nothing and doubles the row height. Only a moved axis
 * spends the space on the transition, which is the whole point.
 */
export function ProvenanceDetail({ provenance }: { provenance: ModelProvenanceData }) {
	const { theme } = useTheme();
	const rows = provenanceRows(provenance);

	if (rows.length === 0) {
		return (
			<div
				style={{
					fontSize: theme.fontSizes[1],
					color: theme.colors.textMuted,
					fontFamily: theme.fonts.body,
				}}
			>
				No commit provenance recorded. This should be a backfill transient —
				records written before pinning are repaired from their declaration refs.
			</div>
		);
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 4,
				fontFamily: theme.fonts.body,
			}}
		>
			{rows.map((row) => {
				return (
					<div
						key={row.purl}
						style={{
							// Two lines: repo name, then the signal beneath it. The dots
							// read as a strip of recent history rather than as a value
							// competing with the name, and there is room for the whole
							// run instead of squeezing it against a right edge.
							display: "flex",
							flexDirection: "column",
							alignItems: "flex-start",
							gap: 3,
							padding: "6px 8px",
							borderRadius: 4,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							background: theme.colors.backgroundSecondary ?? "transparent",
							fontSize: theme.fontSizes[1],
						}}
					>
						<span
							style={{
								maxWidth: "100%",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								fontFamily: theme.fonts.monospace,
							}}
							title={row.purl}
						>
							{ownerName(row.purl)}
						</span>
						{/*
						 * One signal per row, and nothing at all when healthy.
						 *
						 * A current repo needs no explanation: showing "sha matches /
						 * no remote / created sha / current" is four ways of saying the
						 * same thing, and `created` usually duplicates the pin because a
						 * model verified once has them equal. Space is spent only where
						 * it buys a decision.
						 */}
						<RepoSignal row={row} />
					</div>
				);
			})}
		</div>
	);
}

/**
 * The single informative cell for one repo row.
 *
 * Each state renders the least it can while still answering "what do I do?":
 *
 * - **current** — the pinned sha alone, click to copy. No transition to show,
 *   no verdict word, no `created` (which duplicates the pin on any model
 *   verified only once).
 * - **moved, anchors clean** — the transition `pin → head`, because that pair
 *   *is* the finding. Still muted: nothing is owed.
 * - **touched** — the commit count and the file, which is what a re-audit
 *   would need to know. The shas are dropped; the count carries the urgency.
 * - **dirty** — the uncommitted file only.
 * - **unknown / unresolved** — why we cannot tell.
 *
 * `created` is shown only when it differs from the pin, i.e. the model has
 * actually been re-verified since authoring and the two commits tell different
 * stories.
 */
function RepoSignal({ row }: { row: ProvenanceRow }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted;

	/**
	 * One geometry for every branch, on the line *under* the repo name.
	 *
	 * It inherits the name's left edge rather than pushing to a right edge, so
	 * the signal reads as a continuation of the name. `flexWrap` matters here:
	 * the dot strip is the one signal that can be genuinely wide, and wrapping
	 * it keeps a long run from stretching the row instead of scrolling.
	 */
	const cell: CSSProperties = {
		maxWidth: "100%",
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 6,
	};

	const mono: CSSProperties = {
		fontFamily: theme.fonts.monospace,
		fontSize: theme.fontSizes[0],
	};

	// No pin recorded at all.
	if (!row.local?.pinned) {
		return (
			<span style={{ ...cell, color: muted, fontFamily: theme.fonts.body }}>
				{row.local ? "no checkout" : "not pinned"}
			</span>
		);
	}

	// Touched: the commit dots are the finding — they show *when* the model
	// went stale, which a single count cannot. The filenames stay in the
	// tooltip; a right-aligned column of truncated paths was noise.
	if (row.anchor === "touched") {
		const n = row.changes?.commitsSincePin;
		return (
			<span
				style={{ ...cell, ...mono, color: theme.colors.warning }}
				title={row.changes?.committed?.join("\n")}
			>
				<CommitDots
					commits={row.changes?.commits}
					remoteIndex={row.changes?.remoteIndex}
					remoteAhead={row.changes?.remoteAhead}
				/>
				{!row.changes?.commits?.length &&
					!row.changes?.historyRewritten &&
					typeof n === "number" && (
						<span style={{ fontWeight: 600 }}>
							{n} {n === 1 ? "commit" : "commits"}
						</span>
					)}
				{row.changes?.dirty?.length ? (
					<span
						style={{ color: muted }}
						title={`Also uncommitted:\n${row.changes.dirty.join("\n")}`}
					>
						+{row.changes.dirty.length}
					</span>
				) : null}
			</span>
		);
	}

	// Dirty: there is no distance to report, so the count of uncommitted files
	// stands in for one.
	if (row.anchor === "dirty") {
		const n = row.changes?.dirty?.length ?? 0;
		return (
			<span
				style={{ ...cell, gap: 5, ...mono, color: muted }}
				title={row.changes?.dirty?.join("\n")}
			>
				<Pencil size={10} style={{ flexShrink: 0 }} aria-hidden="true" />
				{n} uncommitted
			</span>
		);
	}

	// Current: nothing at all. The badge above already says so, and a bare sha
	// under a repo name on its own line says nothing the badge has not. The pin
	// moves into the tooltip, where it is reference material rather than a
	// headline.
	if (row.status === "current" || row.anchor === "clean") {
		const pin = row.local.pinned;
		const authored = row.createdAt && row.createdAt !== pin;
		return (
			<span
				style={{ ...cell, color: muted }}
				title={`Verified against ${pin}${
					authored ? ` · authored against ${row.createdAt}` : ""
				}`}
			>
				{authored && (
					<span style={mono}>
						verified {shortSha(pin)} · authored {shortSha(row.createdAt!)}
					</span>
				)}
			</span>
		);
	}

	// Moved but we could not establish whether an anchor was touched.
	if (row.anchor === "unknown") {
		return (
			<span
				style={{ ...cell, ...mono, color: muted }}
			>
				{!row.changes?.historyRewritten &&
					typeof row.changes?.commitsSincePin === "number" && (
						<span style={{ fontWeight: 600 }}>
							{row.changes.commitsSincePin}{" "}
							{row.changes.commitsSincePin === 1 ? "commit" : "commits"}
						</span>
					)}
				<span style={{ fontFamily: theme.fonts.body }}>unchecked</span>
			</span>
		);
	}

	// Remaining: moved with no local checkout to compare against.
	return (
		<span style={{ ...cell, color: muted, fontFamily: theme.fonts.body }}>
			no local checkout
		</span>
	);
}

/**
 * Dots read oldest → newest, left to right, so the coloured ones cluster where
 * the model went stale.
 *
 * The strip is a timeline, so the remote gets a place on it: a tick at
 * `remoteIndex` marks where the remote ref sits, and everything to its right is
 * unpushed local work. Commits the remote has that this checkout lacks
 * (`remoteAhead`) cannot appear as dots — they do not exist here — so they are
 * appended as hollow rings to the right of the tick.
 *
 * The window is capped because a range can be enormous — this repo's pin sits
 * 22 commits back, but a lightly-touched model can be thousands. Overflow shows
 * as a `+N` rather than shrinking the dots, because the *recency* of the
 * damage is the thing worth reading and recent dots must stay legible.
 */
/**
 * Chip corner radius. Matches the card's inner surfaces rather than reading as
 * a pill — at this height a pill's fully-rounded ends dominate the shape, and
 * these sit among 4px strips inside a 6px card.
 */
const BADGE_RADIUS = 4;

const DOT_SIZE = 7;
const DOT_GAP = 5;
/** How many dots to draw before collapsing the rest into a count. */
export const COMMIT_DOT_LIMIT = 40;

export function CommitDots({
	commits,
	remoteIndex,
	remoteAhead,
	limit = COMMIT_DOT_LIMIT,
}: {
	commits: ReadonlyArray<CommitDot> | undefined;
	/** Index into `commits` of the commit the remote ref points at. */
	remoteIndex?: number;
	/** Commits the remote has that this checkout does not. */
	remoteAhead?: number;
	limit?: number;
}) {
	const { theme } = useTheme();
	if ((!commits || commits.length === 0) && !remoteAhead) return null;

	// Keep the newest end — that is where live drift lives.
	const shown = commits?.slice(-limit) ?? [];
	const trimmed = (commits?.length ?? 0) - shown.length;
	const touchedCount = commits?.filter((c) => c.touched).length ?? 0;

	// Re-base the remote tick into the trimmed window. A negative position means
	// the remote is older than everything still shown, i.e. every visible dot is
	// unpushed — worth saying, so clamp it to the left edge rather than hide it.
	const tick = remoteIndex === undefined ? -1 : remoteIndex - trimmed;

	const parts: ReactNode[] = [];
	if (trimmed > 0) {
		parts.push(
			<span
				key="overflow"
				style={{
					fontSize: theme.fontSizes[0],
					color: theme.colors.textMuted,
					fontFamily: theme.fonts.monospace,
					marginRight: 2,
				}}
			>
				+{trimmed}
			</span>,
		);
	}
	// The remote's position is marked by giving that one dot a heavier outline.
	// No caret, no label: both were tried and both added noise — the caret read
	// as a separator and the word "remote" crowded a strip whose whole point is
	// being scannable at a glance.
	//
	// `outline` rather than `border` so the emphasised dot does not change size
	// and shift every dot after it. It also sits alongside the touched-dot
	// `boxShadow` ring rather than fighting it, so a commit that is both touched
	// and on the boundary stays readable.
	shown.forEach((c, i) => {
		const onRemote = i === tick;
		parts.push(
			<span
				key={c.sha}
				title={
					onRemote
						? `${c.sha} — where the remote ref points`
						: tick >= 0 && i > tick
							? `${c.sha} — not yet pushed`
							: c.sha
				}
				style={{
					width: DOT_SIZE,
					height: DOT_SIZE,
					borderRadius: "50%",
					flexShrink: 0,
					background: c.touched
						? theme.colors.warning
						: `${theme.colors.textMuted}44`,
					// A touched dot also gets a ring so it survives a colour-blind
					// read and greyscale printing.
					boxShadow: c.touched
						? `0 0 0 1.5px ${theme.colors.warning}33`
						: undefined,
					outline: onRemote
						? `2px solid ${theme.colors.info ?? theme.colors.primary}`
						: undefined,
					outlineOffset: onRemote ? 1 : undefined,
				}}
			/>,
		);
	});
	// Commits only the remote has — drawn hollow because they are not here.
	const remoteOnly = Math.min(remoteAhead ?? 0, limit);
	for (let i = 0; i < remoteOnly; i++) {
		parts.push(
			<span
				key={`remote-${i}`}
				style={{
					width: DOT_SIZE,
					height: DOT_SIZE,
					borderRadius: "50%",
					flexShrink: 0,
					border: `1px solid ${theme.colors.info ?? theme.colors.primary}88`,
					background: "transparent",
				}}
			/>,
		);
	}

	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: DOT_GAP,
				flexShrink: 0,
			}}
			title={[
				commits?.length
					? `${commits.length} ${commits.length === 1 ? "commit" : "commits"} since verification · ${touchedCount} touched a file this model references`
					: null,
				remoteAhead
					? `${remoteAhead} more on the remote that this checkout does not have`
					: null,
				tick >= 0 && tick < shown.length
					? `${shown.length - tick - 1} not yet pushed`
					: remoteIndex !== undefined
						? "everything shown is unpushed"
						: null,
				trimmed > 0 ? `showing the newest ${shown.length}` : null,
			]
				.filter(Boolean)
				.join(" · ")}
		>
			{parts}
		</span>
	);
}

/**
 * The dirty badge — deliberately separate from {@link ProvenanceBadge}.
 *
 * Working-tree state and verification currency are orthogonal questions: a
 * model can be perfectly current *and* have uncommitted edits to a file it
 * anchors, because you can be sitting on your pin mid-edit. Folding that into
 * one badge forces a precedence between two things that are not alternatives,
 * which is exactly the trap that made a green "Current" hide a dirty anchor.
 *
 * Nothing is owed here. There is no commit to be behind of, so there is nothing
 * to re-audit until the edit lands — the badge exists so the reader knows the
 * model may already describe something the working tree no longer says.
 */
export function DirtyBadge({
	provenance,
	title,
}: {
	provenance: ModelProvenanceData;
	title?: string;
}) {
	const { theme } = useTheme();
	const files = provenanceRows(provenance)
		.flatMap((r) => r.changes?.dirty ?? [])
		.filter((f, i, a) => a.indexOf(f) === i);
	if (files.length === 0) return null;
	const fg = theme.colors.textMuted;
	const defaultTitle = `Uncommitted edits in ${files.length} ${files.length === 1 ? "file" : "files"} this model references. The model may already describe something your working tree no longer says — nothing to re-audit until ${files.length === 1 ? "it lands" : "they land"} in a commit.`;
	return (
		<span
			title={title ?? defaultTitle}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				flexShrink: 0,
				padding: "3px 8px",
				borderRadius: BADGE_RADIUS,
				border: `1px solid ${fg}44`,
				background: "transparent",
				color: fg,
				fontSize: theme.fontSizes[0],
				fontFamily: theme.fonts.body,
				fontWeight: 600,
				letterSpacing: 0.2,
			}}
		>
			<Pencil size={11} style={{ flexShrink: 0 }} aria-hidden="true" />
			{files.length} uncommitted
		</span>
	);
}

/**
 * Badge + strip, with the expand state owned here so a story works with no
 * wiring. Pass `open`/`onToggle` to lift it into a parent (the list row).
 */
export function ModelProvenance({
	provenance,
	open: controlledOpen,
	onOpenChange,
	style,
}: {
	provenance: ModelProvenanceData;
	/** Controlled expand state. Omit to let the component own it. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	style?: CSSProperties;
}) {
	const { theme } = useTheme();
	const [uncontrolled, setUncontrolled] = useState(false);
	const open = controlledOpen ?? uncontrolled;
	const toggle = () => {
		const next = !open;
		setUncontrolled(next);
		onOpenChange?.(next);
	};

	const badge = (
		<ProvenanceBadge
			provenance={provenance}
			onToggle={onOpenChange ? toggle : undefined}
			open={open}
		/>
	);
	// With no toggle handler the badge is inert, so there is nothing to expand.
	if (!onOpenChange && !controlledOpen) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontFamily: theme.fonts.body,
					...style,
				}}
			>
				{badge}
			</div>
		);
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				gap: 8,
				padding: "8px 12px",
				borderRadius: 4,
				border: `1px solid ${theme.colors.border ?? "#333"}`,
				background: theme.colors.backgroundSecondary ?? "transparent",
				fontFamily: theme.fonts.body,
				...style,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontSize: theme.fontSizes[1],
					color: theme.colors.text,
				}}
			>
				<span style={{ flex: 1, minWidth: 0 }}>Verification provenance</span>
				<DirtyBadge provenance={provenance} />
				{badge}
			</div>
			{open && <ProvenanceDetail provenance={provenance} />}
		</div>
	);
}

/**
 * Re-exported so stories and future surfaces share one icon vocabulary.
 *
 * There is deliberately no `moved` entry: a repo that moved but touched no
 * anchor is *current*, so it takes the `match` icon. Movement only earns a
 * distinct icon when it actually changed something.
 */
export const ProvenanceIcons = {
	copy: Copy,
	match: CircleCheck,
	changed: FileDiff,
	diverged: TriangleAlert,
	unresolved: GitCompareArrows,
};