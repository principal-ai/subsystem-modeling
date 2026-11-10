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

import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	ArchitectureMapHighlightLayers,
	type CityData,
	type HighlightLayer,
} from "@principal-ai/file-city-react";
import { FolderGit2, LayoutDashboard, X } from "lucide-react";

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
	models: readonly SubsystemCoverageModel[];
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

/** Small header pill, matching the Sky card's action buttons. */
function HeaderAction({
	active,
	onClick,
	children,
}: {
	active?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			style={{
				flexShrink: 0,
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "4px 8px",
				borderRadius: 4,
				border: `1px solid ${active ? theme.colors.primary : (theme.colors.border ?? "#333")}`,
				background: active ? `${theme.colors.primary}1a` : "transparent",
				color: active ? theme.colors.primary : muted,
				cursor: "pointer",
				fontSize: theme.fontSizes[0],
				fontFamily: theme.fonts.body,
				lineHeight: 1.2,
				transition: "color 120ms ease, border-color 120ms ease",
			}}
		>
			{children}
		</button>
	);
}

export interface SubsystemCoverageMapCardProps {
	repo: SubsystemCoverageRepo;
	/** Stable model-id → layer color, so a multi-repo model keeps its color. */
	modelColors?: ReadonlyMap<string, string>;
	/** The host's focused repo, highlighted with the primary border. */
	selected?: boolean;
	/** Focus / open this repo. */
	onSelectRepo?: () => void;
	/** Open a model in its own tab. */
	onOpenModel?: (modelId: string) => void;
	/** Open a file clicked on the map. */
	onOpenFile?: (file: { repoKey: string; displayPath: string }) => void;
	/** Start with the Models legend open (Storybook / docs). */
	defaultModelsOpen?: boolean;
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
	onOpenModel,
	onOpenFile,
	defaultModelsOpen = false,
}: SubsystemCoverageMapCardProps) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const [modelsOpen, setModelsOpen] = useState(defaultModelsOpen);
	const [nameHovered, setNameHovered] = useState(false);
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
	const cityPaths = useMemo(
		() =>
			new Set(
				(repo.cityData?.buildings ?? []).map((building) =>
					normalizeCoveragePath(building.path),
				),
			),
		[repo.cityData],
	);
	const layers = useMemo(() => coverageLayers(coloredModels), [coloredModels]);
	const colorFor = (model: SubsystemCoverageModel) => model.color!;

	return (
		<div
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
			}}
		>
			<div style={{ flexShrink: 0, padding: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<button
						type="button"
						onClick={onSelectRepo}
						disabled={!onSelectRepo}
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
							cursor: onSelectRepo ? "pointer" : "default",
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
					</button>

					<div style={{ flex: 1, minWidth: 0 }}>
						<button
							type="button"
							onClick={onSelectRepo}
							disabled={!onSelectRepo}
							onMouseEnter={() => setNameHovered(true)}
							onMouseLeave={() => setNameHovered(false)}
							style={{
								display: "block",
								width: "100%",
								padding: 0,
								border: "none",
								background: "transparent",
								textAlign: "left",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								fontFamily: theme.fonts.heading ?? theme.fonts.body,
								fontSize: theme.fontSizes[2],
								fontWeight: 600,
								lineHeight: "20px",
								color:
									onSelectRepo && nameHovered
										? theme.colors.primary
										: theme.colors.text,
								cursor: onSelectRepo ? "pointer" : "default",
								transition: "color 120ms ease",
							}}
						>
							{repo.name}
						</button>
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
							<span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
								<LayoutDashboard size={11} aria-hidden="true" />
								{repo.models.length} model{repo.models.length === 1 ? "" : "s"}
							</span>
							<span aria-hidden="true">·</span>
							{repo.cityData ? (
								<span
									title={`${coverage.referenced} of ${coverage.total} files covered by subsystem models`}
									style={{ color: theme.colors.text }}
								>
									{coverage.percent}% covered
								</span>
							) : (
								<span>loading city…</span>
							)}
						</div>
					</div>

					<HeaderAction
						active={modelsOpen}
						onClick={() => setModelsOpen((open) => !open)}
					>
						Models
					</HeaderAction>
				</div>

				{/* Coverage bar: filled share of the repo the models reference. */}
				{repo.cityData && (
					<div
						style={{
							marginTop: 7,
							height: 3,
							borderRadius: 2,
							overflow: "hidden",
							background: border,
						}}
						title={`${coverage.referenced} of ${coverage.total} files covered`}
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
				{repo.cityData ? (
					<ArchitectureMapHighlightLayers
						cityData={repo.cityData}
						highlightLayers={layers}
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

				{modelsOpen && (
					<div
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 2,
							display: "flex",
							flexDirection: "column",
							background: theme.colors.background,
						}}
					>
						<div
							style={{
								flexShrink: 0,
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: "6px 8px",
								borderBottom: `1px solid ${border}`,
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.monospace,
								color: muted,
							}}
						>
							<span style={{ color: theme.colors.text }}>
								{repo.models.length} model{repo.models.length === 1 ? "" : "s"}
							</span>
							<span>· color = coverage layer</span>
							<button
								type="button"
								onClick={() => setModelsOpen(false)}
								aria-label="Close models list"
								style={{
									marginLeft: "auto",
									padding: 2,
									border: "none",
									background: "transparent",
									color: muted,
									cursor: "pointer",
									display: "inline-flex",
								}}
							>
								<X size={12} />
							</button>
						</div>
						<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
							{coloredModels.map((model) => {
								const color = colorFor(model);
								const covered = new Set(
									model.files
										.map(normalizeCoveragePath)
										.filter((path) => cityPaths.has(path)),
								).size;
								return (
									<button
										key={model.id}
										type="button"
										onClick={() => onOpenModel?.(model.id)}
										disabled={!onOpenModel}
										title={`Open ${model.title}`}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											width: "100%",
											padding: "7px 10px",
											border: "none",
											borderBottom: `1px solid ${border}`,
											background: "transparent",
											color: theme.colors.text,
											cursor: onOpenModel ? "pointer" : "default",
											textAlign: "left",
											fontFamily: theme.fonts.body,
											fontSize: theme.fontSizes[1],
										}}
									>
										<span
											aria-hidden="true"
											title={
												covered === 0
													? "No anchored files in this checkout"
													: undefined
											}
											style={{
												flexShrink: 0,
												width: 9,
												height: 9,
												borderRadius: 999,
												background: color,
												opacity: covered === 0 ? 0.35 : 1,
												boxShadow: covered === 0 ? "none" : `0 0 6px ${color}`,
											}}
										/>
										<span
											style={{
												flex: 1,
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{model.title}
										</span>
										<span
											style={{
												flexShrink: 0,
												fontFamily: theme.fonts.monospace,
												fontSize: theme.fontSizes[0],
												color: muted,
											}}
										>
											{covered} file{covered === 1 ? "" : "s"}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export interface SubsystemCoverageMapCardsProps {
	repos: readonly SubsystemCoverageRepo[];
	/** The host's focused repo key (`SubsystemReposMap`'s `selectedRepoKey`). */
	selectedRepoKey?: string | null;
	/** Focus a repo (pan the map / open its models). */
	onSelectRepo?: (repoKey: string) => void;
	/** Open a model in its own tab. */
	onOpenModel?: (modelId: string) => void;
	/** Open a file clicked on a card's map. */
	onOpenFile?: (file: { repoKey: string; displayPath: string }) => void;
	/** Minimum card width before the grid adds another column. */
	minColumnWidth?: number;
}

/**
 * The card grid: flat, like In Progress — each card already carries its own
 * repo identity, so there are no owner group headings.
 */
export function SubsystemCoverageMapCards({
	repos,
	selectedRepoKey,
	onSelectRepo,
	onOpenModel,
	onOpenFile,
	minColumnWidth = 300,
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
						No repo cities to map
					</div>
					<div style={{ fontSize: theme.fontSizes[1] }}>
						Repos referenced by subsystem models will appear here, with their
						covered files lit on the map.
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
				aria-label="Subsystem coverage maps"
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
							selected={selectedRepoKey === repo.repoKey}
							onSelectRepo={
								onSelectRepo ? () => onSelectRepo(repo.repoKey) : undefined
							}
							onOpenModel={onOpenModel}
							onOpenFile={onOpenFile}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
