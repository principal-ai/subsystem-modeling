/**
 * SubsystemIssueList — the diagnostics sidebar list.
 *
 * A catalogue of verification issues (audit findings), grouped by *target* so
 * every broken component / module / flow clusters together. Each
 * card is severity-colored, names its kind, states the message, and offers the
 * deterministic fix inline when one exists.
 *
 * The list is presentation-only: it owns no verification logic. Hosts map their
 * findings into `SubsystemIssue[]` and handle `onSelectIssue` / `onApplyFix`
 * (e.g. focus the node on the graph, or apply the fix in the report).
 */

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleEllipsis,
  CircleHelp,
  CircleX,
  Component,
  FileX,
  FolderGit2,
  Footprints,
  History,
  MapPin,
  Network,
  Route,
  Search,
  Server,
  Shapes,
  Sigma,
  Split,
  Wrench,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { SubsystemIssueRung } from './model';

export type SubsystemIssueSeverity = 'error' | 'info';

export type SubsystemIssueTargetKind =
  | 'component'
  | 'module'
  | 'process'
  | 'trail'
  | 'step'
  | 'repo'
  | 'graph';

/**
 * The four verification layers, in order. Mirrors the docs' progression:
 * constructs → static topology → dynamic topology → trail.
 * Static topology = package/module (containment); dynamic topology = process
 * (runtime).
 */
export type SubsystemIssueCategory =
  | 'repo'
  | 'construct'
  | 'static-topology'
  | 'dynamic-topology'
  | 'trail';

/** Layer order + display names, shared by the list and its headers. */
export const SUBSYSTEM_ISSUE_CATEGORIES: SubsystemIssueCategory[] = [
  'repo',
  'construct',
  'static-topology',
  'dynamic-topology',
  'trail',
];

/** Per-category header icon — mirrors the Maintainer tab's lane icons. */
export const SUBSYSTEM_ISSUE_CATEGORY_ICON: Record<
  SubsystemIssueCategory,
  LucideIcon
> = {
  repo: FolderGit2,
  construct: Component,
  'static-topology': Network,
  'dynamic-topology': Server,
  trail: Route,
};

export const SUBSYSTEM_ISSUE_CATEGORY_LABEL: Record<
  SubsystemIssueCategory,
  string
> = {
  repo: 'Repositories',
  construct: 'Constructs',
  'static-topology': 'Static topology',
  'dynamic-topology': 'Dynamic topology',
  trail: 'Trail',
};

/** Default `kind` → layer. Module containment is static; process nest is dynamic. */
const KIND_CATEGORY: Record<string, SubsystemIssueCategory> = {
  missing_file: 'construct',
  symbol_ambiguous: 'construct',
  symbol_unmatched: 'construct',
  stale_declaration: 'construct',
  construct_mismatch: 'construct',
  construct_unconfirmed: 'construct',
  signature_mismatch: 'construct',
  signature_unconfirmed: 'construct',
  repo_unresolved: 'repo',
  graphify_unavailable: 'repo',
  boundary_module_file_mismatch: 'static-topology',
  boundary_process_nest_disagree: 'dynamic-topology',
  // C4 process verification (verifyProcessBoundaries): a boundary whose
  // container claim is not an accepted one. `verified` reports nothing —
  // the audit reports absence only.
  boundary_process_unassigned: 'dynamic-topology',
  boundary_process_proposed: 'dynamic-topology',
  boundary_process_rejected: 'dynamic-topology',
  trail: 'trail',
  step_unconfirmed: 'trail',
  step_stale: 'trail',
};

/**
 * Verification layer for an issue. An explicit `category` wins; otherwise the
 * audit `kind` is mapped, defaulting to `construct` (the base layer).
 */
export function issueCategory(issue: SubsystemIssue): SubsystemIssueCategory {
  return issue.category ?? KIND_CATEGORY[issue.kind] ?? 'construct';
}

/**
 * Construct-layer verification rung for a finding kind (file → symbol →
 * declaration → type → signature), or null for findings outside that ladder
 * (topology / trail / repo). Drives the node overlay's earliest-rung chip.
 */
const KIND_RUNG: Record<string, SubsystemIssueRung> = {
  missing_file: 'file',
  symbol_unmatched: 'symbol',
  symbol_ambiguous: 'symbol',
  stale_declaration: 'declaration',
  construct_unconfirmed: 'type',
  construct_mismatch: 'type',
  signature_unconfirmed: 'signature',
  signature_mismatch: 'signature',
};

/** The rung a finding fails at, or null when it is not a construct finding. */
export function issueRung(kind: string): SubsystemIssueRung | null {
  return KIND_RUNG[kind] ?? null;
}

/** Order of the verification rungs; smaller = earlier (shallower) failure. */
export const ISSUE_RUNG_ORDER: Record<SubsystemIssueRung, number> = {
  file: 0,
  symbol: 1,
  declaration: 2,
  type: 3,
  signature: 4,
};

/** Rung icon shared by the node overlay chip and the issue list. */
export const ISSUE_RUNG_ICON: Record<SubsystemIssueRung, LucideIcon> = {
  file: FileX,
  symbol: Search,
  declaration: MapPin,
  type: Shapes,
  signature: Sigma,
};

/**
 * Icons for findings that are about a BOUNDARY rather than a construct, so they
 * have no rung to key off. These are what earns a frame badge: a kind listed
 * here is badged on the region node it names (see `ISSUE_KIND_ICON` consumers),
 * because the finding is a property of the region's shape — no single member
 * construct is at fault.
 */
export const ISSUE_KIND_ICON: Record<string, LucideIcon> = {
  // One module, more than one claimed process parent — a containment that can't
  // be drawn, which is why the region sits at the root instead of nested.
  boundary_process_nest_disagree: Split,
  // C4 process verification: unclaimed = no container at all, proposed = an
  // agent scaffold awaits a decision, rejected = a container was declined.
  boundary_process_unassigned: CircleEllipsis,
  boundary_process_proposed: CircleDashed,
  boundary_process_rejected: CircleX,
  // Trail step verification: unconfirmed = no augmentation yet, stale = code changed
  step_unconfirmed: CircleHelp,
  step_stale: History,
};

/**
 * Icons for target SHAPES that are more specific than their verification lane.
 * An audit `kind` of `trail` covers the whole flow, so a finding about
 * one step of it would otherwise wear the lane's `Route` icon and read as a
 * comment on the flow rather than on the step that is actually wrong.
 */
export const ISSUE_TARGET_KIND_ICON: Partial<
  Record<SubsystemIssueTargetKind, LucideIcon>
> = {
  // A step in a flow: a footprint along the path, distinct from the path itself.
  step: Footprints,
};

export interface SubsystemIssueTarget {
  kind: SubsystemIssueTargetKind;
  /** Stable id used to group and to focus the target on the graph. */
  id?: string;
  /** Display label (component name, `from → to`, module path, flow title). */
  label: string;
  /** Optional sub-label (step number, …). */
  detail?: string;
  /**
   * For a `step` target: the trail id, plus a 0-based index into that
   * trail's steps. Carried structurally rather than parsed back out of
   * `detail` ("step 7") so focusing a step is exact rather than best-effort —
   * `detail` is a display string and is free to change its phrasing.
   */
  stepIndex?: number;
}

/** One issue to surface in the sidebar (and later, on the graph). */
export interface SubsystemIssue {
  id: string;
  severity: SubsystemIssueSeverity;
  /** Machine kind, e.g. `missing_file`. Drives the label when `kindLabel` is absent. */
  kind: string;
  /** Human label override for the kind. */
  kindLabel?: string;
  message: string;
  target?: SubsystemIssueTarget;
  /** Verification layer override; defaults from `kind`. */
  category?: SubsystemIssueCategory;
  /** Deterministic fix the user can apply without an agent. */
  fix?: { label: string };
}

const SEVERITY_RANK: Record<SubsystemIssueSeverity, number> = {
  error: 0,
  info: 1,
};

/** `missing_file` → `Missing file`. */
export function humanizeIssueKind(kind: string): string {
  const spaced = kind.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Curated labels. Construct-layer findings stay fully qualified ("Construct
 * declaration file missing", "Construct type mismatch") rather than relying on
 * the category header — this UI is new and the extra words read clearer.
 * Boundary findings drop the `boundary_` prefix since the layer already
 * scopes them. Explicit `issue.kindLabel` wins.
 */
const KIND_LABEL: Record<string, string> = {
  missing_file: 'Construct declaration file missing',
  symbol_ambiguous: 'Multiple construct symbol matches',
  symbol_unmatched: 'Construct symbol missing',
  stale_declaration: 'Construct declaration drift',
  construct_mismatch: 'Construct type mismatch',
  construct_unconfirmed: 'Construct type unconfirmed',
  signature_mismatch: 'Construct signature mismatch',
  signature_unconfirmed: 'Construct signature unconfirmed',
  repo_unresolved: 'No repository clone',
  graphify_unavailable: 'Graphify cache unavailable',
  boundary_module_file_mismatch: 'Declaration file outside module',
  boundary_process_nest_disagree: 'Module spans multiple process contexts',
  // C4 process verification (labels read as boundary states, since the layer
  // scopes them to process frames).
  boundary_process_unassigned: 'Process boundary unclaimed',
  boundary_process_proposed: 'Container awaiting decision',
  boundary_process_rejected: 'Container rejected',
  trail: 'Step issue',
  step_unconfirmed: 'Call site not verified',
  step_stale: 'Call site changed',
};

/** Label for an issue's kind. Explicit `kindLabel` wins; unknown kinds humanize. */
export function issueKindLabel(issue: SubsystemIssue): string {
  return issue.kindLabel ?? KIND_LABEL[issue.kind] ?? humanizeIssueKind(issue.kind);
}

/**
 * Display order within the list, by verification pipeline — not severity.
 * Mirrors the per-component check order (file → symbol → declaration → type →
 * signature), then the boundary layers (module membership → process nest) and
 * the remaining layers. Within a stage, "unconfirmed" precedes "mismatch": you
 * reach a verdict before you can find it wrong.
 */
const KIND_ORDER: Record<string, number> = {
  // Repositories — availability precondition
  repo_unresolved: 0,
  graphify_unavailable: 1,
  // Constructs — file → symbol → declaration → type → signature
  missing_file: 10,
  symbol_unmatched: 11,
  symbol_ambiguous: 12,
  stale_declaration: 13,
  construct_unconfirmed: 14,
  construct_mismatch: 15,
  signature_unconfirmed: 16,
  signature_mismatch: 17,
  // Static topology — package/module membership
  boundary_module_file_mismatch: 23,
  // Runtime topology — process containment
  boundary_process_nest_disagree: 30,
  boundary_process_unassigned: 31,
  boundary_process_proposed: 32,
  boundary_process_rejected: 33,
  // Trail — mechanical issues first, then step verification
  trail: 40,
  step_unconfirmed: 41,
  step_stale: 42,
};

const KIND_ORDER_FALLBACK = 100;

/** Sort key for a kind; unknown kinds sort last. */
export function issueKindOrder(kind: string): number {
  return KIND_ORDER[kind] ?? KIND_ORDER_FALLBACK;
}

export function severityRank(severity: SubsystemIssueSeverity): number {
  return SEVERITY_RANK[severity] ?? SEVERITY_RANK.info;
}

/** Worst (most severe) severity in a list; `info` for an empty list. */
export function worstSeverity(
  issues: SubsystemIssue[],
): SubsystemIssueSeverity {
  let worst: SubsystemIssueSeverity = 'info';
  for (const issue of issues) {
    if (severityRank(issue.severity) < severityRank(worst)) worst = issue.severity;
  }
  return worst;
}

export interface SubsystemIssueGroup {
  key: string;
  kind: SubsystemIssueTargetKind;
  label: string;
  detail?: string;
  issues: SubsystemIssue[];
  severity: SubsystemIssueSeverity;
}

function targetKey(issue: SubsystemIssue): string {
  const t = issue.target;
  if (!t) return 'graph';
  return `${t.kind}:${t.id ?? t.label}`;
}

/**
 * Group issues by their target, worst-severity first, then by label. Within a
 * group, issues are ordered error → info (stable for ties).
 */
export function groupIssuesByTarget(
  issues: SubsystemIssue[],
): SubsystemIssueGroup[] {
  const byKey = new Map<string, SubsystemIssueGroup>();
  for (const issue of issues) {
    const key = targetKey(issue);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        kind: issue.target?.kind ?? 'graph',
        label: issue.target?.label ?? 'Model',
        detail: issue.target?.detail,
        issues: [],
        severity: 'info',
      };
      byKey.set(key, group);
    }
    group.issues.push(issue);
  }
  const groups = [...byKey.values()];
  for (const group of groups) {
    group.issues.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );
    group.severity = worstSeverity(group.issues);
  }
  groups.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

export interface SubsystemIssueCategoryGroup {
  category: SubsystemIssueCategory;
  label: string;
  issues: SubsystemIssue[];
  /** Worst severity present; `null` when the layer is clean. */
  severity: SubsystemIssueSeverity | null;
  count: number;
}

/**
 * Group issues into the four verification layers — always all four, in order,
 * so a clean layer can render its "happy" state. Issues within a layer are
 * ordered error → info (stable for ties).
 */
export function groupIssuesByCategory(
  issues: SubsystemIssue[],
): SubsystemIssueCategoryGroup[] {
  const byCategory = new Map<SubsystemIssueCategory, SubsystemIssue[]>();
  for (const category of SUBSYSTEM_ISSUE_CATEGORIES) byCategory.set(category, []);
  for (const issue of issues) {
    byCategory.get(issueCategory(issue))?.push(issue);
  }
  return SUBSYSTEM_ISSUE_CATEGORIES.map((category) => {
    const grouped = byCategory.get(category) ?? [];
    // Logical pipeline order, then by target label (stable for the rest).
    grouped.sort((a, b) => {
      const byKind = issueKindOrder(a.kind) - issueKindOrder(b.kind);
      if (byKind !== 0) return byKind;
      return (a.target?.label ?? '').localeCompare(b.target?.label ?? '');
    });
    return {
      category,
      label: SUBSYSTEM_ISSUE_CATEGORY_LABEL[category],
      issues: grouped,
      severity: grouped.length > 0 ? worstSeverity(grouped) : null,
      count: grouped.length,
    };
  });
}

/** `#rrggbb` → `rgba(...)`; used for hover washes on translucent surfaces. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function severityColor(
  severity: SubsystemIssueSeverity,
  colors: { error: string; info: string; warning: string },
): string {
  if (severity === 'error') return colors.error ?? '#e5534b';
  // `info` severity = unconfirmed findings; amber, matching the lane icons.
  return colors.warning ?? '#d4a017';
}

export interface SubsystemIssueCardProps {
  issue: SubsystemIssue;
  onSelect?: (issue: SubsystemIssue) => void;
  /** The card was collapsed again — undo whatever `onSelect` focused. */
  onDeselect?: (issue: SubsystemIssue) => void;
  onApplyFix?: (issue: SubsystemIssue) => void;
  onHover?: (issue: SubsystemIssue | null) => void;
  /**
   * This card expanded / collapsed, for any reason. The list needs it because a
   * collapsed CATEGORY unmounts its cards outright, so a card can stop being
   * expanded without ever toggling itself — and a host that focused something
   * on expand has to hear about it.
   */
  onExpandedChange?: (issue: SubsystemIssue, expanded: boolean) => void;
}

export function SubsystemIssueCard({
  issue,
  onSelect,
  onDeselect,
  onApplyFix,
  onHover,
  onExpandedChange,
}: SubsystemIssueCardProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  const [fixHover, setFixHover] = useState(false);
  // Every issue is collapsed to its kind by default so the list scans as a
  // catalogue of problems; clicking a card reveals the message and any fix.
  const [expanded, setExpanded] = useState(false);
  const showDetail = expanded;
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const color = severityColor(issue.severity, theme.colors);
  // Leading icon: the verification rung when the finding maps to one, else the
  // layer's icon — every row reads with an icon.
  const rung = issueRung(issue.kind);
  // Rung icons are the construct ladder; a boundary finding names its own icon
  // (it has no rung); everything else falls back to its layer's icon.
  const targetIcon = issue.target?.kind
    ? ISSUE_TARGET_KIND_ICON[issue.target.kind]
    : undefined;
  const RowIcon: LucideIcon = rung
    ? ISSUE_RUNG_ICON[rung]
    : (ISSUE_KIND_ICON[issue.kind] ??
      targetIcon ??
      SUBSYSTEM_ISSUE_CATEGORY_ICON[issueCategory(issue)]);
  const activate = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandedChange?.(issue, next);
    if (next) onSelect?.(issue);
    else onDeselect?.(issue);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      onMouseEnter={() => {
        setHover(true);
        onHover?.(issue);
      }}
      onMouseLeave={() => {
        setHover(false);
        onHover?.(null);
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '9px 12px 10px',
        borderBottom: `1px solid ${theme.colors.border}`,
        background: hover ? theme.colors.background : 'transparent',
        cursor: 'pointer',
        transition: 'background 120ms ease',
        fontFamily: theme.fonts.body,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <RowIcon size={15} color={color} style={{ flexShrink: 0 }} aria-hidden />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[1],
            color: theme.colors.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {issue.target?.label ?? issueKindLabel(issue)}
        </span>
        <span
          style={{
            display: 'inline-flex',
            color: muted,
            flexShrink: 0,
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>
      {showDetail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4 }}>
          {issue.target && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span
                style={{
                  minWidth: 0,
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[1],
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  color,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {issueKindLabel(issue)}
              </span>
            </div>
          )}
          <div
            style={{
              fontSize: theme.fontSizes[1],
              color: theme.colors.text,
              lineHeight: 1.45,
              overflowWrap: 'anywhere',
            }}
          >
            {issue.message}
          </div>
          {issue.fix && (
            <div style={{ display: 'flex' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyFix?.(issue);
                }}
                disabled={onApplyFix == null}
                onMouseEnter={() => setFixHover(true)}
                onMouseLeave={() => setFixHover(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  border: `1px solid ${theme.colors.success ?? '#2da44e'}`,
                  borderRadius: 4,
                  background:
                    onApplyFix != null && fixHover
                      ? withAlpha(theme.colors.success ?? '#2da44e', 0.16)
                      : 'transparent',
                  color: theme.colors.success ?? '#2da44e',
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[1],
                  cursor: onApplyFix == null ? 'default' : 'pointer',
                  opacity: onApplyFix == null ? 0.5 : 1,
                  transition: 'background 120ms ease',
                }}
              >
                <Wrench size={12} />
                {issue.fix.label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface SubsystemIssueListProps {
  issues: SubsystemIssue[];
  onSelectIssue?: (issue: SubsystemIssue) => void;
  /** A card was collapsed again — the counterpart to `onSelectIssue`. */
  onDeselectIssue?: (issue: SubsystemIssue) => void;
  onApplyFix?: (issue: SubsystemIssue) => void;
  onHoverIssue?: (issue: SubsystemIssue | null) => void;
  /**
   * Land the list focused on one verification layer: that category starts
   * expanded and every other category starts collapsed. Used when the list is
   * opened from a lane-specific entry point (e.g. the Maintainer tab's lane
   * badges) so the caller's intent — "show me this layer's findings" — is
   * honoured without an extra click.
   */
  focusCategory?: SubsystemIssueCategory;
  /**
   * Fires whenever the expanded-layer set changes. Publishers use it to focus
   * the canvas on the layer's findings — dimming everything the expanded
   * layers do not implicate. Emits [] when every layer is collapsed.
   */
  onExpandedCategoriesChange?: (categories: SubsystemIssueCategory[]) => void;
}

export function SubsystemIssueList({
  issues,
  onSelectIssue,
  onDeselectIssue,
  onApplyFix,
  onHoverIssue,
  focusCategory,
  onExpandedCategoriesChange,
}: SubsystemIssueListProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const categories = groupIssuesByCategory(issues);
  // Collapsed categories (by id). Every layer starts collapsed, so the list
  // opens as a scannable summary of layers + counts; a layer opens on click.
  // When the list was opened focused on a single layer, that one starts
  // expanded and all others stay collapsed, so the caller's intent — "show me
  // this layer's findings" — is honoured without an extra click.
  const [collapsed, setCollapsed] = useState<Set<SubsystemIssueCategory>>(
    () =>
      focusCategory
        ? new Set(
            SUBSYSTEM_ISSUE_CATEGORIES.filter((c) => c !== focusCategory),
          )
        : new Set(SUBSYSTEM_ISSUE_CATEGORIES),
  );
  const [hovered, setHovered] = useState<SubsystemIssueCategory | null>(null);
  // Re-apply the focus when it changes on an already-mounted list (e.g. the
  // host switches which lane the open model is focused on).
  useEffect(() => {
    setCollapsed(
      focusCategory
        ? new Set(SUBSYSTEM_ISSUE_CATEGORIES.filter((c) => c !== focusCategory))
        : new Set(SUBSYSTEM_ISSUE_CATEGORIES),
    );
  }, [focusCategory]);
  // Publish the expanded-layer set so a host can focus the canvas on it. Read
  // the callback through a ref so an unstable host closure can't re-trigger the
  // effect (and loop) on every render.
  const onExpandedRef = useRef(onExpandedCategoriesChange);
  onExpandedRef.current = onExpandedCategoriesChange;
  useEffect(() => {
    onExpandedRef.current?.(
      SUBSYSTEM_ISSUE_CATEGORIES.filter((c) => !collapsed.has(c)),
    );
  }, [collapsed]);
  // The card currently expanded, if any. Tracked here (not just inside the card)
  // because closing a CATEGORY unmounts its cards, so a card can stop being
  // expanded without toggling itself — and the host that focused a target on
  // expand must be told to let it go.
  const expandedIssueRef = useRef<SubsystemIssue | null>(null);
  const trackExpanded = (issue: SubsystemIssue, expanded: boolean) => {
    expandedIssueRef.current = expanded ? issue : null;
  };
  const toggleCollapsed = (category: SubsystemIssueCategory) => {
    // Accordion: at most one layer open. Opening one collapses the rest;
    // clicking the open one collapses all. That keeps the canvas dim driven by
    // exactly one layer at a time.
    const next = collapsed.has(category)
      ? new Set(SUBSYSTEM_ISSUE_CATEGORIES.filter((c) => c !== category))
      : new Set(SUBSYSTEM_ISSUE_CATEGORIES);
    // Retract the focus before this layer's cards unmount. Test the NEXT set,
    // not the current one: opening a layer closes every other, so a focus
    // established in a sibling layer dies on this click too.
    const open = expandedIssueRef.current;
    if (open && next.has(issueCategory(open))) {
      expandedIssueRef.current = null;
      onDeselectIssue?.(open);
    }
    setCollapsed(next);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {categories.map((category) => {
        // A layer with no findings renders its happy state: a green check in
        // the header, no count, no cards.
        const clean = category.count === 0;
        const accent = category.severity
          ? severityColor(category.severity, theme.colors)
          : theme.colors.success;
        const isCollapsed = collapsed.has(category.category);
        const isHovered = hovered === category.category;
        return (
          <div key={category.category}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(category.category)}
              onMouseEnter={() => setHovered(category.category)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                background: isHovered
                  ? (theme.colors.backgroundTertiary ??
                    theme.colors.backgroundHover ??
                    theme.colors.backgroundSecondary ??
                    theme.colors.background)
                  : (theme.colors.backgroundSecondary ??
                    theme.colors.background),
                border: 'none',
                borderTop: `1px solid ${theme.colors.border}`,
                borderBottom: `1px solid ${theme.colors.border}`,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: theme.fonts.body,
              }}
            >
              {(() => {
                const Icon = SUBSYSTEM_ISSUE_CATEGORY_ICON[category.category];
                if (Icon) {
                  return (
                    <Icon
                      size={13}
                      color={accent}
                      style={{ flexShrink: 0 }}
                      aria-hidden="true"
                    />
                  );
                }
                return null;
              })()}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: theme.fontSizes[2],
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  color: clean ? muted : theme.colors.text,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {category.label}
              </span>
              {clean ? (
                <CircleCheck size={13} color={accent} style={{ flexShrink: 0 }} />
              ) : (
                <span
                  style={{
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[1],
                    fontWeight: 600,
                    color: muted,
                    flexShrink: 0,
                  }}
                >
                  {category.count}
                </span>
              )}
              <span style={{ display: 'inline-flex', color: muted, flexShrink: 0 }}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>
            {!clean && !isCollapsed && (
              // Hang the cards off the header: an inset indent so the body
              // reads as belonging to the layer above.
              <div style={{ marginLeft: 11 }}>
                {category.issues.map((issue) => (
                  <SubsystemIssueCard
                    key={issue.id}
                    issue={issue}
                    onSelect={onSelectIssue}
                    onDeselect={onDeselectIssue}
                    onExpandedChange={trackExpanded}
                    onApplyFix={onApplyFix}
                    onHover={onHoverIssue}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
