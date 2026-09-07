/**
 * AnalysisView — renders one session's concept analysis (a `kind: "analysis"`
 * tab) as a feed of concept cards and/or subsystem snapshots.
 *
 * The cards reuse the same `FeedCard` / `DiagramModal` from ConceptCardsView,
 * so analyzed sessions and the saved Concepts feed look and behave the same.
 * Subsystem snapshots render through `SubsystemSnapshots` (sequence-central),
 * one card per subsystem the session touched. The view reads its analysis from
 * the host via `getTab` (the tab payload is the `ConceptAnalysis` record).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { MermaidMarkdownPresentation } from "themed-markdown";
import type { MermaidMarkdownSlide } from "themed-markdown";
import { electrobun, reloadSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import { FeedCard, DiagramModal } from "./ConceptCardsView";
import { SubsystemSnapshots } from "./SubsystemSnapshots";
import { CHANGE_TYPE_LABELS } from "../concepts";
import type {
	ConceptAnalysis,
	ConceptCardData,
	SessionSummary,
} from "../../shared/contract";

type ViewMode = "cards" | "slides" | "subsystems";

/** Map a concept card to a presentation slide. Cards that carry authored
 *  `markdown` prose use it verbatim; the rest get a slide derived from the
 *  card's description + points, so every analysis renders either way. */
function cardToSlide(c: ConceptCardData): MermaidMarkdownSlide {
	// Authored `markdown` prose wins verbatim (it can already cite files);
	// otherwise derive a slide from the card fields.
	const markdown =
		c.markdown ??
		(() => {
			const body = [
				`# ${c.title}`,
				"",
				`> ${CHANGE_TYPE_LABELS[c.changeType]}`,
				"",
				c.description,
				"",
				"## Key points",
				"",
				...c.points.map((p) => `- ${p}`),
			];
			if (c.files && c.files.length > 0) {
				body.push("", "## Files", "", ...c.files.map((f) => `- \`${f}\``));
			}
			return body.join("\n");
		})();
	return {
		title: c.title,
		mermaid:
			c.mermaid ||
			`flowchart LR
    A["${c.title.replace(/"/g, "'")}"] --> B["captured concept"]`,
		markdown,
	};
}

export function AnalysisView({
	tabId,
	analysisId,
}: {
	tabId: string;
	analysisId: string;
}) {
	const { theme } = useTheme();
	const [analysis, setAnalysis] = useState<ConceptAnalysis | null | undefined>(
		undefined,
	);
	const [sessions, setSessions] = useState<Map<string, SessionSummary>>(
		new Map(),
	);
	const [openId, setOpenId] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("cards");
	const [retrying, setRetrying] = useState(false);
	// conceptId → savedConceptId, for cards of this analysis that are already
	// in the saved store (so the Save chip reflects and toggles real state).
	const [savedByConceptId, setSavedByConceptId] = useState<Map<string, string>>(
		new Map(),
	);

	const loadAnalysis = useCallback(() => {
		void electrobun.rpc!.request
			.getTab({ id: tabId })
			.then((tab) => {
				setAnalysis(
					tab.ok && tab.payload ? (tab.payload as ConceptAnalysis) : null,
				);
			})
			.catch(() => setAnalysis(null));
	}, [tabId]);

	useEffect(() => {
		loadAnalysis();
		// Re-fetch when the host broadcasts tabsChanged — the analysis transitions
		// pending → done/error in the background while this tab stays open.
		reloadSubscribers.add(loadAnalysis);
		return () => {
			reloadSubscribers.delete(loadAnalysis);
		};
	}, [loadAnalysis]);

	// When an analysis has subsystem snapshots but no concept cards (e.g. the
	// seeded sample), land on the subsystems view rather than an empty feed.
	useEffect(() => {
		if (analysis?.status !== "done") return;
		if (
			(analysis.subsystems?.length ?? 0) > 0 &&
			analysis.concepts.length === 0
		) {
			setViewMode("subsystems");
		}
	}, [analysis]);

	// Redo a failed extraction in place: the host resets the record to `pending`
	// and restarts the opencode run under the same analysis id, then broadcasts
	// tabsChanged — the reloadSubscribers hook below re-fetches and shows the
	// pending state while it runs.
	const retry = useCallback(async () => {
		if (!analysis || analysis.status !== "error" || retrying) return;
		setRetrying(true);
		try {
			const res = await electrobun.rpc!.request.analyzeSession({
				sessionId: analysis.sessionId,
				title: analysis.sessionTitle,
				agent: analysis.agent,
				force: true,
			});
			if (res.ok) loadAnalysis();
		} catch {
			// The tabsChanged broadcast may already have reset the view; a failed
			// RPC leaves the error state up so the button stays clickable.
		} finally {
			setRetrying(false);
		}
	}, [analysis, retrying, loadAnalysis]);

	// Enrich session ids on cards with names — enrichment only; cards render
	// bare ids when it's unavailable.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.listSessions({
					days: 90,
				});
				if (cancelled) return;
				const map = new Map<string, SessionSummary>();
				for (const g of res.groups ?? []) {
					map.set(g.parent.id, g.parent);
					for (const c of g.children) map.set(c.id, c);
				}
				for (const s of res.standalone ?? []) map.set(s.id, s);
				setSessions(map);
			} catch {
				// enrichment only
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Which of this analysis's cards are already in the saved store — the Save
	// chip reflects real state and toggles it.
	useEffect(() => {
		if (!analysis || analysis.status !== "done") return;
		let cancelled = false;
		void electrobun.rpc!.request
			.listSavedConcepts({})
			.then((res) => {
				if (cancelled) return;
				const map = new Map<string, string>();
				for (const c of res.concepts) {
					if (c.sourceAnalysisId === analysis.id) {
						map.set(c.id, c.savedConceptId);
					}
				}
				setSavedByConceptId(map);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [analysis]);

	const toggleSave = useCallback(
		(concept: ConceptCardData) => {
			if (!analysis) return;
			const existingId = savedByConceptId.get(concept.id);
			if (existingId) {
				void electrobun.rpc!.request
					.unsaveConcept({ savedConceptId: existingId })
					.then(() =>
						setSavedByConceptId((prev) => {
							const next = new Map(prev);
							next.delete(concept.id);
							return next;
						}),
					)
					.catch(() => {});
			} else {
				void electrobun.rpc!.request
					.saveConcept({ analysisId: analysis.id, conceptId: concept.id })
					.then((res) => {
						if (res.ok && res.savedConcept) {
							setSavedByConceptId((prev) => {
								const next = new Map(prev);
								next.set(concept.id, res.savedConcept!.savedConceptId);
								return next;
							});
						}
					})
					.catch(() => {});
			}
		},
		[analysis, savedByConceptId],
	);

	const openConcept =
		analysis?.concepts.find((c) => c.id === openId) ?? null;

	const slides = useMemo(
		() => analysis?.concepts.map(cardToSlide) ?? [],
		[analysis],
	);

	if (analysis === undefined) {
		return <CenteredMessage title="Loading analysis…" />;
	}
	if (analysis === null) {
		return (
			<CenteredMessage
				title="Analysis unavailable"
				detail={`Could not load analysis ${analysisId} from the host.`}
			/>
		);
	}
	if (analysis.status === "error") {
		return (
			<CenteredMessage
				title="Analysis failed"
				detail={analysis.error ?? "Unknown error"}
			>
				<button
					type="button"
					disabled={retrying}
					onClick={retry}
					style={{
						marginTop: 16,
						padding: "8px 18px",
						border: `1px solid ${theme.colors.border}`,
						borderRadius: 4,
						background: theme.colors.backgroundSecondary,
						color: theme.colors.text,
						fontFamily: theme.fonts.body,
						fontSize: theme.fontSizes[1],
						cursor: retrying ? "default" : "pointer",
						opacity: retrying ? 0.6 : 1,
					}}
				>
					{retrying ? "Restarting extraction…" : "Retry analysis"}
				</button>
			</CenteredMessage>
		);
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
			}}
		>
			<div
				style={{
					padding: "14px 24px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 16,
					flexShrink: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						minWidth: 0,
					}}
				>
					<span
						style={{
							fontSize: theme.fontSizes[3],
							fontFamily: theme.fonts.heading ?? theme.fonts.body,
							color: theme.colors.text,
							lineHeight: 1.3,
						}}
					>
						{analysis.sessionTitle ?? analysis.sessionId}
					</span>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textSecondary,
							fontFamily: theme.fonts.monospace,
						}}
					>
						{analysis.agent ?? "opencode"} · {formatDate(analysis.createdAt)}
						{analysis.model ? ` · ${analysis.model}` : ""} ·{" "}
						{analysis.concepts.length} concept
						{analysis.concepts.length === 1 ? "" : "s"}
					</span>
				</div>
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexShrink: 0,
					}}
				>
					{analysis.status === "done" &&
						(analysis.concepts.length > 0 ||
							(analysis.subsystems?.length ?? 0) > 0) && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 2,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								borderRadius: 6,
								overflow: "hidden",
							}}
						>
							{(() => {
								const modes: ViewMode[] = ["cards", "slides"];
								if ((analysis.subsystems?.length ?? 0) > 0) {
									modes.push("subsystems");
								}
								return modes;
							})().map((mode) => (
								<button
									key={mode}
									type="button"
									onClick={() => setViewMode(mode)}
									style={{
										padding: "3px 10px",
										border: "none",
										background:
											viewMode === mode
												? theme.colors.background
												: theme.colors.backgroundSecondary,
										color:
											viewMode === mode
												? theme.colors.text
												: theme.colors.textSecondary,
										fontFamily: theme.fonts.monospace,
										fontSize: theme.fontSizes[0],
										textTransform: "uppercase",
										letterSpacing: 0.5,
										cursor: "pointer",
									}}
								>
									{mode}
								</button>
							))}
						</div>
					)}
					<span
						style={{
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.monospace,
							textTransform: "uppercase",
							letterSpacing: 1,
							color:
								analysis.status === "done"
									? theme.colors.primary
									: theme.colors.textSecondary,
						}}
					>
						{analysis.status}
					</span>
				</span>
			</div>

			{analysis.status === "done" && viewMode === "subsystems" ? (
				<SubsystemSnapshots subsystems={analysis.subsystems ?? []} />
			) : analysis.status === "done" &&
			  analysis.concepts.length > 0 &&
			  viewMode === "slides" ? (
				<MermaidMarkdownPresentation
					slides={slides}
					theme={theme}
					mermaidFitStrategy="contain"
				/>
			) : (
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 16,
						padding: "20px 24px 40px",
					}}
				>
					{analysis.status === "pending" ? (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 10,
								color: theme.colors.textMuted,
								fontSize: theme.fontSizes[2],
								paddingTop: 40,
							}}
						>
							<span>Extracting concept cards + subsystems…</span>
							<span
								style={{
									fontSize: theme.fontSizes[0],
									fontFamily: theme.fonts.monospace,
									color: theme.colors.textSecondary,
								}}
							>
								opencode run → concept-extractor · opencode-go/deepseek-v4-flash
							</span>
							<span
								style={{
									fontSize: theme.fontSizes[0],
									color: theme.colors.textSecondary,
								}}
							>
								This can take a minute — the tab refreshes when it finishes.
							</span>
						</div>
					) : analysis.concepts.length === 0 ? (
						<div
							style={{
								color: theme.colors.textMuted,
								fontSize: theme.fontSizes[2],
								paddingTop: 40,
							}}
						>
							No concept cards yet.
						</div>
					) : (
						analysis.concepts.map((concept) => (
							<FeedCard
								key={concept.id}
								concept={concept}
								sessions={sessions}
								theme={theme}
								saved={savedByConceptId.has(concept.id)}
								onToggleSave={() => toggleSave(concept)}
								onOpen={() => setOpenId(concept.id)}
							/>
						))
					)}
				</div>
			)}

			{openConcept && (
				<DiagramModal
					concept={openConcept}
					theme={theme}
					onClose={() => setOpenId(null)}
				/>
			)}
		</div>
	);
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
