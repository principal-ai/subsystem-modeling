/**
 * VerifiedConstructsView — the "Constructs" tab.
 *
 * Left rail: repos holding at least one fully verified construct. Click a repo
 * to list its verified constructs — the claims the last audit confirmed (exact
 * graphify anchor, classified construct, confirmed signature, fresh span) —
 * grouped under per-package dividers, with package-relative paths. Click a
 * construct to read *just its declaration span*, rendered as if it were its own
 * file.
 *
 * Verification state comes from persisted audits: this view never runs one. A
 * span is re-read and re-hashed on open; if it no longer matches the stored
 * hash it is shown as drifted, never as verified. Package grouping comes from
 * the cached codebase-composition slice; when there is none the list is flat
 * and paths stay repo-relative.
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
	VerifiedConstruct,
	VerifiedConstructRepo,
} from "../../shared/contract";
import { electrobun, packageLayersChangeSubscribers, subsystemModelChangeSubscribers } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";
import { ConstructComplexityControl } from "../components/ConstructComplexityControl";

const POLL_MS = 15_000;

/** Total verified constructs in a repo (sum across its package groups). */
function countRepo(repo: VerifiedConstructRepo): number {
	return repo.packages.reduce((n, p) => n + p.constructs.length, 0);
}

/** Same verified claim? Used to keep the open construct stable across polls. */
function sameConstruct(a: VerifiedConstruct, b: VerifiedConstruct): boolean {
	return (
		a.modelId === b.modelId &&
		a.alias === b.alias &&
		a.file === b.file &&
		a.purl === b.purl &&
		a.startLine === b.startLine &&
		a.endLine === b.endLine &&
		a.contentHash === b.contentHash
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
			<div style={{ padding: 16, color: "inherit", opacity: 0.5 }}>
				Loading…
			</div>
		);
	}
	return <File file={file} options={options} style={{ display: "block" }} />;
}

/** Render one construct's pinned span as a standalone file. */
function SpanPane({ construct }: { construct: VerifiedConstruct | null }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [state, setState] = useState<
		| { kind: "idle" }
		| { kind: "loading" }
		| { kind: "ready"; text: string; verified: boolean }
		| { kind: "error"; message: string }
	>({ kind: "idle" });

	useEffect(() => {
		if (!construct) {
			setState({ kind: "idle" });
			return;
		}
		let cancelled = false;
		setState({ kind: "loading" });
		(async () => {
			try {
				const res = await electrobun.rpc!.request.readSubsystemSpan({
					purl: construct.purl,
					file: construct.file,
					startLine: construct.startLine,
					endLine: construct.endLine,
					contentHash: construct.contentHash,
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

	const ext = fileExtension(construct.file);
	const fileName = `${construct.symbol ?? construct.name}${ext}`;
	const verified = state.kind === "ready" && state.verified;
	const badgeColor = verified ? "#3d9a5f" : "#e5534b";
	const badgeLabel = verified
		? "Verified"
		: state.kind === "ready"
			? "Drifted"
			: "Reading…";

	return (
		<div
			style={{
				flex: 1,
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
			}}
		>
			<div
				style={{
					flexShrink: 0,
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
						construct={construct}
						enabled={verified}
					/>
					<span
						title={
							verified
								? "Span content hash matches the verified claim"
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
							color: badgeColor,
							background: `${badgeColor}22`,
							border: `1px solid ${badgeColor}55`,
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
						{construct.file}:{construct.startLine}–{construct.endLine}
					</span>
					<span>·</span>
					<span>audited {relativeTime(Date.parse(construct.auditedAt))}</span>
				</div>
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
						key={`${construct.modelId}\0${construct.alias}\0${construct.contentHash}`}
						text={state.text}
						fileName={fileName}
						startLine={construct.startLine}
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
	const [repos, setRepos] = useState<VerifiedConstructRepo[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selectedRepoKey, setSelectedRepoKey] = useState<string | null>(null);
	const [selected, setSelected] = useState<VerifiedConstruct | null>(null);
	/** Filter over the selected repo's constructs. */
	const [query, setQuery] = useState("");
	/** Repos we've already kicked discovery for this session (avoid storms). */
	const autoEnsuredRef = useRef<Set<string>>(new Set());

	const refresh = useCallback(async () => {
		try {
			const res = await electrobun.rpc!.request.listVerifiedConstructs({});
			setRepos(res.repos);
			setError(res.ok ? null : (res.error ?? "Failed to load"));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
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

	// Package discovery runs by itself: any repo still lacking a
	// codebase-composition slice kicks an ensure, which the host runs in the
	// background and finishes via `packageLayersChanged`. A repo is asked for
	// at most once per session so a failing repo cannot storm the host.
	useEffect(() => {
		const onPush = () => void refresh();
		packageLayersChangeSubscribers.add(onPush);
		return () => {
			packageLayersChangeSubscribers.delete(onPush);
		};
	}, [refresh]);

	useEffect(() => {
		if (!repos) return;
		for (const repo of repos) {
			if (repo.hasPackageInfo) continue;
			if (autoEnsuredRef.current.has(repo.repoKey)) continue;
			autoEnsuredRef.current.add(repo.repoKey);
			void electrobun.rpc!.request
				.ensurePackageLayers({ purl: repo.repoKey })
				.then(() => void refresh())
				.catch(() => {
					/* leave it in the session set; a remount retries */
				});
		}
	}, [repos, refresh]);

	// Keep a repo selected (the first, until the user picks one).
	useEffect(() => {
		if (!repos) return;
		setSelectedRepoKey((current) =>
			current && repos.some((r) => r.repoKey === current)
				? current
				: (repos[0]?.repoKey ?? null),
		);
	}, [repos]);

	// Switching repos drops the construct selection and the search.
	useEffect(() => {
		setSelected(null);
		setQuery("");
	}, [selectedRepoKey]);

	// Reconcile the open construct against refreshed data; drop it if the
	// construct is no longer verified (or its model is gone).
	useEffect(() => {
		if (!repos) return;
		setSelected((current) => {
			if (!current) return current;
			const match = repos
				.flatMap((r) => r.packages.flatMap((p) => p.constructs))
				.find(
					(c) => c.modelId === current.modelId && c.alias === current.alias,
				);
			if (!match) return null;
			return sameConstruct(current, match) ? current : match;
		});
	}, [repos]);

	const repo = useMemo(
		() => repos?.find((r) => r.repoKey === selectedRepoKey) ?? null,
		[repos, selectedRepoKey],
	);

	// The selected repo's packages, narrowed by the search box.
	const q = query.trim().toLowerCase();
	const packages = useMemo(() => {
		if (!repo) return [];
		if (!q) return repo.packages;
		return repo.packages
			.map((pkg) => ({
				...pkg,
				constructs: pkg.constructs.filter((c) =>
					(c.symbol ?? "").toLowerCase().includes(q),
				),
			}))
			.filter((pkg) => pkg.constructs.length > 0);
	}, [repo, q]);
	const shownCount = packages.reduce((n, p) => n + p.constructs.length, 0);

	if (error && repos === null) {
		return (
			<CenteredMessage
				title="Could not load verified constructs"
				detail={error}
			/>
		);
	}
	if (repos === null) {
		return <CenteredMessage title="Loading verified constructs…" />;
	}
	if (repos.length === 0) {
		return (
			<CenteredMessage
				title="No verified constructs yet"
				detail="A construct appears here once an audit fully verifies it — an exact graphify anchor, a classified construct, a confirmed signature, and a fresh declaration span. Run an audit from the Maintainer tab."
			/>
		);
	}

	const railButton = (active: boolean): CSSProperties => ({
		display: "flex",
		flexDirection: "column",
		gap: 3,
		alignItems: "flex-start",
		textAlign: "left",
		width: "100%",
		border: "none",
		borderLeft: `2px solid ${active ? theme.colors.primary : "transparent"}`,
		background: active ? `${theme.colors.primary}14` : "transparent",
		color: active ? theme.colors.text : theme.colors.textSecondary,
		padding: "9px 12px",
		cursor: "pointer",
		fontFamily: theme.fonts.body,
	});

	return (
		<div
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
			{/* Repo rail */}
			<div
				style={{
					width: 260,
					minWidth: 200,
					borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					background: theme.colors.backgroundSecondary ?? theme.colors.background,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
				}}
			>
				<div
					style={{
						flexShrink: 0,
						padding: "8px 12px",
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						letterSpacing: 0.4,
						textTransform: "uppercase",
						color: muted,
					}}
				>
					Repos
				</div>
				<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
					{repos.map((r) => {
						const active = r.repoKey === selectedRepoKey;
						return (
							<button
								key={r.repoKey}
								type="button"
								onClick={() => setSelectedRepoKey(r.repoKey)}
								style={railButton(active)}
								title={r.repoKey}
							>
								<span
									style={{
										fontSize: theme.fontSizes[2],
										fontWeight: 500,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
										maxWidth: "100%",
									}}
								>
									{r.owner}/{r.name}
								</span>
								<span style={{ fontSize: theme.fontSizes[1], color: muted }}>
									{countRepo(r)} verified
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Construct list, grouped by package */}
			<div
				style={{
					width: 400,
					minWidth: 300,
					borderRight: `1px solid ${theme.colors.border ?? "#333"}`,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
				}}
			>
				{repo && (
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
								placeholder={`Search ${countRepo(repo)} constructs`}
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
				)}
				<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
					{q && shownCount === 0 && (
						<div
							style={{
								padding: "16px 14px",
								color: muted,
								fontSize: theme.fontSizes[1],
							}}
						>
							No constructs match “{query.trim()}”.
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
								const active =
									selected?.modelId === c.modelId &&
									selected?.alias === c.alias;
								return (
									<button
										key={`${c.modelId}\0${c.alias}`}
										type="button"
										onClick={() => setSelected(c)}
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
											title={`${c.file}:${c.startLine}–${c.endLine}`}
										>
											{c.packageRelativeFile}:{c.startLine}–{c.endLine}
										</span>
									</button>
								);
							})}
						</div>
					))}
				</div>
			</div>

			{/* Span as its own file */}
			<SpanPane
				key={selected ? JSON.stringify([
					selected.purl, selected.file, selected.startLine,
					selected.endLine, selected.contentHash,
				]) : "none"}
				construct={selected}
			/>
		</div>
	);
}
