/**
 * SubsystemCoverageMapCards — the Map view's repo cards.
 *
 * Mirrors the Sky view's "In Progress" grid: each repo is one square card with
 * its File City map in the body. The difference is what the highlight layers
 * mean. In Progress lights dirty working-tree files (added / modified /
 * removed); here each subsystem model gets a layer in its own color, lighting
 * the files that model anchors in this repo. Uncovered buildings fall back to
 * the muted base city, so coverage reads at a glance.
 *
 * The header keeps the Sky card anatomy — avatar tile, repo name, a small
 * action pill — and swaps branch / ahead / behind for `N models · X% covered`.
 * The "Models" pill opens the legend: one colored row per model, doubling as
 * the map's layer key and the way into that model's tab.
 *
 * Presentational and host-free: the city data and model file sets come from
 * the caller, so the grid can be reviewed in Storybook before it replaces (or
 * sits beside) the File City canvas in `SubsystemReposMap`.
 */

import { useMemo, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	ArchitectureMapHighlightLayers,
	type CityData,
	type HighlightLayer,
} from "@principal-ai/file-city-react";
import { FolderGit2, LayoutDashboard } from "lucide-react";

/** Layer colors in assignment order — distinct glows on the dark city base. */
export const MODEL_LAYER_COLORS = [
	"#3b82f6",
	"#a855f7",
	"#22c55e",
	"#f59e0b",
	"#ec4899",
	"#06b6d4",
	"#84cc16",
	"#ef4444",
];

/** One model's coverage inside a repo. */
export interface SubsystemCoverageModel {
	id: string;
	title: string;
	/**
	 * Repo-relative paths this model anchors in this repo (component files and
	 * trail step/file sites). Paths outside the checkout are ignored.
	 */
	files: readonly string[];
	/** Override the palette color; the grid assigns one by index otherwise. */
	color?: string;
}

/** One repo card: its city and the models that reference it. */
export interface SubsystemCoverageRepo {
	/** purl repo key (`pkg:github/owner/name`). */
	repoKey: string;
	/** `owner/name` — the card title. */
	label: string;
	name: string;
	avatarUrl?: string;
	/** The repo checkout laid out as a city; `null` while it loads. */
	cityData: CityData | null;
	/** Why the repo city could not be loaded. */
	error?: string;
	/** True while a retry request is in flight. */
	retrying?: boolean;
	models: readonly SubsystemCoverageModel[];
	/** Optional copy overrides when layers represent something besides models. */
	layerSingular?: string;
	layerPlural?: string;
	coverageVerb?: string;
	coverageTitle?: string;
}

/** Strip `./` / leading `/` so anchored paths match city building paths. */
export function normalizeCoveragePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

export interface RepoCoverage {
	/** Rounded 0–100. */
	percent: number;
	/** Distinct anchored files that exist in the city. */
	referenced: number;
	/** Total files in the city. */
	total: number;
}

/**
 * Share of the repo's files covered by at least one model layer. Overlaps
 * count once, and paths missing from the checkout are ignored.
 */
export function coverageForRepo(
	cityData: CityData | null,
	models: readonly SubsystemCoverageModel[],
): RepoCoverage {
	const all = new Set(
		(cityData?.buildings ?? []).map((building) =>
			normalizeCoveragePath(building.path),
		),
	);
	const covered = new Set<string>();
	for (const model of models) {
		for (const file of model.files) {
			const path = normalizeCoveragePath(file);
			if (path && all.has(path)) covered.add(path);
		}
	}
	const referenced = covered.size;
	const total = all.size;
	return {
		percent: total === 0 ? 0 : Math.round((referenced / total) * 100),
		referenced,
		total,
	};
}

/** One glow layer per model, in the model's assigned color. */
export function coverageLayers(
	models: readonly SubsystemCoverageModel[],
): HighlightLayer[] {	return models
		.map((model, index) => ({
			id: model.id,
			name: model.title,
			enabled: true,
			color: model.color ?? MODEL_LAYER_COLORS[index % MODEL_LAYER_COLORS.length]!,
			opacity: 0.85,
			// In the layered 2D renderer, lower priority draws later (on top).
			// Staying below the file-type layers (which start at 1) is what makes
			// coverage win over the suffix colouring; -index keeps model order.
			priority: -index,
			items: model.files
				.map((file) => normalizeCoveragePath(file))
				.filter(Boolean)
				.map((path) => ({
					path,
					type: "file" as const,
					renderStrategy: "fill" as const,
				})),
		}))
		.filter((layer) => layer.items.length > 0);
}

/**
 * One stable color per model id across every repo, so a model spanning two
 * checkouts keeps the same layer color in both cards.
 */
export function collectModelColors(
	repos: readonly SubsystemCoverageRepo[],
): Map<string, string> {
	const colors = new Map<string, string>();
	for (const repo of repos) {
		for (const model of repo.models) {
			if (colors.has(model.id)) continue;
			colors.set(
				model.id,
				model.color ??
					MODEL_LAYER_COLORS[colors.size % MODEL_LAYER_COLORS.length]!,
			);
		}
	}
	return colors;
}

export interface SubsystemCoverageMapCardProps {
	repo: SubsystemCoverageRepo;
	/** Stable model-id → layer color, so a multi-repo model keeps its color. */
	modelColors?: ReadonlyMap<string, string>;
	/** The host's focused repo, highlighted with the primary border. */
	selected?: boolean;
	/** Report card hover so the host can tint this repo's models elsewhere. */
	onHoverRepo?: (repoKey: string | null) => void;
	/** Model hovered via the list — show only its layer. */
	hoveredModelId?: string | null;
	/** Focus / open this repo. */
	onSelectRepo?: () => void;
	/** Open a file clicked on the map. */
	onOpenFile?: (file: { repoKey: string; displayPath: string }) => void;
	/** Retry loading a failed repo city. */
	onRetry?: () => void;
}

/**
 * One repo card: square like the In Progress cards, with the city filling the
 * body under a compact header.
 */
export function SubsystemCoverageMapCard({
	repo,
	modelColors,
	selected = false,
	onSelectRepo,
	onOpenFile,
	onHoverRepo,
	hoveredModelId,
	onRetry,
}: SubsystemCoverageMapCardProps) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const [cardHovered, setCardHovered] = useState(false);
	const [avatarBroken, setAvatarBroken] = useState(false);

	const coloredModels = useMemo(
		() =>
			repo.models.map((model, index) => ({
				...model,
				color:
					model.color ??
					modelColors?.get(model.id) ??
					MODEL_LAYER_COLORS[index % MODEL_LAYER_COLORS.length]!,
			})),
		[repo.models, modelColors],
	);
	const coverage = useMemo(
		() => coverageForRepo(repo.cityData, coloredModels),
		[repo.cityData, coloredModels],
	);
	const layerSingular = repo.layerSingular ?? "model";
	const layerPlural = repo.layerPlural ?? `${layerSingular}s`;
	const coverageVerb = repo.coverageVerb ?? "covered";
	const coverageTitle =
		repo.coverageTitle ??
		`${coverage.referenced} of ${coverage.total} files covered by subsystem models`;
	const layers = useMemo(() => coverageLayers(coloredModels), [coloredModels]);
	/** The hovered model has a layer in this repo — isolate it. Otherwise
		keep every layer and dim the card instead. */
	const hoveredPresent =
		hoveredModelId != null && layers.some((l) => l.id === hoveredModelId);
	const displayLayers = useMemo(
		() =>
			layers.map((layer) => ({
				// Isolate the hovered model where it lives; everywhere else the
				// composite stays exactly as it is.
				...layer,
				enabled:
					hoveredModelId == null || !hoveredPresent || layer.id === hoveredModelId,
			})),
		[layers, hoveredModelId, hoveredPresent],
	);

	return (
		<div
			role={onSelectRepo ? "checkbox" : undefined}
			aria-checked={onSelectRepo ? selected : undefined}
			aria-label={onSelectRepo ? repo.label : undefined}
			tabIndex={onSelectRepo ? 0 : undefined}
			onClick={() => onSelectRepo?.()}
			onMouseEnter={() => {
				setCardHovered(true);
				onHoverRepo?.(repo.repoKey);
			}}
			onMouseLeave={() => {
				setCardHovered(false);
				onHoverRepo?.(null);
			}}
			onKeyDown={(e) => {
				if (!onSelectRepo || e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelectRepo();
				}
			}}
			style={{
				position: "relative",
				width: "100%",
				aspectRatio: "1 / 1",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				borderRadius: 8,
				border: `1px solid ${selected ? theme.colors.primary : border}`,
				background: theme.colors.surface ?? theme.colors.backgroundSecondary,
				cursor: onSelectRepo ? "pointer" : "default",
			}}
		>
			<div style={{ flexShrink: 0, padding: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<div
						title={repo.label}
						style={{
							flexShrink: 0,
							width: 40,
							height: 40,
							padding: 0,
							borderRadius: 8,
							border: `1px solid ${border}`,
							background: theme.colors.background,
							overflow: "hidden",
						}}
					>
						{repo.avatarUrl && !avatarBroken ? (
							<img
								src={repo.avatarUrl}
								alt=""
								width={40}
								height={40}
								style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
								onError={() => setAvatarBroken(true)}
							/>
						) : (
							<FolderGit2 size={20} color={muted} />
						)}
					</div>

					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								display: "block",
								width: "100%",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								fontFamily: theme.fonts.heading ?? theme.fonts.body,
								fontSize: theme.fontSizes[2],
								fontWeight: 600,
								lineHeight: "20px",
								color:
									(onSelectRepo && cardHovered) || hoveredPresent
										? theme.colors.primary
										: theme.colors.text,
								transition: "color 120ms ease",
							}}
						>
							{repo.name}
						</div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								flexWrap: "wrap",
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[0],
								lineHeight: "18px",
								color: muted,
							}}
						>
							{repo.error ? (
								<span
									title={repo.error}
									style={{ color: theme.colors.error ?? "#e5534b" }}
								>
									city unavailable
								</span>
							) : repo.cityData ? (
								<span
									title={coverageTitle}
									style={{ color: theme.colors.text }}
								>
									{coverage.percent}% {coverageVerb}
								</span>
							) : (
								<span>loading city…</span>
							)}
							<span aria-hidden="true">·</span>
							<span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
								<LayoutDashboard size={11} aria-hidden="true" />
								{repo.models.length} {repo.models.length === 1 ? layerSingular : layerPlural}
							</span>
						</div>
					</div>
				</div>

				{/* Coverage bar: share of repo files represented by these layers. */}
				{repo.cityData && (
					<div
						style={{
							marginTop: 7,
							height: 3,
							borderRadius: 2,
							overflow: "hidden",
							background: border,
						}}
						title={coverageTitle}
					>
						<div
							style={{
								width: `${coverage.percent}%`,
								height: "100%",
								background: theme.colors.primary,
							}}
						/>
					</div>
				)}
			</div>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					position: "relative",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					overflow: "hidden",
					background: theme.colors.background,
					borderTop: `1px solid ${border}`,
				}}
			>
				{repo.error ? (
					<div
						role="alert"
						style={{
							maxWidth: "90%",
							padding: 16,
							textAlign: "center",
							fontSize: theme.fontSizes[0],
							lineHeight: 1.5,
							color: theme.colors.error ?? "#e5534b",
							overflowWrap: "anywhere",
						}}
					>
						<FolderGit2 size={30} style={{ opacity: 0.6 }} />
						<div style={{ fontWeight: 600 }}>Could not load repo city</div>
						<div>{repo.error}</div>
						{onRetry && (
							<button
								type="button"
								disabled={repo.retrying}
								onClick={(event) => {
									event.stopPropagation();
									onRetry();
								}}
								style={{
									marginTop: 8,
									padding: "5px 12px",
									borderRadius: 6,
									border: `1px solid ${border}`,
									background: theme.colors.surface ?? theme.colors.background,
									color: theme.colors.text,
									font: "inherit",
									cursor: repo.retrying ? "default" : "pointer",
									opacity: repo.retrying ? 0.65 : 1,
								}}
							>
								{repo.retrying ? "Retrying…" : "Retry"}
							</button>
						)}
					</div>
				) : repo.cityData ? (
					<ArchitectureMapHighlightLayers
						cityData={repo.cityData}
						highlightLayers={displayLayers}
						fullSize
						showFileNames={false}
						showFileTypeIcons={false}
						enableHover={false}
						isolationMode="collapse"
						dimOpacity={0.25}
						canvasBackgroundColor={theme.colors.background}
						maxCanvasSize={1024}
						onBuildingClick={
							onOpenFile
								? (building) =>
										onOpenFile({
											repoKey: repo.repoKey,
											displayPath: building.path,
										})
								: undefined
						}
					/>
				) : (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 8,
							color: muted,
							fontSize: theme.fontSizes[0],
						}}
					>
						<FolderGit2 size={30} style={{ opacity: 0.5 }} />
						Building city…
					</div>
				)}

			</div>
		</div>
	);
}

export interface SubsystemCoverageMapCardsProps {
	repos: readonly SubsystemCoverageRepo[];
	/** Repos currently filtering the list (`SubsystemReposMap`'s `selectedRepoKeys`). */
	selectedRepoKeys?: ReadonlySet<string>;
	/** Report card hover (repo key, or null on leave). */
	onHoverRepo?: (repoKey: string | null) => void;
	/** Model hovered via the list — isolate its layer. */
	hoveredModelId?: string | null;
	/** Focus a repo (pan the map / open its models). */
	onSelectRepo?: (repoKey: string) => void;
	/** Open a file clicked on a card's map. */
	onOpenFile?: (file: { repoKey: string; displayPath: string }) => void;
	/** Retry a failed repo city by repo key. */
	onRetryRepo?: (repoKey: string) => void;
	/** Minimum card width before the grid adds another column. */
	minColumnWidth?: number;
	/** Accessible label for this map grid. */
	listLabel?: string;
	/** Empty-state copy for non-subsystem uses of these cards. */
	emptyTitle?: string;
	emptyDetail?: string;
}

/**
 * The card grid: flat, like In Progress — each card already carries its own
 * repo identity, so there are no owner group headings.
 */
export function SubsystemCoverageMapCards({
	repos,
	selectedRepoKeys,
	onSelectRepo,
	onOpenFile,
	onRetryRepo,
	onHoverRepo,
	hoveredModelId,
	minColumnWidth = 300,
	listLabel = "Subsystem coverage maps",
	emptyTitle = "No repo cities to map",
	emptyDetail = "Repos referenced by subsystem models will appear here, with their covered files lit on the map.",
}: SubsystemCoverageMapCardsProps) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const modelColors = useMemo(() => collectModelColors(repos), [repos]);

	if (repos.length === 0) {
		return (
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 24,
					textAlign: "center",
					color: muted,
					fontFamily: theme.fonts.body,
				}}
			>
				<div style={{ maxWidth: 420 }}>
					<div
						style={{
							fontSize: theme.fontSizes[3],
							color: theme.colors.text,
							marginBottom: 6,
						}}
					>
						{emptyTitle}
					</div>
					<div style={{ fontSize: theme.fontSizes[1] }}>
						{emptyDetail}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				minWidth: 0,
				overflowY: "auto",
				padding: 16,
				background: theme.colors.background,
			}}
		>
			<div
				role="list"
				aria-label={listLabel}
				style={{
					display: "grid",
					gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
					gap: 16,
					alignItems: "start",
				}}
			>
				{repos.map((repo) => (
					<div key={repo.repoKey} role="listitem">
						<SubsystemCoverageMapCard
							repo={repo}
							modelColors={modelColors}
							selected={selectedRepoKeys?.has(repo.repoKey) ?? false}
							onHoverRepo={onHoverRepo}
							hoveredModelId={hoveredModelId}
							onSelectRepo={
								onSelectRepo ? () => onSelectRepo(repo.repoKey) : undefined
							}
							onOpenFile={onOpenFile}
							onRetry={onRetryRepo ? () => onRetryRepo(repo.repoKey) : undefined}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
