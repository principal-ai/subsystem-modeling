/**
 * ConstructsSearchList — a searchable list of a graph's constructs.
 *
 * Feeds the constructs catalog's search: every construct in a graphify graph as
 * a filterable row (name, construct badge, file:line). Search matches name, file
 * and construct; construct chips narrow by kind. Rows the graph carries no
 * declaration detail for are inert — they neither expand nor imply a missing
 * feature. Kept presentational so the catalog can own the surrounding chrome.
 */

import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type CSSProperties,
	type ReactNode,
} from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { LayoutDashboard, Search, X } from 'lucide-react';
import {
	constructColorsFromPierreTheme,
	resolvePierreSyntaxThemeName,
	type GraphifyComponentDetail,
	type InferredGraphifyConstruct,
} from '@principal-ai/subsystems-react';

/** An inferred construct, or `unknown` when the graph couldn't say. */
export type DeclarationKind = InferredGraphifyConstruct;

/** One row in the search list — a single declaration from a graph. */
export interface DeclarationSearchItem {
	/** Stable graph node id. */
	id: string;
	/** Display name (graph node label). */
	name: string;
	/** Inferred construct, or `unknown`. */
	construct: DeclarationKind;
	/** Repo-relative source file. */
	file: string;
	/** 1-based line from `source_location`, when the graph had one. */
	line?: number | null;
	/** Repo identity the declaration lives in. */
	purl?: string;
	/** Symbol without call parens or the method `.` sigil, for declaration panels. */
	symbol?: string;
	/** Rebuilt declaration detail, so a row can drill into the full signature. */
	declaration?: GraphifyComponentDetail;
	/**
	 * Future decoration: how many subsystem models this declaration is part of.
	 * Rendered as a trailing pill when present.
	 */
	modelCount?: number;
}

export interface ConstructsSearchListProps {
	items: DeclarationSearchItem[];
	title?: string;
	placeholder?: string;
	emptyMessage?: string;
	/** Cap rendered rows (keeps large graphs responsive). Default 250. */
	maxResults?: number;
	/** Query the list starts with. */
	initialQuery?: string;
	/** Start with rows `canExpand` rejects hidden. */
	initialExpandableOnly?: boolean;
	onSelect?: (item: DeclarationSearchItem) => void;
	/** Trailing slot per row; overrides the built-in `modelCount` pill. */
	renderTrailing?: (item: DeclarationSearchItem) => ReactNode;
	/**
	 * When provided, rows become expandable: clicking one toggles this content
	 * inline beneath it (the full declaration panel).
	 */
	renderExpanded?: (item: DeclarationSearchItem) => ReactNode;
	/**
	 * Per-row gate on `renderExpanded`. Return false for declarations the graph
	 * carries no detail for — those rows render inert (no pointer, dimmed, and
	 * titled with `noExpansionHint`) instead of expanding to an empty panel.
	 * Defaults to every row being expandable.
	 */
	canExpand?: (item: DeclarationSearchItem) => boolean;
	/** Hover text for rows `canExpand` rejects. */
	noExpansionHint?: string;
	/** Label for the chip that hides rows `canExpand` rejects. Only rendered when
	 * both `renderExpanded` and `canExpand` are set. Default `has declaration`. */
	expandableOnlyLabel?: string;
	/**
	 * Construct filter order, most specific first — specificity, not volume, so
	 * the rare `class` chip doesn't sink below the `other` bucket. Kinds missing
	 * from the list sort after the listed ones, by count. Default
	 * `['class', 'method', 'function', 'type', 'module', 'unknown']`.
	 */
	constructOrder?: string[];
}

const KIND_LABEL: Record<string, string> = {
	class: 'class',
	function: 'function',
	method: 'method',
	type: 'type',
	module: 'module',
	unknown: 'other',
};

function kindLabel(kind: string): string {
	return KIND_LABEL[kind] ?? kind;
}

/** Filter chips name a set, so they read plural; row badges stay singular. */
const KIND_PLURAL: Record<string, string> = {
	class: 'classes',
	method: 'methods',
	function: 'functions',
	type: 'types',
	module: 'modules',
	unknown: 'other',
};

function chipLabel(kind: string): string {
	return KIND_PLURAL[kind] ?? `${kindLabel(kind)}s`;
}

/** Most specific first: class → method → function → type → module → other. */
const DEFAULT_CONSTRUCT_ORDER = [
	'class',
	'method',
	'function',
	'type',
	'module',
	'unknown',
];

/**
 * Order construct chips by specificity rather than volume, so the 29 `class`
 * rows stay ahead of the 1,351 `other` ones. Unlisted kinds trail the order,
 * ranked by count.
 */
function orderConstructs(
	entries: [string, number][],
	order: readonly string[],
): [string, number][] {
	const rank = (kind: string) => {
		const at = order.indexOf(kind);
		return at < 0 ? order.length : at;
	};
	return [...entries].sort(
		(a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1],
	);
}

function matchRange(text: string, query: string): [number, number] | null {
	if (!query) return null;
	const at = text.toLowerCase().indexOf(query.toLowerCase());
	return at < 0 ? null : [at, at + query.length];
}

function Highlighted({ text, query }: { text: string; query: string }) {
	const range = matchRange(text, query);
	if (!range) return <>{text}</>;
	const [start, end] = range;
	return (
		<>
			{text.slice(0, start)}
			<mark
				style={{
					background: 'transparent',
					color: 'inherit',
					fontWeight: 700,
					textDecoration: 'underline',
					textUnderlineOffset: 2,
				}}
			>
				{text.slice(start, end)}
			</mark>
			{text.slice(end)}
		</>
	);
}

const Row = memo(function Row({
	item,
	query,
	active,
	color,
	muted,
	theme,
	onSelect,
	onHover,
	renderTrailing,
	expandable,
	canExpand,
	noExpansionHint,
	expanded,
	onToggle,
	expandedContent,
}: {
	item: DeclarationSearchItem;
	query: string;
	active: boolean;
	color: string;
	muted: string;
	theme: ReturnType<typeof useTheme>['theme'];
	onSelect?: (item: DeclarationSearchItem) => void;
	onHover: (id: string | null) => void;
	renderTrailing?: (item: DeclarationSearchItem) => ReactNode;
	expandable: boolean;
	canExpand?: (item: DeclarationSearchItem) => boolean;
	noExpansionHint?: string;
	expanded: boolean;
	onToggle: (item: DeclarationSearchItem) => void;
	expandedContent?: ReactNode;
}) {
	const location =
		item.line != null ? `${item.file}:${item.line}` : item.file;
	// A row the consumer can't render detail for is inert, not a dead click.
	const rowExpandable = expandable && (canExpand ? canExpand(item) : true);
	const interactive = Boolean(onSelect) || rowExpandable;
	return (
		<li role="presentation">
			<button
				type="button"
				role="option"
				aria-selected={active}
				aria-expanded={rowExpandable ? expanded : undefined}
				title={rowExpandable ? location : noExpansionHint ?? location}
				data-testid={`declaration-row-${item.id}`}
				onClick={() => {
					if (rowExpandable) onToggle(item);
					onSelect?.(item);
				}}
				onMouseEnter={() => onHover(item.id)}
				onMouseLeave={() => onHover(null)}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					width: '100%',
					padding: '7px 12px',
					border: 'none',
					borderLeft: `2px solid ${expanded ? color : 'transparent'}`,
					borderRadius: 6,
					background: active ? theme.colors.border : 'transparent',
					opacity: rowExpandable ? 1 : 0.5,
					textAlign: 'left',
					cursor: interactive ? 'pointer' : 'default',
					transition: 'background 80ms ease',
				}}
			>
				<span
					style={{
						flexShrink: 0,
						minWidth: 66,
						textAlign: 'center',
						padding: '1px 6px',
						borderRadius: 4,
						border: `1px solid ${color}55`,
						background: `${color}1a`,
						color,
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0] * 0.82,
						letterSpacing: 0.4,
						textTransform: 'uppercase',
					}}
				>
					{kindLabel(item.construct)}
				</span>
				<span
					style={{
						flex: 1,
						minWidth: 0,
						display: 'flex',
						flexDirection: 'column',
						gap: 1,
					}}
				>
					<span
						style={{
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[1],
							color: theme.colors.text,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						<Highlighted text={item.name} query={query} />
					</span>
					<span
						title={location}
						style={{
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[0] * 0.9,
							color: muted,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						<Highlighted text={location} query={query} />
					</span>
				</span>
				{renderTrailing ? (
					renderTrailing(item)
				) : item.modelCount != null ? (
					<span
						title={`In ${item.modelCount} subsystem model${item.modelCount === 1 ? '' : 's'}`}
						style={{
							flexShrink: 0,
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '1px 7px',
							borderRadius: 4,
							border: `1px solid ${theme.colors.border}`,
							color: muted,
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[0] * 0.82,
						}}
					>
					<LayoutDashboard size={11} />
					{item.modelCount}
				</span>
			) : null}
			</button>
			{expanded && expandedContent != null ? (
				<div
					data-testid={`declaration-detail-${item.id}`}
					style={{
						padding: '4px 12px 12px 16px',
					}}
				>
					{expandedContent}
				</div>
			) : null}
		</li>
	);
});

export function ConstructsSearchList({
	items,
	title,
	placeholder = 'Search declarations…',
	emptyMessage = 'No declarations match.',
	maxResults = 250,
	initialQuery = '',
	initialExpandableOnly = false,
	onSelect,
	renderTrailing,
	renderExpanded,
	canExpand,
	noExpansionHint,
	expandableOnlyLabel = 'has declaration',
	constructOrder = DEFAULT_CONSTRUCT_ORDER,
}: ConstructsSearchListProps) {
	const { theme, mode } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const palette = constructColorsFromPierreTheme(resolvePierreSyntaxThemeName(mode));
	const colorFor = useCallback(
		(kind: string): string => {
			if (kind === 'class') return palette.class;
			if (kind === 'function') return palette.function;
			if (kind === 'method') return palette.method;
			if (kind === 'type') return palette.interface;
			return muted;
		},
		[palette, muted],
	);

	const [query, setQuery] = useState(initialQuery);
	const [kindFilter, setKindFilter] = useState<string | null>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [expandableOnly, setExpandableOnly] = useState(initialExpandableOnly);

	const expandable = Boolean(renderExpanded);
	const filterable = expandable && Boolean(canExpand);
	const toggleExpanded = useCallback((item: DeclarationSearchItem) => {
		setExpandedId((prev) => (prev === item.id ? null : item.id));
	}, []);

	const expandableCount = useMemo(
		() => (canExpand ? items.filter((item) => canExpand(item)).length : items.length),
		[items, canExpand],
	);

	const kindCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of items) {
			counts.set(item.construct, (counts.get(item.construct) ?? 0) + 1);
		}
		return orderConstructs([...counts.entries()], constructOrder);
	}, [items, constructOrder]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return items.filter((item) => {
			if (kindFilter && item.construct !== kindFilter) return false;
			if (expandableOnly && canExpand && !canExpand(item)) return false;
			if (!q) return true;
			return (
				item.name.toLowerCase().includes(q) ||
				item.file.toLowerCase().includes(q) ||
				item.construct.toLowerCase().includes(q)
			);
		});
	}, [items, query, kindFilter, expandableOnly, canExpand]);

	const shown = useMemo(() => filtered.slice(0, maxResults), [filtered, maxResults]);
	const shownIds = useMemo(() => new Set(shown.map((i) => i.id)), [shown]);

	// A row that filters out of view shouldn't stay expanded.
	useEffect(() => {
		if (expandedId && shownIds.has(expandedId)) return;
		setExpandedId(null);
	}, [expandedId, shownIds]);

	useEffect(() => {
		if (focusedId && shownIds.has(focusedId)) return;
		setFocusedId(shown[0]?.id ?? null);
	}, [shown, shownIds, focusedId]);

	const moveFocus = useCallback(
		(delta: number) => {
			if (shown.length === 0) return;
			const idx = Math.max(
				0,
				shown.findIndex((i) => i.id === focusedId),
			);
			const next = shown[(idx + delta + shown.length) % shown.length];
			if (next) setFocusedId(next.id);
		},
		[shown, focusedId],
	);

	const onKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				moveFocus(1);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				moveFocus(-1);
			} else if (e.key === 'Enter') {
				const item = shown.find((i) => i.id === focusedId);
				if (item) {
					e.preventDefault();
					if (expandable && (!canExpand || canExpand(item))) {
						toggleExpanded(item);
					}
					onSelect?.(item);
				}
			} else if (e.key === 'Escape') {
				if (expandedId) {
					e.preventDefault();
					setExpandedId(null);
				} else if (query) {
					e.preventDefault();
					setQuery('');
				}
			}
		},
		[
			shown,
			focusedId,
			onSelect,
			moveFocus,
			query,
			expandable,
			canExpand,
			toggleExpanded,
			expandedId,
		],
	);

	const chip = (active: boolean): CSSProperties => ({
		padding: '2px 9px',
		borderRadius: 4,
		border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
		background: active ? theme.colors.primary : 'transparent',
		color: active ? theme.colors.background : muted,
		fontFamily: theme.fonts.monospace,
		fontSize: theme.fontSizes[0] * 0.85,
		letterSpacing: 0.3,
		cursor: 'pointer',
		whiteSpace: 'nowrap',
	});

	return (
		<div
			data-testid="constructs-search"
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
				minHeight: 0,
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					padding: '12px 16px 10px',
					borderBottom: `1px solid ${theme.colors.border}`,
				}}
			>
				{title && (
					<div
						style={{
							fontSize: theme.fontSizes[2],
							fontWeight: 600,
							fontFamily: theme.fonts.monospace,
						}}
					>
						{title}
					</div>
				)}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '6px 10px',
						borderRadius: 6,
						border: `1px solid ${theme.colors.border}`,
						background:
							theme.colors.backgroundSecondary ?? theme.colors.background,
					}}
				>
					<Search size={15} color={muted} style={{ flexShrink: 0 }} />
					<input
						autoFocus
						value={query}
						placeholder={placeholder}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKeyDown}
						style={{
							flex: 1,
							minWidth: 0,
							border: 'none',
							outline: 'none',
							background: 'transparent',
							color: theme.colors.text,
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[1],
						}}
					/>
					{query && (
						<button
							type="button"
							aria-label="Clear search"
							onClick={() => setQuery('')}
							style={{
								display: 'inline-flex',
								border: 'none',
								background: 'transparent',
								color: muted,
								cursor: 'pointer',
								padding: 0,
							}}
						>
							<X size={14} />
						</button>
					)}
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						flexWrap: 'wrap',
					}}
				>
					<button
						type="button"
						onClick={() => setKindFilter(null)}
						style={chip(kindFilter === null)}
					>
						all {items.length}
					</button>
					{kindCounts.map(([kind, count]) => (
						<button
							key={kind}
							type="button"
							onClick={() =>
								setKindFilter((prev) => (prev === kind ? null : kind))
							}
							style={chip(kindFilter === kind)}
						>
							{chipLabel(kind)} {count}
						</button>
					))}
					{filterable ? (
						<button
							type="button"
							aria-pressed={expandableOnly}
							title="Hide declarations this graph carries no detail for"
							onClick={() => setExpandableOnly((prev) => !prev)}
							style={{
								...chip(expandableOnly),
								borderStyle: expandableOnly ? 'solid' : 'dashed',
							}}
						>
							{expandableOnlyLabel} {expandableCount}
						</button>
					) : null}
					<span
						style={{
							marginLeft: 'auto',
							color: muted,
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[0] * 0.9,
						}}
					>
						{shown.length < filtered.length
							? `${shown.length} of ${filtered.length}`
							: `${filtered.length}`}{' '}
						shown
					</span>
				</div>
			</div>

			{shown.length === 0 ? (
				<div
					style={{
						padding: 24,
						color: muted,
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[1],
					}}
				>
					{emptyMessage}
				</div>
			) : (
				<ul
					role="listbox"
					aria-label="Declarations"
					style={{
						listStyle: 'none',
						margin: 0,
						padding: '6px 8px 16px',
						overflowY: 'auto',
						flex: 1,
						minHeight: 0,
					}}
				>
					{shown.map((item) => (
						<Row
							key={item.id}
							item={item}
							query={query.trim()}
							active={item.id === focusedId || item.id === hoveredId}
							color={colorFor(item.construct)}
							muted={muted}
							theme={theme}
							onSelect={onSelect}
							onHover={setHoveredId}
							renderTrailing={renderTrailing}
							expandable={expandable}
							canExpand={canExpand}
							noExpansionHint={noExpansionHint}
							expanded={item.id === expandedId}
							onToggle={toggleExpanded}
							expandedContent={
								renderExpanded && item.id === expandedId
									? renderExpanded(item)
									: undefined
							}
						/>
					))}
				</ul>
			)}
		</div>
	);
}
