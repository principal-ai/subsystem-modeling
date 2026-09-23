/**
 * SubsystemIssueList — the diagnostics sidebar list.
 *
 * A catalogue of verification issues (audit findings), grouped by *target* so
 * every broken component / relation / module / flow clusters together. Each
 * card is severity-colored, names its kind, states the message, and offers the
 * deterministic fix inline when one exists.
 *
 * The list is presentation-only: it owns no verification logic. Hosts map their
 * findings into `SubsystemIssue[]` and handle `onSelectIssue` / `onApplyFix`
 * (e.g. focus the node on the graph, or apply the fix in the report).
 */

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Component,
  FolderGit2,
  Network,
  Route,
  Server,
  Wrench,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

export type SubsystemIssueSeverity = 'error' | 'info';

export type SubsystemIssueTargetKind =
  | 'component'
  | 'relation'
  | 'module'
  | 'walkthrough'
  | 'repo'
  | 'graph';

/**
 * The four verification layers, in order. Mirrors the docs' progression:
 * constructs → static topology → runtime topology → walkthrough.
 */
export type SubsystemIssueCategory =
  | 'repo'
  | 'construct'
  | 'static-topology'
  | 'runtime-topology'
  | 'walkthrough';

/** Layer order + display names, shared by the list and its headers. */
export const SUBSYSTEM_ISSUE_CATEGORIES: SubsystemIssueCategory[] = [
  'repo',
  'construct',
  'static-topology',
  'runtime-topology',
  'walkthrough',
];

/** Per-category header icon — mirrors the Maintainer tab's lane icons. */
export const SUBSYSTEM_ISSUE_CATEGORY_ICON: Record<
  SubsystemIssueCategory,
  LucideIcon
> = {
  repo: FolderGit2,
  construct: Component,
  'static-topology': Network,
  'runtime-topology': Server,
  walkthrough: Route,
};

export const SUBSYSTEM_ISSUE_CATEGORY_LABEL: Record<
  SubsystemIssueCategory,
  string
> = {
  repo: 'Repositories',
  construct: 'Constructs',
  'static-topology': 'Static topology',
  'runtime-topology': 'Runtime topology',
  walkthrough: 'Walkthrough',
};

/** Default `kind` → layer. `boundary_*` splits by module (static) vs process (runtime). */
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
  topology_broken_endpoint: 'static-topology',
  topology_import_unconfirmed: 'static-topology',
  topology_relation_unconfirmed: 'static-topology',
  boundary_module_file_mismatch: 'static-topology',
  boundary_process_nest_disagree: 'runtime-topology',
  walkthrough: 'walkthrough',
};

/**
 * Verification layer for an issue. An explicit `category` wins; otherwise the
 * audit `kind` is mapped, defaulting to `construct` (the base layer).
 */
export function issueCategory(issue: SubsystemIssue): SubsystemIssueCategory {
  return issue.category ?? KIND_CATEGORY[issue.kind] ?? 'construct';
}

export interface SubsystemIssueTarget {
  kind: SubsystemIssueTargetKind;
  /** Stable id used to group and to focus the target on the graph. */
  id?: string;
  /** Display label (component name, `from → to`, module path, flow title). */
  label: string;
  /** Optional sub-label (relation type, step number, …). */
  detail?: string;
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
 * Topology findings drop the `topology_`/`boundary_` prefix since the layer
 * already scopes them. Explicit `issue.kindLabel` wins.
 */
const KIND_LABEL: Record<string, string> = {
  missing_file: 'Construct declaration file missing',
  symbol_ambiguous: 'Multiple construct symbol matches',
  symbol_unmatched: 'Construct symbol unconfirmed',
  stale_declaration: 'Construct declaration drift',
  construct_mismatch: 'Construct type mismatch',
  construct_unconfirmed: 'Construct type unconfirmed',
  signature_mismatch: 'Construct signature mismatch',
  signature_unconfirmed: 'Construct signature unconfirmed',
  repo_unresolved: 'No repository clone',
  graphify_unavailable: 'Graphify cache unavailable',
  topology_broken_endpoint: 'Construct relationship broken',
  topology_import_unconfirmed: 'Import unconfirmed',
  topology_relation_unconfirmed: 'Relationship unconfirmed',
  boundary_module_file_mismatch: 'Declaration file outside module',
  boundary_process_nest_disagree: 'Module spans multiple process contexts',
  walkthrough: 'Step issue',
};

/** Label for an issue's kind. Explicit `kindLabel` wins; unknown kinds humanize. */
export function issueKindLabel(issue: SubsystemIssue): string {
  return issue.kindLabel ?? KIND_LABEL[issue.kind] ?? humanizeIssueKind(issue.kind);
}

/**
 * Display order within the list, by verification pipeline — not severity.
 * Mirrors the per-component check order (file → symbol → declaration → type →
 * signature), then topology (integrity → corroboration → membership) and the
 * remaining layers. Within a stage, "unconfirmed" precedes "mismatch": you
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
  // Static topology — edge integrity → corroboration → membership
  topology_broken_endpoint: 20,
  topology_relation_unconfirmed: 21,
  topology_import_unconfirmed: 22,
  boundary_module_file_mismatch: 23,
  // Runtime topology
  boundary_process_nest_disagree: 30,
  // Walkthrough
  walkthrough: 40,
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

function severityColor(
  severity: SubsystemIssueSeverity,
  colors: { error: string; info: string; warning: string },
): string {
  if (severity === 'error') return colors.error ?? '#e5534b';
  // `info` severity = unconfirmed findings; amber, matching the lane icons.
  return colors.warning ?? '#d4a017';
}

const TARGET_KIND_LABEL: Record<SubsystemIssueTargetKind, string> = {
  component: 'component',
  relation: 'relationship',
  module: 'module',
  walkthrough: 'flow',
  repo: 'repo',
  graph: 'model',
};

export interface SubsystemIssueCardProps {
  issue: SubsystemIssue;
  onSelect?: (issue: SubsystemIssue) => void;
  onApplyFix?: (issue: SubsystemIssue) => void;
  onHover?: (issue: SubsystemIssue | null) => void;
}

export function SubsystemIssueCard({
  issue,
  onSelect,
  onApplyFix,
  onHover,
}: SubsystemIssueCardProps) {
  const { theme } = useTheme();
  const [hover, setHover] = useState(false);
  // Every issue is collapsed to its kind by default so the list scans as a
  // catalogue of problems; clicking a card reveals the message and any fix.
  const [expanded, setExpanded] = useState(false);
  const showDetail = expanded;
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const color = severityColor(issue.severity, theme.colors);
  const activate = () => {
    setExpanded((v) => !v);
    onSelect?.(issue);
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
        <div
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
              fontSize: theme.fontSizes[0],
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              color,
              whiteSpace: 'nowrap',
            }}
          >
            {issueKindLabel(issue)}
          </span>
          {issue.target && (
            <span
              style={{
                minWidth: 0,
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                color: theme.colors.text,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`${TARGET_KIND_LABEL[issue.target.kind]} · ${issue.target.label}`}
            >
              {issue.target.label}
            </span>
          )}
        </div>
        <span
          style={{
            display: 'inline-flex',
            color: muted,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>
      {showDetail && (
        <div
          style={{
            fontSize: theme.fontSizes[0],
            color: theme.colors.text,
            lineHeight: 1.45,
            overflowWrap: 'anywhere',
          }}
        >
          {issue.message}
        </div>
      )}
      {showDetail && issue.fix && (
        <div style={{ display: 'flex', marginTop: 1 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onApplyFix?.(issue);
            }}
            disabled={onApplyFix == null}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              border: `1px solid ${theme.colors.primary}`,
              borderRadius: 4,
              background: 'transparent',
              color: theme.colors.primary,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              cursor: onApplyFix == null ? 'default' : 'pointer',
              opacity: onApplyFix == null ? 0.5 : 1,
            }}
          >
            <Wrench size={12} />
            {issue.fix.label}
          </button>
        </div>
      )}
    </div>
  );
}

export interface SubsystemIssueListProps {
  issues: SubsystemIssue[];
  onSelectIssue?: (issue: SubsystemIssue) => void;
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
}

export function SubsystemIssueList({
  issues,
  onSelectIssue,
  onApplyFix,
  onHoverIssue,
  focusCategory,
}: SubsystemIssueListProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const categories = groupIssuesByCategory(issues);
  // Collapsed categories (by id). Everything starts expanded, unless the list
  // was opened focused on a single layer — then every other layer starts
  // collapsed so the focused category's findings are what you land on.
  const [collapsed, setCollapsed] = useState<Set<SubsystemIssueCategory>>(
    () =>
      focusCategory
        ? new Set(
            SUBSYSTEM_ISSUE_CATEGORIES.filter((c) => c !== focusCategory),
          )
        : new Set(),
  );
  const [hovered, setHovered] = useState<SubsystemIssueCategory | null>(null);
  // Re-apply the focus when it changes on an already-mounted list (e.g. the
  // host switches which lane the open model is focused on).
  useEffect(() => {
    setCollapsed(
      focusCategory
        ? new Set(SUBSYSTEM_ISSUE_CATEGORIES.filter((c) => c !== focusCategory))
        : new Set(),
    );
  }, [focusCategory]);
  const toggleCollapsed = (category: SubsystemIssueCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
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
                  ? (theme.colors.backgroundHover ??
                    theme.colors.backgroundSecondary ??
                    theme.colors.background)
                  : (theme.colors.backgroundTertiary ??
                    theme.colors.backgroundSecondary ??
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
                  fontSize: theme.fontSizes[1],
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
                    fontSize: theme.fontSizes[0],
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
            {!clean &&
              !isCollapsed &&
              category.issues.map((issue) => (
                <SubsystemIssueCard
                  key={issue.id}
                  issue={issue}
                  onSelect={onSelectIssue}
                  onApplyFix={onApplyFix}
                  onHover={onHoverIssue}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
