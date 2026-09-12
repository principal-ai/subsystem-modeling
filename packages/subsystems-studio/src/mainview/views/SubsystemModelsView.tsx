/**
 * SubsystemModelsView — the "Subsystems" tab: a list of stored subsystem
 * graphs (~/.principal/subsystem-models). Clicking a row opens the graph in a
 * subsystem-model tab via the host.
 *
 * A strip of repo cards across the top (see `SubsystemRepoCards.tsx`)
 * aggregates unique GitHub repos from the visible graphs (component purls,
 * falling back to each graph's authored `repo`). Click cards to AND-filter
 * the list.
 *
 * The list polls every 10s so graphs posted via the HTTP API appear without
 * reopening the viewer. Host-side regular audit (Settings) refreshes
 * verification badges; click a badge for the last report. Pending agent
 * proposals show a separate badge to review before/after + why.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Check, Copy, Loader2, Share2 } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import type {
	GraphifyRepoEntry,
	RegularAuditStatus,
	SubsystemModelAuditReport,
	SubsystemModelSummary,
	StudioMessages,
} from "../../shared/contract";
import {
	electrobun,
	graphifyChangeSubscribers,
	regularAuditChangeSubscribers,
	subsystemModelChangeSubscribers,
	subsystemModelMaintainChangeSubscribers,
	subsystemModelProposalsChangeSubscribers,
} from "../rpc";
import {
	EMPTY_REPO_FILTER,
	parseGithubRepo,
	repoKey,
	SubsystemRepoCards,
	type RepoCardGraphify,
	type SubsystemRepoCard,
} from "./SubsystemRepoCards";
import {
	AuditResultsModal,
	type AuditModalState,
} from "../components/AuditResultsModal";
import { ProposalsModal } from "../components/ProposalsModal";
import { MaintainModelPickerModal } from "../components/MaintainModelPickerModal";
import { CenteredMessage, lastLoadedLabel, relativeTime } from "../ui";

const SUBSYSTEMS_POLL_MS = 10_000;
const COPY_FEEDBACK_MS = 1500;
/** Default view hides graphs not edited in the last day. */
const RECENT_MS = 24 * 60 * 60 * 1000;

type ListAuditEntry =
	| { status: "auditing" }
	| {
			status: "fully_verified";
			checkedAt: string;
			stale?: boolean;
			issueCount: number;
			report?: SubsystemModelAuditReport;
	  }
	| {
			status: "partially_verified";
			checkedAt: string;
			stale?: boolean;
			issueCount: number;
			report?: SubsystemModelAuditReport;
	  }
	| {
			status: "issues";
			checkedAt: string;
			stale?: boolean;
			issueCount: number;
			report?: SubsystemModelAuditReport;
	  }
	| { status: "error"; error: string; title?: string };

function reportIssueCount(report: SubsystemModelAuditReport): number {
	const fromFindings = report.findings.filter(
		(f) => f.severity === "error" || f.severity === "warn",
	).length;
	if (fromFindings > 0) return fromFindings;
	return report.checks.filter((c) => c.verdict === "issue").length;
}

function entryFromLastAudit(
	lastAudit: NonNullable<SubsystemModelSummary["lastAudit"]>,
	existing?: ListAuditEntry,
): Extract<
	ListAuditEntry,
	{ status: "fully_verified" | "partially_verified" | "issues" }
> {
	const status =
		lastAudit.verdict ??
		(lastAudit.needsUpdate || lastAudit.issueCount > 0
			? "issues"
			: "fully_verified");
	const keepReport =
		existing &&
		(existing.status === "fully_verified" ||
			existing.status === "partially_verified" ||
			existing.status === "issues") &&
		existing.report &&
		existing.checkedAt === lastAudit.checkedAt
			? existing.report
			: undefined;
	return {
		status,
		checkedAt: lastAudit.checkedAt,
		stale: lastAudit.stale,
		issueCount: lastAudit.issueCount,
		report: keepReport,
	};
}

/**
 * Sort key for issue count. Higher = more issues.
 * Unaudited → -1 (last). Audit failed → Infinity (first).
 * Fully verified → 0; partially verified → 0.25; issues by count.
 */
function listAuditIssueSortValue(entry: ListAuditEntry | undefined): number {
	if (!entry || entry.status === "auditing") return -1;
	if (entry.status === "error") return Number.POSITIVE_INFINITY;
	if (entry.status === "fully_verified") return entry.stale ? 0.1 : 0;
	if (entry.status === "partially_verified") return entry.stale ? 0.35 : 0.25;
	const n = entry.issueCount ?? (entry.report ? reportIssueCount(entry.report) : 0);
	return entry.stale ? n + 0.5 : n;
}

/** Map list audit status → Maintain mode (null = disabled). */
function maintainModeFromAuditEntry(
	entry: ListAuditEntry | undefined,
): "issues" | "gaps" | null {
	if (!entry) return null;
	if (entry.status === "issues") return "issues";
	if (entry.status === "partially_verified") return "gaps";
	return null;
}

function maintainButtonCopy(mode: "issues" | "gaps" | null): {
	label: string;
	title: string;
	agentName: string;
} {
	if (mode === "issues") {
		return {
			label: "Run maintenance",
			title: "Run maintenance — issue-fixer proposes corrections for verification failures",
			agentName: "Issue fixer",
		};
	}
	if (mode === "gaps") {
		return {
			label: "Run maintenance",
			title: "Run maintenance — gap-filler proposes fills for partial verification gaps",
			agentName: "Gap filler",
		};
	}
	return {
		label: "Run maintenance",
		title: "Audit first — maintenance runs when verification failed or partially verified",
		agentName: "Maintainer",
	};
}

function agentDisplayName(
	agent: "issue-fixer" | "gap-filler" | undefined,
): string {
	if (agent === "issue-fixer") return "Issue fixer";
	if (agent === "gap-filler") return "Gap filler";
	return "Maintainer";
}

function listAuditBadge(
	entry: ListAuditEntry,
	colors: {
		success?: string;
		error?: string;
		warning?: string;
		textSecondary?: string;
	},
	muted: string,
): {
	label: string;
	color: string;
	title: string;
	clickable: boolean;
	spinning: boolean;
} {
	if (entry.status === "auditing") {
		return {
			label: "Auditing…",
			color: colors.textSecondary ?? muted,
			title: "Audit in progress",
			clickable: false,
			spinning: true,
		};
	}
	if (entry.status === "error") {
		return {
			label: "Audit failed",
			color: colors.error ?? "#e5534b",
			title: entry.error,
			clickable: true,
			spinning: false,
		};
	}
	const n = entry.issueCount;
	const baseLabel =
		entry.status === "fully_verified"
			? "Fully verified"
			: entry.status === "partially_verified"
				? "Partially verified"
				: n === 1
					? "Verification failed · 1 issue"
					: `Verification failed · ${n} issues`;
	const label = entry.stale ? `Stale · ${baseLabel}` : baseLabel;
	const color = entry.stale
		? (colors.warning ?? "#d4a017")
		: entry.status === "fully_verified"
			? (colors.success ?? "#2da44e")
			: entry.status === "partially_verified"
				? (colors.textSecondary ?? muted)
				: (colors.error ?? "#e5534b");
	const when = new Date(entry.checkedAt).toLocaleString();
	return {
		label,
		color,
		title: entry.stale
			? `Audit outdated (inputs changed) · ${when} — click for last report; regular audit will refresh`
			: entry.status === "fully_verified"
				? `All applicable checks confirmed · ${when} — click for report`
				: entry.status === "partially_verified"
					? `No failures, but some checks still need follow-up · ${when} — click for report`
					: `Verification failed (${n === 1 ? "1 issue" : `${n} issues`}) · ${when} — click for report`,
		clickable: true,
		spinning: false,
	};
}

/** Listing sort offered by the Subsystems tab header. */
type SubsystemSortKey = "opened" | "edited" | "created" | "issues";

const SUBSYSTEM_SORTS: ReadonlyArray<{ key: SubsystemSortKey; label: string }> = [
	{ key: "opened", label: "Opened" },
	{ key: "edited", label: "Edited" },
	{ key: "created", label: "Created" },
	{ key: "issues", label: "Issues" },
];

/**
 * Sort timestamp for a summary row. Last-opened treats never-opened graphs as
 * oldest (stamp is absent), so existing graphs keep their current relative
 * order until opened once. `"issues"` is handled separately via audit results.
 */
function subsystemModelSortTime(
	graph: SubsystemModelSummary,
	sortKey: Exclude<SubsystemSortKey, "issues">,
): number {
	if (sortKey === "edited") return new Date(graph.updatedAt).getTime();
	if (sortKey === "created") return new Date(graph.createdAt).getTime();
	const opened = graph.lastOpenedAt ? Date.parse(graph.lastOpenedAt) : NaN;
	return Number.isFinite(opened) ? opened : 0;
}

function asRepoFilterSet(value: unknown): ReadonlySet<string> {
	if (value instanceof Set) return value;
	if (typeof value === "string" && value.length > 0) return new Set([value]);
	if (Array.isArray(value)) return new Set(value.filter((k) => typeof k === "string"));
	return EMPTY_REPO_FILTER;
}

/** Whether a listed graph references the given GitHub repo. */
function graphUsesRepo(
	graph: SubsystemModelSummary,
	owner: string,
	name: string,
): boolean {
	const key = repoKey(owner, name);
	for (const p of graph.graphify?.purls ?? []) {
		const repo = parseGithubRepo(p.purl);
		if (repo && repoKey(repo.owner, repo.name) === key) return true;
	}
	return graph.repo != null && repoKey(graph.repo.owner, graph.repo.name) === key;
}

/**
 * Unique repos across the visible subsystem list, with Alexandria Graphify
 * freshness joined on when the repo is registered (`listGraphifyRepos`).
 */
function collectReposFromGraphs(
	graphs: SubsystemModelSummary[],
	graphifyRepos: GraphifyRepoEntry[] | null,
	recentIds: ReadonlySet<string> | null,
): SubsystemRepoCard[] {
	const byKey = new Map<
		string,
		{ owner: string; name: string; graphIds: Set<string>; maxUpdatedAt: number }
	>();

	const add = (owner: string, name: string, graphId: string, updatedAtMs: number) => {
		const key = repoKey(owner, name);
		let entry = byKey.get(key);
		if (!entry) {
			entry = { owner, name, graphIds: new Set(), maxUpdatedAt: 0 };
			byKey.set(key, entry);
		}
		entry.graphIds.add(graphId);
		if (Number.isFinite(updatedAtMs) && updatedAtMs > entry.maxUpdatedAt) {
			entry.maxUpdatedAt = updatedAtMs;
		}
	};

	for (const graph of graphs) {
		const seenOnGraph = new Set<string>();
		const updatedAtMs = new Date(graph.updatedAt).getTime();
		for (const p of graph.graphify?.purls ?? []) {
			const repo = parseGithubRepo(p.purl);
			if (!repo) continue;
			const key = repoKey(repo.owner, repo.name);
			if (seenOnGraph.has(key)) continue;
			seenOnGraph.add(key);
			add(repo.owner, repo.name, graph.id, updatedAtMs);
		}
		if (graph.repo) {
			const key = repoKey(graph.repo.owner, graph.repo.name);
			if (!seenOnGraph.has(key)) {
				add(graph.repo.owner, graph.repo.name, graph.id, updatedAtMs);
			}
		}
	}

	const freshnessByKey = new Map<string, GraphifyRepoEntry>();
	for (const entry of graphifyRepos ?? []) {
		freshnessByKey.set(repoKey(entry.owner, entry.name), entry);
	}

	return [...byKey.values()]
		.sort(
			(a, b) =>
				b.maxUpdatedAt - a.maxUpdatedAt ||
				b.graphIds.size - a.graphIds.size ||
				a.owner.localeCompare(b.owner) ||
				a.name.localeCompare(b.name),
		)
		.map((e) => {
			const freshness = freshnessByKey.get(repoKey(e.owner, e.name));
			const graphify: RepoCardGraphify | null = freshness
				? {
						status: freshness.status,
						hasCached: freshness.cached != null,
						purl: freshness.purl,
						repoRoot: freshness.path,
					}
				: null;
			return {
				owner: e.owner,
				name: e.name,
				graphCount: e.graphIds.size,
				hasRecent:
					recentIds == null ||
					[...e.graphIds].some((id) => recentIds.has(id)),
				graphify,
			};
		});
}

function formatRegularAuditCountdown(status: RegularAuditStatus, nowMs: number): string {
	if (!status.enabled) return "";
	if (status.running) return "Auditing…";
	if (!status.nextAuditAt) return "Next audit soon…";
	const ms = new Date(status.nextAuditAt).getTime() - nowMs;
	if (!Number.isFinite(ms) || ms <= 0) return "Auditing…";
	const totalSec = Math.ceil(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) {
		return `Next audit in ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
	return `Next audit in ${m}:${String(s).padStart(2, "0")}`;
}

function SubsystemsTabHeader({
	lastLoadedAt,
	sortBy,
	onSortChange,
	showAll,
	hiddenStaleCount,
	onToggleShowAll,
	regularAudit,
}: {
	lastLoadedAt: number | null;
	sortBy: SubsystemSortKey;
	onSortChange: (key: SubsystemSortKey) => void;
	showAll?: boolean;
	hiddenStaleCount?: number;
	onToggleShowAll?: () => void;
	regularAudit?: RegularAuditStatus | null;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [, bump] = useState(0);

	useEffect(() => {
		if (lastLoadedAt == null && !regularAudit?.enabled) return;
		const id = setInterval(() => bump((n) => n + 1), 1_000);
		return () => clearInterval(id);
	}, [lastLoadedAt, regularAudit?.enabled]);

	const auditLabel =
		regularAudit?.enabled === true
			? formatRegularAuditCountdown(regularAudit, Date.now())
			: null;

	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				alignItems: "baseline",
				justifyContent: "space-between",
				gap: 12,
				padding: "10px 24px",
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
				<div style={{ fontSize: theme.fontSizes[2], fontWeight: 600 }}>Subsystems</div>
				<div
					role="group"
					aria-label="Sort subsystems"
					style={{ display: "flex", alignItems: "center", gap: 4 }}
				>
					{SUBSYSTEM_SORTS.map((s) => {
						const active = s.key === sortBy;
						return (
							<button
								key={s.key}
								type="button"
								title={`Sort by ${s.label.toLowerCase()}`}
								aria-pressed={active}
								onClick={() => onSortChange(s.key)}
								style={{
									fontSize: theme.fontSizes[0],
									fontWeight: active ? 600 : 400,
									letterSpacing: 0.3,
									textTransform: "uppercase",
									padding: "1px 7px",
									borderRadius: 999,
									border: `1px solid ${
										active ? theme.colors.primary : "transparent"
									}`,
									background: active ? `${theme.colors.primary}22` : "transparent",
									color: active ? theme.colors.primary : muted,
									cursor: "pointer",
									fontFamily: theme.fonts.body,
								}}
							>
						{s.label}
						</button>
					);
				})}
				{onToggleShowAll && (
					<button
						key="recent"
						type="button"
						title={
							showAll
								? "Show only graphs edited in the last day"
								: hiddenStaleCount != null && hiddenStaleCount > 0
									? `Show ${hiddenStaleCount} older hidden graph${hiddenStaleCount === 1 ? "" : "s"}`
									: "Show graphs older than a day"
						}
						aria-pressed={!showAll}
						onClick={onToggleShowAll}
						style={{
							fontSize: theme.fontSizes[0],
							fontWeight: !showAll ? 600 : 400,
							letterSpacing: 0.3,
							textTransform: "uppercase",
							padding: "1px 7px",
							borderRadius: 999,
							border: `1px solid ${
								!showAll ? theme.colors.primary : "transparent"
							}`,
							background: !showAll ? `${theme.colors.primary}22` : "transparent",
							color: !showAll ? theme.colors.primary : muted,
							cursor: "pointer",
							fontFamily: theme.fonts.body,
						}}
					>
						Recent
					</button>
				)}
				</div>
				{auditLabel && (
					<div
						title={
							regularAudit?.running
								? "Regular audit is running across stored subsystem models"
								: `Regular audit every ${regularAudit?.intervalMinutes ?? "?"} min — change in Settings`
						}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							padding: "3px 10px",
							borderRadius: 6,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							background: theme.colors.background,
							color: regularAudit?.running
								? theme.colors.primary
								: muted,
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.monospace,
							flexShrink: 0,
						}}
					>
						{regularAudit?.running ? (
							<Loader2 size={12} className="principal-studio-spin" />
						) : null}
						{auditLabel}
					</div>
				)}
			</div>
			<div
				style={{
					fontSize: theme.fontSizes[0],
					color: muted,
					fontFamily: theme.fonts.monospace,
					flexShrink: 0,
				}}
			>
				{lastLoadedAt == null
					? "Loading…"
					: `Last loaded ${lastLoadedLabel(lastLoadedAt)}`}
			</div>
		</div>
	);
}

function SubsystemsTabBody({ children }: { children: ReactNode }) {
	return (
		<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
			{children}
		</div>
	);
}

function SubsystemsTabShell({ children }: { children: ReactNode }) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			{children}
		</div>
	);
}

export function SubsystemModelsView() {
	const { theme } = useTheme();
	const [graphs, setGraphs] = useState<SubsystemModelSummary[] | null>(null);
	const [graphifyRepos, setGraphifyRepos] = useState<GraphifyRepoEntry[] | null>(
		null,
	);
	const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [sharingId, setSharingId] = useState<string | null>(null);
	const [repoFilter, setRepoFilter] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [sortBy, setSortBy] = useState<SubsystemSortKey>("opened");
	const [showAll, setShowAll] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [auditByGraphId, setAuditByGraphId] = useState<
		Record<string, ListAuditEntry>
	>({});
	const [auditModal, setAuditModal] = useState<AuditModalState | null>(null);
	const [proposalsModal, setProposalsModal] = useState<{
		graphId: string;
		title: string;
	} | null>(null);
	const [maintainPicker, setMaintainPicker] = useState<{
		graphId: string;
		title: string;
		mode: "issues" | "gaps";
	} | null>(null);
	/** graphId → maintain agent in flight / last error */
	const [maintainByGraphId, setMaintainByGraphId] = useState<
		Record<string, { status: "running" | "error"; error?: string }>
	>({});
	const [regularAudit, setRegularAudit] = useState<RegularAuditStatus | null>(
		null,
	);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		},
		[],
	);

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getRegularAuditStatus({})
			.then((status) => {
				if (alive) setRegularAudit(status);
			})
			.catch(() => {
				/* optional */
			});
		const onRegularAudit = (status: StudioMessages["regularAuditChanged"]) => {
			setRegularAudit(status);
		};
		regularAuditChangeSubscribers.add(onRegularAudit);
		return () => {
			alive = false;
			regularAuditChangeSubscribers.delete(onRegularAudit);
		};
	}, []);

	const refresh = useCallback(async () => {
		try {
			const [subResult, gfResult] = await Promise.all([
				electrobun.rpc!.request.listSubsystemModels({}),
				electrobun.rpc!.request.listGraphifyRepos({}).catch(() => null),
			]);
			setGraphs(subResult.graphs);
			if (gfResult) setGraphifyRepos(gfResult.repos);
			setLastLoadedAt(Date.now());
			setError(null);
			setAuditByGraphId((prev) => {
				const next: Record<string, ListAuditEntry> = { ...prev };
				for (const g of subResult.graphs) {
					if (next[g.id]?.status === "auditing") continue;
					if (g.lastAudit) {
						next[g.id] = entryFromLastAudit(g.lastAudit, next[g.id]);
					}
				}
				return next;
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = setInterval(() => {
			void refresh();
		}, SUBSYSTEMS_POLL_MS);
		return () => clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		const onGraphify = (_payload: StudioMessages["graphifyChanged"]) => {
			void refresh();
		};
		const onSubsystem = (_payload: StudioMessages["subsystemModelChanged"]) => {
			void refresh();
		};
		const onProposals = (
			_payload: StudioMessages["subsystemModelProposalsChanged"],
		) => {
			void refresh();
		};
		const onMaintain = (
			payload: StudioMessages["subsystemModelMaintainChanged"],
		) => {
			setMaintainByGraphId((prev) => {
				if (payload.status === "running") {
					return {
						...prev,
						[payload.graphId]: { status: "running" },
					};
				}
				const next = { ...prev };
				if (payload.status === "error") {
					next[payload.graphId] = {
						status: "error",
						error: payload.error,
					};
				} else {
					delete next[payload.graphId];
				}
				return next;
			});
			if (payload.status === "done" || payload.status === "error") {
				void refresh();
				if (payload.status === "done") {
					const who = agentDisplayName(payload.agent);
					if (payload.skipped) {
						setMessage(
							payload.summary ??
								`${who}: fully verified — nothing to propose`,
						);
					} else {
						setMessage(
							payload.pendingCount != null && payload.pendingCount > 0
								? `${who} finished (${payload.model ?? "model"}) — ${payload.pendingCount} proposal${payload.pendingCount === 1 ? "" : "s"} to review`
								: `${who} finished (${payload.model ?? "model"}) — no new proposals`,
						);
					}
				} else if (payload.error) {
					setError(payload.error);
				}
			}
		};
		graphifyChangeSubscribers.add(onGraphify);
		subsystemModelChangeSubscribers.add(onSubsystem);
		subsystemModelProposalsChangeSubscribers.add(onProposals);
		subsystemModelMaintainChangeSubscribers.add(onMaintain);
		return () => {
			graphifyChangeSubscribers.delete(onGraphify);
			subsystemModelChangeSubscribers.delete(onSubsystem);
			subsystemModelProposalsChangeSubscribers.delete(onProposals);
			subsystemModelMaintainChangeSubscribers.delete(onMaintain);
		};
	}, [refresh]);

	const onOpen = useCallback(async (graph: SubsystemModelSummary) => {
		await electrobun.rpc!.request.openSubsystemModel({ graphId: graph.id });
	}, []);


	const onCopyPath = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(graph.path);
				setCopiedId(graph.id);
				if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
				copyTimeoutRef.current = setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
			} catch {
				// clipboard may be denied — fail quietly
			}
		},
		[],
	);

	const onShareGist = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			setSharingId(graph.id);
			setMessage(null);
			setError(null);
			try {
				const result = await electrobun.rpc!.request.shareSubsystemModelAsGist({
					graphId: graph.id,
				});
				if (!result.ok) {
					setError(result.error ?? "Failed to share as gist");
					return;
				}
				const url = result.viewUrl ?? result.gistUrl;
				if (url) {
					try {
						await navigator.clipboard.writeText(url);
					} catch {
						// clipboard may be denied
					}
				}
				setMessage(
					result.created
						? `Shared as gist — link copied${url ? `: ${url}` : ""}`
						: `Gist updated — link copied${url ? `: ${url}` : ""}`,
				);
				await refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to share as gist");
			} finally {
				setSharingId(null);
			}
		},
		[refresh],
	);

	const onToggleRepoFilter = useCallback((key: string) => {
		setRepoFilter((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const onMaintain = useCallback(
		(e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			if (maintainByGraphId[graph.id]?.status === "running") return;
			const mode = maintainModeFromAuditEntry(auditByGraphId[graph.id]);
			if (!mode) return;
			setError(null);
			setMaintainPicker({ graphId: graph.id, title: graph.title, mode });
		},
		[auditByGraphId, maintainByGraphId],
	);

	const onMaintainStarted = useCallback(
		(
			graphId: string,
			title: string,
			info: {
				model: string;
				alreadyRunning?: boolean;
				mode: "issues" | "gaps";
			},
		) => {
			setMaintainByGraphId((prev) => ({
				...prev,
				[graphId]: { status: "running" },
			}));
			const who = maintainButtonCopy(info.mode).agentName;
			if (info.alreadyRunning) {
				setMessage(`${who} already running for ${title}`);
			} else {
				setMessage(`${who} running for ${title} (${info.model})…`);
			}
		},
		[],
	);

	const onDelete = useCallback(
		async (e: React.MouseEvent, graph: SubsystemModelSummary) => {
			e.stopPropagation();
			if (confirmId !== graph.id) {
				setConfirmId(graph.id);
				return;
			}
			setConfirmId(null);
			try {
				await electrobun.rpc!.request.deleteSubsystemModel({ graphId: graph.id });
				setGraphs((prev) => prev?.filter((g) => g.id !== graph.id) ?? null);
				setAuditByGraphId((prev) => {
					if (!(graph.id in prev)) return prev;
					const next = { ...prev };
					delete next[graph.id];
					return next;
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[confirmId],
	);

	const onShowAuditReport = useCallback(
		async (e: React.MouseEvent, graphId: string, entry: ListAuditEntry) => {
			e.stopPropagation();
			if (entry.status === "error") {
				setAuditModal({
					phase: "error",
					title: entry.title,
					error: entry.error,
				});
				return;
			}
			if (
				entry.status !== "fully_verified" &&
				entry.status !== "partially_verified" &&
				entry.status !== "issues"
			)
				return;

			if (entry.report) {
				setAuditModal({ phase: "done", report: entry.report });
				return;
			}

			setAuditModal({
				phase: "auditing",
				title: "Loading saved audit…",
			});
			try {
				const res = await electrobun.rpc!.request.getSubsystemModelAudit({
					graphId,
				});
				if (!res.ok || !res.report) {
					setAuditModal({
						phase: "error",
						title: "Saved audit",
						error: res.error ?? "No saved audit report",
					});
					return;
				}
				setAuditByGraphId((prev) => ({
					...prev,
					[graphId]: {
						status: entry.status,
						checkedAt: res.report!.checkedAt,
						stale: res.stale === true,
						issueCount: entry.issueCount,
						report: res.report,
					},
				}));
				setAuditModal({ phase: "done", report: res.report });
			} catch (err) {
				setAuditModal({
					phase: "error",
					title: "Saved audit",
					error: err instanceof Error ? err.message : String(err),
				});
			}
		},
		[],
	);

	if (error && graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
				regularAudit={regularAudit}
			/>
				<SubsystemsTabBody>
					<CenteredMessage title="Could not load subsystem graphs" detail={error} />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs === null) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
				regularAudit={regularAudit}
			/>
				<SubsystemsTabBody>
					<CenteredMessage title="Loading subsystem graphs…" />
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}
	if (graphs.length === 0) {
		return (
			<SubsystemsTabShell>
				<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
				regularAudit={regularAudit}
			/>
				<SubsystemsTabBody>
					<CenteredMessage
						title="No subsystem graphs yet"
						detail="POST one to http://127.0.0.1:3045/api/subsystem-model to create it."
					/>
				</SubsystemsTabBody>
			</SubsystemsTabShell>
		);
	}

	const now = Date.now();
	const isRecent = (g: SubsystemModelSummary) =>
		now - new Date(g.updatedAt).getTime() <= RECENT_MS;
	// Recency ignoring the repo filter, so a card stays lit while any of
	// its graphs is recent — selecting a repo must not dim the others stale.
	const recentIds = showAll
		? null
		: new Set(graphs.filter(isRecent).map((g) => g.id));
	const repos = collectReposFromGraphs(graphs, graphifyRepos, recentIds);
	const knownKeys = new Set(repos.map((r) => repoKey(r.owner, r.name)));
	const filterSet = asRepoFilterSet(repoFilter);
	const activeFilter = new Set(
		[...filterSet].filter((k) => knownKeys.has(k)),
	);
	const visibleGraphs =
		activeFilter.size === 0
			? graphs
			: graphs.filter((g) =>
					[...activeFilter].every((key) => {
						const [owner, name] = key.split("/");
						return owner != null && name != null && graphUsesRepo(g, owner, name);
					}),
				);
	const recentGraphs = showAll
		? visibleGraphs
		: visibleGraphs.filter(isRecent);
	const hiddenStaleCount = visibleGraphs.length - recentGraphs.length;
	const sortedGraphs = [...recentGraphs].sort((a, b) => {
		if (sortBy === "issues") {
			const diff =
				listAuditIssueSortValue(auditByGraphId[b.id]) -
				listAuditIssueSortValue(auditByGraphId[a.id]);
			if (diff !== 0) return diff;
			// Stable tie-break: most recently edited first.
			return (
				subsystemModelSortTime(b, "edited") - subsystemModelSortTime(a, "edited")
			);
		}
		return subsystemModelSortTime(b, sortBy) - subsystemModelSortTime(a, sortBy);
	});

	return (
		<SubsystemsTabShell>
			<SubsystemsTabHeader
				lastLoadedAt={lastLoadedAt}
				sortBy={sortBy}
				onSortChange={setSortBy}
				showAll={showAll}
				hiddenStaleCount={hiddenStaleCount}
				onToggleShowAll={() => setShowAll((v) => !v)}
				regularAudit={regularAudit}
			/>
			<SubsystemRepoCards
				repos={repos}
				selectedKeys={activeFilter}
				onToggle={onToggleRepoFilter}
			/>
			<SubsystemsTabBody>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						padding: "16px 24px",
					}}
				>
			{message && (
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: theme.colors.textSecondary,
						marginBottom: 10,
					}}
				>
					{message}
				</div>
			)}
			{error && (
				<div style={{ fontSize: theme.fontSizes[1], color: "#e5534b", marginBottom: 10 }}>
					{error}
				</div>
			)}
			{recentGraphs.length === 0 ? (
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: muted,
						padding: "24px 0",
					}}
				>
					{activeFilter.size > 0
						? `No graphs use all of: ${[...activeFilter].join(", ")}.`
						: hiddenStaleCount > 0
							? `No graphs edited in the last day — ${hiddenStaleCount} older hidden.`
							: "No subsystem graphs."}
				</div>
			) : (
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{sortedGraphs.map((graph) => {
					const auditEntry = auditByGraphId[graph.id];
					const auditBadge = auditEntry
						? listAuditBadge(auditEntry, theme.colors, muted)
						: null;
					const maintainState = maintainByGraphId[graph.id];
					const maintaining = maintainState?.status === "running";
					const maintainMode = maintainModeFromAuditEntry(auditEntry);
					const maintainCopy = maintainButtonCopy(maintainMode);
					const maintainDisabled = maintaining || !maintainMode;

					return (
						<div
							key={graph.id}
							onClick={() => onOpen(graph)}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = theme.colors.textMuted ?? "#555";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = theme.colors.border ?? "#333";
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "8px 12px",
								borderRadius: 4,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: theme.colors.backgroundSecondary ?? "transparent",
								cursor: "pointer",
								fontSize: theme.fontSizes[2],
								transition: "border-color 0.15s ease",
							}}
						>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{graph.title}
								</div>
								<div
									style={{
										marginTop: 4,
										fontSize: theme.fontSizes[0],
										color: muted,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
								{graph.componentCount === 1
									? "1 component"
									: `${graph.componentCount} components`}
								{" · "}
								{relativeTime(new Date(graph.updatedAt).getTime())}
								{graph.lastOpenedAt && (
									<>
										{" · opened "}
										{relativeTime(new Date(graph.lastOpenedAt).getTime())}
									</>
								)}
								</div>
							</div>
							{auditBadge && (
								<button
									type="button"
									onClick={(e) => {
										if (auditEntry && auditBadge.clickable) {
											void onShowAuditReport(e, graph.id, auditEntry);
										} else {
											e.stopPropagation();
										}
									}}
									title={auditBadge.title}
									style={{
										flexShrink: 0,
										boxSizing: "border-box",
										fontSize: theme.fontSizes[0],
										fontWeight: 600,
										letterSpacing: 0.3,
										textTransform: "uppercase",
										padding: "2px 7px",
										borderRadius: 999,
										background: `${auditBadge.color}22`,
										color: auditBadge.color,
										border: `1px solid ${auditBadge.color}55`,
										whiteSpace: "nowrap",
										cursor: auditBadge.clickable ? "pointer" : "default",
										fontFamily: theme.fonts.body,
										display: "inline-flex",
										alignItems: "center",
										gap: 5,
									}}
								>
									{auditBadge.spinning && (
										<Loader2 size={10} className="principal-studio-spin" />
									)}
									{auditBadge.label}
								</button>
							)}
							{(graph.pendingProposalCount ?? 0) > 0 && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setProposalsModal({
											graphId: graph.id,
											title: graph.title,
										});
									}}
									title="Review agent proposed corrections"
									style={{
										flexShrink: 0,
										boxSizing: "border-box",
										fontSize: theme.fontSizes[0],
										fontWeight: 600,
										letterSpacing: 0.3,
										textTransform: "uppercase",
										padding: "2px 7px",
										borderRadius: 999,
										background: `${theme.colors.primary}22`,
										color: theme.colors.primary,
										border: `1px solid ${theme.colors.primary}55`,
										whiteSpace: "nowrap",
										cursor: "pointer",
										fontFamily: theme.fonts.body,
									}}
								>
									{graph.pendingProposalCount === 1
										? "1 proposal"
										: `${graph.pendingProposalCount} proposals`}
								</button>
							)}
							<button
								type="button"
								onClick={(e) => void onMaintain(e, graph)}
								disabled={maintainDisabled}
								title={
									maintainState?.status === "error"
										? `${maintainCopy.agentName} failed: ${maintainState.error ?? "unknown"} — click to retry`
										: maintaining
											? `${maintainCopy.agentName} running…`
											: maintainCopy.title
								}
								aria-label={`${maintainCopy.label} ${graph.title}`}
								style={{
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									borderRadius: 4,
									border: `1px solid ${
										maintainState?.status === "error"
											? (theme.colors.error ?? "#e5534b")
											: (theme.colors.border ?? "#333")
									}`,
									background: "transparent",
									color:
										maintainState?.status === "error"
											? (theme.colors.error ?? "#e5534b")
											: muted,
									cursor: maintainDisabled ? "default" : "pointer",
									opacity: maintainDisabled ? 0.55 : 1,
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
								}}
							>
								{maintaining ? (
									<Loader2 size={12} className="principal-studio-spin" />
								) : (
									<Bot size={12} />
								)}
								{maintaining ? "Running…" : maintainCopy.label}
							</button>
							<button
								type="button"
								onClick={(e) => void onCopyPath(e, graph)}
								title={`Copy path: ${graph.path}`}
								aria-label={`Copy path for ${graph.title}`}
								style={{
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									borderRadius: 4,
									border: `1px solid ${
										copiedId === graph.id
											? theme.colors.primary
											: (theme.colors.border ?? "#333")
									}`,
									background:
										copiedId === graph.id
											? theme.colors.primary
											: "transparent",
									color:
										copiedId === graph.id
											? theme.colors.background
											: muted,
									cursor: "pointer",
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
								}}
							>
								{copiedId === graph.id ? <Check size={12} /> : <Copy size={12} />}
								{copiedId === graph.id ? "Copied" : "Copy path"}
							</button>
							<button
								type="button"
								onClick={(e) => void onShareGist(e, graph)}
								disabled={sharingId === graph.id}
								title={
									graph.gist
										? `Update gist ${graph.gist.id}`
										: "Share as a public GitHub gist"
								}
								aria-label={
									graph.gist
										? `Update gist for ${graph.title}`
										: `Share ${graph.title} as gist`
								}
								style={{
									flexShrink: 0,
									display: "inline-flex",
									alignItems: "center",
									gap: 4,
									padding: "4px 8px",
									borderRadius: 4,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
									background: "transparent",
									color: muted,
									cursor: sharingId === graph.id ? "default" : "pointer",
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.body,
									opacity: sharingId === graph.id ? 0.7 : 1,
								}}
							>
								<Share2 size={12} />
								{sharingId === graph.id
									? "Sharing…"
									: graph.gist
										? "Update gist"
										: "Gist"}
							</button>
							<button
								type="button"
								onClick={(e) => onDelete(e, graph)}
								title={
									confirmId === graph.id
										? "Click again to delete"
										: `Delete ${graph.title}`
								}
								aria-label={
									confirmId === graph.id
										? `Confirm delete ${graph.title}`
										: `Delete ${graph.title}`
								}
								style={{
									flexShrink: 0,
									border: "none",
									background: "transparent",
									color:
										confirmId === graph.id
											? "#e5534b"
											: muted,
									fontWeight: confirmId === graph.id ? 600 : 400,
									cursor: "pointer",
									fontSize: theme.fontSizes[1],
									lineHeight: 1,
									padding: "2px 6px",
									borderRadius: 4,
								}}
							>
								{confirmId === graph.id ? "delete?" : "✕"}
							</button>
						</div>
					);
				})}
			</div>
			)}
				</div>
			</SubsystemsTabBody>
			{auditModal && (
				<AuditResultsModal
					state={auditModal}
					onClose={() => setAuditModal(null)}
					onReportChange={(report) => {
						setAuditModal({ phase: "done", report });
						setAuditByGraphId((prev) => ({
							...prev,
							[report.graphId]: {
								status: report.needsUpdate
									? "issues"
									: report.findings.some(
												(f) => f.kind === "construct_unconfirmed",
										  ) ||
										  report.checks.some(
												(c) =>
													c.constructInferred === "unknown" ||
													c.signature === "skipped",
										  )
										? "partially_verified"
										: "fully_verified",
								checkedAt: report.checkedAt,
								stale: false,
								issueCount: report.findings.filter(
									(f) => f.severity === "error" || f.severity === "warn",
								).length,
								report,
							},
						}));
					}}
				/>
			)}
			{proposalsModal && (
				<ProposalsModal
					graphId={proposalsModal.graphId}
					title={proposalsModal.title}
					onClose={() => setProposalsModal(null)}
				/>
			)}
			{maintainPicker && (
				<MaintainModelPickerModal
					graphId={maintainPicker.graphId}
					title={maintainPicker.title}
					mode={maintainPicker.mode}
					onClose={() => setMaintainPicker(null)}
					onStarted={(info) =>
						onMaintainStarted(
							maintainPicker.graphId,
							maintainPicker.title,
							{ ...info, mode: maintainPicker.mode },
						)
					}
				/>
			)}
		</SubsystemsTabShell>
	);
}
