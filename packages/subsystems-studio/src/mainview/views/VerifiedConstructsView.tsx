/**
 * VerifiedConstructsView — the "Constructs" tab.
 *
 * Repositories start with stored subsystem models; Alexandria search can open
 * other registered repositories without analysis. Tab load reads saved
 * model audits and the cumulative timeline only; it never runs Graphify or
 * parses the current graph. Timeline analysis starts only on an explicit action.
 * Spans are read and checked on demand from the working tree.
 *
 * Font scale is the theme's `fontSizes` (12/14/16/18/…): secondary text uses
 * `[1]` (14), row/repo names `[2]` (16), and the span-pane title `[3]` (18).
 */

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	getFiletypeFromFileName,
	getHighlighterOptions,
	preloadHighlighter,
} from "@pierre/diffs";
import { File } from "@pierre/diffs/react";
import { Loader2, Search } from "lucide-react";
import type {
	SourceConstruct,
	ConstructInventoryRepo,
} from "../../shared/contract";
import { electrobun, packageLayersChangeSubscribers, subsystemModelChangeSubscribers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import { ConstructComplexityControl } from "../components/ConstructComplexityControl";
import { ConstructsDrilldown } from "../components/ConstructsDrilldown";
import { ConstructRepositorySearch } from "../components/ConstructRepositorySearch";
import { ConstructTimelinePanel, ConstructTimelineTrigger, useConstructTimeline } from "../components/ConstructTimelineControl";

const POLL_MS = 15_000;

/** Total verified constructs in a repo (sum across its package groups). */
function countRepo(repo: ConstructInventoryRepo): number {
	return repo.packages.reduce((n, p) => n + p.constructs.length, 0);
}

/** Same verified claim? Used to keep the open construct stable across polls. */
function sameConstruct(a: SourceConstruct, b: SourceConstruct): boolean {
	return (
		a.id === b.id &&
		a.file === b.file &&
		a.purl === b.purl &&
		a.span?.startLine === b.span?.startLine &&
		a.span?.endLine === b.span?.endLine &&
		a.span?.contentHash === b.span?.contentHash &&
		a.verification.status === b.verification.status &&
		a.verification.evidence === b.verification.evidence &&
		JSON.stringify(a.models) === JSON.stringify(b.models)
	);
}

/** Extension of the source file, for the synthetic standalone file name. */
function fileExtension(path: string | undefined): string {
	if (!path) return "";
	const dot = path.lastIndexOf(".");
	if (dot < 0 || dot === path.length - 1) return "";
	return path.slice(dot);
}

function constructBadge(
	theme: ReturnType<typeof useTheme>["theme"],
): CSSProperties {
	return {
		flexShrink: 0,
		fontSize: theme.fontSizes[1],
		fontWeight: 600,
		letterSpacing: 0.3,
		textTransform: "uppercase",
		padding: "1px 7px",
		borderRadius: 999,
		color: theme.colors.primary,
		background: `${theme.colors.primary}18`,
		border: `1px solid ${theme.colors.primary}44`,
	};
}

/**
 * SpanCodeView — renders one source span as its own file, with the gutter
 * numbered by the span's real position in the source file. Pierre numbers
 * whatever contents it gets starting at 1; `onPostRender` rewrites each gutter
 * cell from its `data-line-index` (the same remap `PierreSnippetView` uses), so
 * only the span text is needed — no whole-file read.
 */
function SpanCodeView({
	text,
	fileName,
	startLine,
	background,
}: {
	text: string;
	/** Synthetic file name for language detection / display. */
	fileName: string;
	/** 1-based first line of the span in the source file. */
	startLine: number;
	background: string;
}) {
	const [ready, setReady] = useState(false);
	const lang = getFiletypeFromFileName(fileName);

	useEffect(() => {
		let cancelled = false;
		setReady(false);
		// Warm the shared highlighter first: a cold render paints an empty <pre>
		// that never re-renders (no worker pool).
		void preloadHighlighter(getHighlighterOptions(lang, {}))
			.catch(() => {
				/* fall through to a plain-text render */
			})
			.then(() => {
				if (!cancelled) setReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [lang]);

	const onPostRender = useCallback(
		(container: HTMLElement) => {
			const offset = startLine - 1;
			if (offset === 0) return;
			const root = container.shadowRoot ?? container;
			const cells = root.querySelectorAll(
				"[data-column-number][data-line-index]",
			);
			cells.forEach((el) => {
				const raw = (el as HTMLElement).dataset["lineIndex"];
				if (raw == null) return;
				const idx = Number.parseInt(raw, 10);
				if (Number.isNaN(idx)) return;
				const display = String(idx + 1 + offset);
				const span = el.querySelector("[data-line-number-content]");
				if (span && span.textContent !== display) span.textContent = display;
			});
		},
		[startLine],
	);

	const options = useMemo(
		() => ({
			disableFileHeader: true,
			unsafeCSS: `:host{--diffs-light-bg:${background};--diffs-dark-bg:${background};background:${background} !important;}`,
			onPostRender,
		}),
		[background, onPostRender],
	);

	const file = useMemo(
		() => ({ name: fileName, contents: text, lang }),
		[fileName, text, lang],
	);

	if (!ready) {
		return (
			<div style={{ padding: 16, color: "inherit" }}>
				Loading…
			</div>
		);
	}
	return <File file={file} options={options} style={{ display: "block" }} />;
}

/** Render one construct's pinned span as a standalone file. */
function SpanPane({ construct }: { construct: SourceConstruct | null }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [state, setState] = useState<
		| { kind: "idle" }
		| { kind: "loading" }
		| { kind: "ready"; text: string; verified: boolean }
		| { kind: "error"; message: string }
	>({ kind: "idle" });

	useEffect(() => {
		if (!construct?.span) {
			setState({ kind: "idle" });
			return;
		}
		const span = construct.span;
		let cancelled = false;
		setState({ kind: "loading" });
		(async () => {
			try {
				const res = await electrobun.rpc!.request.readSubsystemSpan({
					purl: construct.purl, file: construct.file, ...span,
				});
				if (cancelled) return;
				if (!res.ok || res.text == null) {
					setState({
						kind: "error",
						message: res.error ?? "Failed to read span",
					});
				} else {
					setState({
						kind: "ready",
						text: res.text,
						verified: res.verified === true,
					});
				}
			} catch (err) {
				if (!cancelled) {
					setState({
						kind: "error",
						message: err instanceof Error ? err.message : String(err),
					});
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [construct]);

	if (!construct) {
		return (
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 24,
					color: muted,
					fontSize: theme.fontSizes[2],
					fontFamily: theme.fonts.body,
				}}
			>
				Select a construct to read its span.
			</div>
		);
	}

	if (!construct.span) {
		return <CenteredMessage title={construct.name}
			detail={`${construct.file}:${construct.graphStartLine ?? "?"} · ${construct.verification.status}: ${construct.verification.evidence}`} />;
	}
	const span = construct.span;
	const ext = fileExtension(construct.file);
	const fileName = `${construct.symbol ?? construct.name}${ext}`;
	const verified = state.kind === "ready" && state.verified;
	const badgeColor = verified ? (theme.colors.success ?? theme.colors.primary) : (theme.colors.error ?? theme.colors.text);
	const badgeLabel = verified
		? "Source verified"
		: state.kind === "ready"
			? "Drifted"
			: state.kind === "error" ? "Read failed" : "Reading…";

	return (
		<div
			style={{
				flex: 1,
				minWidth: 0,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
			}}
		>
			<div
				role="group"
				aria-label="Construct information"
				style={{
					flexShrink: 0,
					maxHeight: "70%",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 6,
					padding: "12px 16px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{
							fontSize: theme.fontSizes[3],
							fontWeight: 600,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{construct.name}
					</span>
					<span style={constructBadge(theme)}>
						{construct.construct}
					</span>
					<span style={{ flex: 1 }} />
					<ConstructComplexityControl
						construct={{ ...construct, ...span }}
						enabled={verified}
					/>
					<span
						title={
							verified
								? "Parsed source declaration; content hash matches. This is not a subsystem-model audit."
								: "Span no longer matches the stored content hash"
						}
						style={{
							flexShrink: 0,
							fontSize: theme.fontSizes[1],
							fontWeight: 600,
							letterSpacing: 0.3,
							textTransform: "uppercase",
							padding: "3px 9px",
							borderRadius: 999,
							color: theme.colors.text,
							background: theme.colors.backgroundSecondary ?? theme.colors.background,
							border: `1px solid ${badgeColor}`,
						}}
					>
						{badgeLabel}
					</span>
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.monospace,
						color: muted,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					<span title={construct.file}>
						{construct.file}:{span.startLine}–{span.endLine}
					</span>
					<span>·</span>
					<span>source checked {relativeTime(Date.parse(construct.verification.checkedAt))}</span>
				</div>
				{construct.models.length > 0 && (
					<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
						Models: {construct.models.map((model) => `${model.modelTitle} (${model.alias})`).join(", ")}
					</div>
				)}
			</div>

			<div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
				{state.kind === "loading" && (
					<div
						style={{
							height: "100%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 8,
							color: muted,
							fontSize: theme.fontSizes[2],
							fontFamily: theme.fonts.body,
						}}
					>
						<Loader2 size={18} className="principal-studio-spin" />
						Reading span…
					</div>
				)}
				{state.kind === "error" && (
					<div
						style={{
							padding: 16,
							fontSize: theme.fontSizes[2],
							color: "#e5534b",
							fontFamily: theme.fonts.body,
						}}
					>
						{state.message}
					</div>
				)}
				{state.kind === "ready" && (
					<SpanCodeView
						key={`${construct.id}\0${span.contentHash}`}
						text={state.text}
						fileName={fileName}
						startLine={span.startLine}
						background={theme.colors.background}
					/>
				)}
			</div>
		</div>
	);
}

export function VerifiedConstructsView() {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [repos, setRepos] = useState<ConstructInventoryRepo[] | null>(null);
	const [registryRepos, setRegistryRepos] = useState<ConstructInventoryRepo[]>([]);
	const sidebarRepos = useMemo(() => {
		const saved = new Map((repos ?? []).map((repo) => [repo.repoKey.toLowerCase(), repo]));
		for (const repo of registryRepos) {
			if (!saved.has(repo.repoKey.toLowerCase())) saved.set(repo.repoKey.toLowerCase(), repo);
		}
		return [...saved.values()];
	}, [repos, registryRepos]);
	const [error, setError] = useState<string | null>(null);
	const [focusedRepoKey, setFocusedRepoKey] = useState<string | null>(null);
	const timeline = useConstructTimeline(focusedRepoKey);
	const [selected, setSelected] = useState<SourceConstruct | null>(null);
	const refreshPending = useRef(false);
	/** Filter over the selected repo's constructs. */
	const [query, setQuery] = useState("");
	/** Right-hand timeline panel is showing instead of the span pane. */
	const [timelineOpen, setTimelineOpen] = useState(false);
	/** Whole-repo bounds for the focused repo (commits + age), read-only. */
	const [repoInfo, setRepoInfo] = useState<{ commits: number; ageDays: number; firstCommitAt: string } | null>(null);
	/** Single sidebar width (px), draggable at its right edge. */
	const [panelWidth, setPanelWidth] = useState(350);
	const [panelDrag, setPanelDrag] = useState(false);
	const panelDragStartX = useRef(0);
	const panelDragStartWidth = useRef(350);
	const panelDragMaxWidth = useRef(600);
	const PANEL_MIN_WIDTH = 200;

	const focusRepo = useCallback((repoKey: string) => {
		setFocusedRepoKey((current) => (current === repoKey ? null : repoKey));
	}, []);

	const onPanelResizeStart = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			panelDragStartX.current = event.clientX;
			panelDragStartWidth.current = panelWidth;
			panelDragMaxWidth.current = Math.max(
				window.innerWidth * 0.6,
				PANEL_MIN_WIDTH,
			);
			setPanelDrag(true);
		},
		[panelWidth],
	);

	useEffect(() => {
		if (!panelDrag) return;
		const onMove = (event: MouseEvent) => {
			const delta = event.clientX - panelDragStartX.current;
			setPanelWidth(
				Math.min(
					Math.max(panelDragStartWidth.current + delta, PANEL_MIN_WIDTH),
					panelDragMaxWidth.current,
				),
			);
		};
		const onUp = () => setPanelDrag(false);
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [panelDrag]);
	const refresh = useCallback(async () => {
		if (refreshPending.current) return;
		refreshPending.current = true;
		try {
			const res = await electrobun.rpc!.request.listConstructInventory({});
			if (!res.ok) {
				setError(res.error ?? "Failed to load construct inventory.");
				return;
			}
			setRepos(res.repos);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			refreshPending.current = false;
		}
	}, []);

	useEffect(() => {
		void refresh();
		const id = setInterval(() => void refresh(), POLL_MS);
		return () => clearInterval(id);
	}, [refresh]);

	useEffect(() => {
		const onPush = () => void refresh();
		subsystemModelChangeSubscribers.add(onPush);
		return () => {
			subsystemModelChangeSubscribers.delete(onPush);
		};
	}, [refresh]);

	// Existing package metadata may change elsewhere. Reading it must not
	// trigger discovery, extraction, or source verification from this tab.
	useEffect(() => {
		const onPush = () => void refresh();
		packageLayersChangeSubscribers.add(onPush);
		return () => {
			packageLayersChangeSubscribers.delete(onPush);
		};
	}, [refresh]);

	// Switching repos drops the construct selection, the search, and the panel.
	useEffect(() => {
		setSelected(null);
		setQuery("");
		setTimelineOpen(false);
	}, [focusedRepoKey]);

	// Whole-repo bounds: read-only, independent of any saved analysis.
	useEffect(() => {
		if (!focusedRepoKey) {
			setRepoInfo(null);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const res = await electrobun.rpc!.request.getConstructRepositoryInfo({ purl: focusedRepoKey });
				if (cancelled) return;
				setRepoInfo(res.ok && res.commits != null
					? { commits: res.commits, ageDays: res.ageDays ?? 0, firstCommitAt: res.firstCommitAt ?? "" }
					: null);
			} catch {
				if (!cancelled) setRepoInfo(null);
			}
		})();
		return () => { cancelled = true; };
	}, [focusedRepoKey]);

	const repo = useMemo(() => sidebarRepos.find((entry) => entry.repoKey === focusedRepoKey) ?? null,
		[sidebarRepos, focusedRepoKey]);

	// Keep the selected saved audit row current across metadata refreshes.
	useEffect(() => {
		setSelected((current) => {
			if (!current) return current;
			const match = repo?.repoKey === current.repoKey
				? repo.packages.flatMap((pkg) => pkg.constructs).find((row) => row.id === current.id) : undefined;
			if (!match) return null;
			return sameConstruct(current, match) ? current : match;
		});
	}, [repo]);

	// The selected repo's packages, narrowed by the search box.
	const q = query.trim().toLowerCase();
	const packages = useMemo(() => {
		if (!repo) return [];
		if (!q) return repo.packages;
		return repo.packages
			.map((pkg) => ({
				...pkg,
				constructs: pkg.constructs.filter((c) =>
					`${c.symbol} ${c.file} ${c.construct} ${c.verification.status} ${c.models.map((m) => m.modelTitle).join(" ")}`.toLowerCase().includes(q),
				),
			}))
			.filter((pkg) => pkg.constructs.length > 0);
	}, [repo, q]);
	const shownCount = packages.reduce((n, p) => n + p.constructs.length, 0);
	const emptyMessage = "No saved constructs for this repository. Audit a subsystem model to populate the list. The timeline can be analyzed independently.";

	if (error && repos === null) {
		return (
			<CenteredMessage
				title="Could not load constructs"
				detail={error}
			/>
		);
	}
	if (repos === null) {
		return <CenteredMessage title="Loading saved constructs…" />;
	}
	return (
		<main aria-label="Constructs"
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "row",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			{/* One drill-down sidebar: repos → this repo's constructs */}
			<div
				style={{
					width: panelWidth,
					minWidth: panelWidth,
					borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					background: theme.colors.backgroundSecondary ?? theme.colors.background,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
					userSelect: panelDrag ? "none" : undefined,
				}}
			>
				<ConstructRepositorySearch onSelect={(match) => {
					const existing = sidebarRepos.find((repo) => repo.repoKey.toLowerCase() === match.repoKey.toLowerCase());
					if (!existing) setRegistryRepos((current) => [...current, match]);
					setFocusedRepoKey(existing?.repoKey ?? match.repoKey);
				}} />
				{sidebarRepos.length === 0 && (
					<div style={{ padding: 12, color: muted, fontSize: theme.fontSizes[1] }}>
						Search Alexandria to open a repository, or add a subsystem model.
					</div>
				)}
				{error && (
					<div role="alert" style={{ flexShrink: 0, padding: "8px 12px", color: "#e5534b", fontSize: theme.fontSizes[1] }}>
						{error}
					</div>
				)}
				<ConstructsDrilldown
					repos={sidebarRepos}
					focusedRepoKey={focusedRepoKey}
					onFocusRepo={focusRepo}
					renderFocused={() => repo && (
						<>
							{repoInfo && (
								<div
									title={repoInfo.firstCommitAt ? `First commit ${repoInfo.firstCommitAt.slice(0, 10)}` : undefined}
									style={{
										flexShrink: 0, padding: "5px 12px", color: muted, fontSize: theme.fontSizes[0],
										borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
									}}
								>
									{repoInfo.commits.toLocaleString()} commits · {repoInfo.ageDays} days old
								</div>
							)}
							<div
								style={{
									flexShrink: 0,
									display: "flex",
									alignItems: "center",
									gap: 8,
									padding: "7px 12px",
									borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
									fontSize: theme.fontSizes[2],
									fontWeight: 600,
								}}
							>
								<label
									style={{
										flex: 1,
										minWidth: 0,
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "4px 9px",
										borderRadius: 6,
										border: `1px solid ${theme.colors.border ?? "#333"}`,
										background:
											theme.colors.backgroundSecondary ?? "transparent",
									}}
								>
									<Search size={14} color={muted} aria-hidden="true" />
									<input
										type="text"
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Escape") setQuery("");
										}}
										placeholder={`Search ${countRepo(repo)} saved constructs`}
										aria-label="Search constructs"
										autoComplete="off"
										autoCorrect="off"
										autoCapitalize="off"
										spellCheck={false}
										style={{
											flex: 1,
											minWidth: 0,
											border: "none",
											outline: "none",
											background: "transparent",
											color: theme.colors.text,
											fontSize: theme.fontSizes[1],
											fontWeight: 400,
											fontFamily: theme.fonts.body,
										}}
									/>
									{query && (
										<button
											type="button"
											onClick={() => setQuery("")}
											title="Clear search"
											aria-label="Clear search"
											style={{
												flexShrink: 0,
												border: "none",
												background: "transparent",
												color: muted,
												cursor: "pointer",
												fontSize: theme.fontSizes[1],
												lineHeight: 1,
												padding: 0,
											}}
										>
											✕
										</button>
									)}
								</label>
							</div>
							<ConstructTimelineTrigger
								timeline={timeline}
								open={timelineOpen}
								onToggle={() => setTimelineOpen((open) => !open)}
							/>
							<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
								{error && <div role="alert" style={{ padding: 12, color: "#e5534b" }}>{error}</div>}
								{repo?.error && (
									<div role="alert" style={{ padding: "10px 14px", color: "#e5534b", fontSize: theme.fontSizes[1] }}>
										{repo.error}
									</div>
								)}
								{!q && shownCount === 0 && emptyMessage && (
									<div style={{ padding: "16px 14px", color: muted, fontSize: theme.fontSizes[1] }}>
										{emptyMessage}
									</div>
								)}
								{q && shownCount === 0 && (
									<div
										style={{
											padding: "16px 14px",
											color: muted,
											fontSize: theme.fontSizes[1],
										}}
									>
										No saved constructs match “{query.trim()}”.
									</div>
								)}
								{packages.map((pkg) => (
									<div key={pkg.path || "::root"}>
										{repo?.hasPackageInfo && (
											<div
												style={{
													position: "sticky",
													top: 0,
													zIndex: 1,
													display: "flex",
													alignItems: "center",
													gap: 8,
													padding: "6px 14px",
													background:
														theme.colors.backgroundSecondary ?? theme.colors.background,
													borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
													fontSize: theme.fontSizes[1],
												}}
												title={pkg.manifestPath}
											>
												<span
													style={{
														fontWeight: 600,
														whiteSpace: "nowrap",
														overflow: "hidden",
														textOverflow: "ellipsis",
													}}
												>
													{pkg.name || "repo root"}
												</span>
												{pkg.isMonorepoRoot && (
													<span
														style={{
															flexShrink: 0,
															fontSize: theme.fontSizes[0],
															fontWeight: 600,
															textTransform: "uppercase",
															letterSpacing: 0.3,
															color: theme.colors.primary,
															border: `1px solid ${theme.colors.primary}55`,
															borderRadius: 999,
															padding: "0 6px",
														}}
													>
														root
													</span>
												)}
												<span style={{ flex: 1 }} />
												{pkg.packageManager && (
													<span
														style={{ color: muted, fontSize: theme.fontSizes[0] }}
													>
														{pkg.packageManager}
													</span>
												)}
												{pkg.version && (
													<span
														style={{ color: muted, fontSize: theme.fontSizes[0] }}
													>
														v{pkg.version}
													</span>
												)}
												<span style={{ color: muted, fontSize: theme.fontSizes[0] }}>
													{pkg.constructs.length}
												</span>
											</div>
										)}
										{pkg.constructs.map((c) => {
											const active = selected?.repoKey === c.repoKey && selected?.id === c.id;
											return (
												<button
													key={c.id}
													type="button"
													onClick={() => { setSelected(c); setTimelineOpen(false); }}
													style={{
														display: "flex",
														flexDirection: "column",
														gap: 4,
														alignItems: "flex-start",
														textAlign: "left",
														width: "100%",
														border: "none",
														borderBottom: `1px solid ${theme.colors.border ?? "#333"}22`,
														background: active
															? `${theme.colors.primary}14`
															: "transparent",
														color: theme.colors.text,
														padding: "9px 14px",
														cursor: "pointer",
														fontFamily: theme.fonts.body,
													}}
												>
													<div
														style={{
															display: "flex",
															alignItems: "center",
															gap: 8,
															width: "100%",
														}}
													>
														<span
															style={{
																flex: 1,
																minWidth: 0,
																fontSize: theme.fontSizes[2],
																fontWeight: 500,
																whiteSpace: "nowrap",
																overflow: "hidden",
																textOverflow: "ellipsis",
															}}
														>
															{c.name}
														</span>
													</div>
													<span
														style={{
															fontSize: theme.fontSizes[1],
															fontFamily: theme.fonts.monospace,
															color: muted,
															whiteSpace: "nowrap",
															overflow: "hidden",
															textOverflow: "ellipsis",
															maxWidth: "100%",
														}}
														title={c.verification.evidence}
													>
														{c.packageRelativeFile}:{c.span ? `${c.span.startLine}–${c.span.endLine}` : c.graphStartLine}
													</span>
													<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
														{c.verification.status === "verified" ? "Source verified" : c.verification.status}
														{c.models.length ? ` · ${c.models.length} model association${c.models.length === 1 ? "" : "s"}` : ""}
													</span>
												</button>
											);
										})}
									</div>
								))}
							</div>
						</>
					)}
				/>
			</div>

			<div
				onMouseDown={onPanelResizeStart}
				aria-label="Resize constructs sidebar"
				title="Drag to resize"
				style={{
					width: 3,
					flexShrink: 0,
					cursor: "col-resize",
					background: theme.colors.border,
					transition: "background 120ms ease",
					zIndex: 1,
				}}
			/>

			{/* Right pane: the cumulative timeline, or the selected construct's span */}
			{timelineOpen ? (
				<ConstructTimelinePanel timeline={timeline} onClose={() => setTimelineOpen(false)} />
			) : (
				<SpanPane
					key={selected ? JSON.stringify([
						selected.purl, selected.id, selected.span, selected.verification,
					]) : "none"}
					construct={selected}
				/>
			)}
		</main>
	);
}
