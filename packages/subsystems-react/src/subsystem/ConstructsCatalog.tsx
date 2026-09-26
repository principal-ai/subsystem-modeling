/**
 * ConstructsCatalog — master/detail for a constructs-only subsystem
 * (components, no topology or walkthrough edges).
 *
 * Left: the model's files as a tree; clicking a file toggles its
 * constructs. Right: signatures grouped by repo, and within a repo stacked
 * per file under one combined file header carrying the path and a
 * description toggle; a declaration with a known line labels just that
 * construct's line in a file-like gutter, and `external` constructs get a
 * header naming their kind with the body naming the construct. The model
 * description's toggle sits in the left chrome and opens the markdown as an
 * overlay over the construct area. File opens still use the bottom FileDrawer
 * when the host injects a viewer.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import {
  AlignLeft,
  Box,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  X,
} from 'lucide-react';
import {
  formatPurl,
  type SubsystemComponent,
} from './model';
import type { SubsystemOpenFileOptions } from './declarationRef';
import { ComponentDeclaration } from './ComponentDeclaration';
import type { ComponentVerificationState } from './ComponentDeclaration';
import type { DeclarationSymbolRef, SymbolInspection } from './symbolRefs';
import { SubsystemDiagnosticToggle, type SubsystemDiagnostic } from './DiagnosticToggle';
import { FileDrawer } from './FileDrawer';
import { componentColor } from '../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';

export interface ConstructsCatalogProps {
  components: SubsystemComponent[];
  onSelect?: (componentAlias: string) => void;
  title?: string;
  hideSidebar?: boolean;
  /**
   * Model description. Its toggle lives in the left chrome; opening it shows
   * the markdown as an overlay over the construct area.
   */
  description?: string;
  /**
   * Controlled open state for the description overlay. When provided the host
   * owns it (e.g. a button in its own header) and the built-in toggle just
   * reports changes; otherwise the built-in toggle drives the state.
   */
  descriptionOpen?: boolean;
  onDescriptionOpenChange?: (open: boolean) => void;
  diagnostic?: SubsystemDiagnostic;
  sidebarExtra?: ReactNode;
  sidebarAfterDescription?: ReactNode;
  renderFileViewer?: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  renderFileView?: (component: SubsystemComponent) => ReactNode;
  onFileSelect?: (file: string) => void;
  componentVerification?: ComponentVerificationState | null;
  /** Referenced-symbol click → host graphify lookup (purl/file from the card). */
  onInspectSymbol?: (req: {
    purl: string;
    file: string;
    symbol: string;
    ref: DeclarationSymbolRef;
  }) => Promise<SymbolInspection | null> | SymbolInspection | null;
}

const FileDrawerContent = memo(function FileDrawerContent({
  render,
  file,
  startLine,
}: {
  render: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  file: string;
  startLine?: number;
}) {
  return <>{render(file, startLine != null ? { startLine } : undefined)}</>;
});

interface FileTreeNode {
  name: string;
  /** Full path for files; path prefix for folders. */
  path: string;
  isFile: boolean;
  children: FileTreeNode[];
  /** Components declared in this file (file nodes only). */
  components: SubsystemComponent[];
}

/** Build a folder/file tree from component `file` paths. */
function buildFileTree(components: SubsystemComponent[]): FileTreeNode {
  const root: FileTreeNode = {
    name: '',
    path: '',
    isFile: false,
    children: [],
    components: [],
  };
  for (const c of components) {
    if (!c.file) continue;
    const parts = c.file.split('/').filter(Boolean);
    let node = root;
    let prefix = '';
    parts.forEach((name, i) => {
      const isFile = i === parts.length - 1;
      prefix = prefix ? `${prefix}/${name}` : name;
      let child = node.children.find(
        (x) => x.name === name && x.isFile === isFile,
      );
      if (!child) {
        child = { name, path: prefix, isFile, children: [], components: [] };
        node.children.push(child);
      }
      node = child;
    });
    node.components.push(c);
  }
  const sortNode = (n: FileTreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

function resolveRelated(
  components: SubsystemComponent[],
  ref: string,
): SubsystemComponent | undefined {
  const clean = ref.replace(/\(\)$/, '');
  return components.find(
    (c) =>
      c.alias === clean ||
      c.name === clean ||
      c.symbol === clean ||
      c.symbol?.replace(/\(\)$/, '') === clean,
  );
}

const GH_PURL = /^pkg:github\/([^/]+)\/([^/#?]+)/;/** Repo/app label for a purl group header. */
function repoLabel(c: SubsystemComponent): string {
  const m = GH_PURL.exec(c.purl ?? '');
  if (m) return m[2]!;
  return c.purl ? formatPurl(c.purl) : c.name;
}

/** Avatar for a purl group header: explicit logo, else the GitHub owner. */
function repoLogo(c: SubsystemComponent): string | undefined {
  if (c.logo) return c.logo;
  const m = GH_PURL.exec(c.purl ?? '');
  if (m) return `https://github.com/${m[1]}.png?size=40`;
  return undefined;
}

/**
 * Split a repo's declarations into consecutive runs that share a `file`, so
 * each run can render as one connected stack. Components with no `file` are
 * never merged (they have no shared location to group under).
 */
function splitByFileRun(items: SubsystemComponent[]): SubsystemComponent[][] {
  const runs: SubsystemComponent[][] = [];
  for (const c of items) {
    const prev = runs[runs.length - 1];
    const key = c.file || `alias:${c.alias}`;
    const prevKey =
      prev && prev[0] ? prev[0].file || `alias:${prev[0].alias}` : null;
    if (prev && prevKey === key) prev.push(c);
    else runs.push([c]);
  }
  return runs;
}

export function ConstructsCatalog({
  components,
  onSelect,
  title,
  hideSidebar,
  description,
  descriptionOpen: descriptionOpenProp,
  onDescriptionOpenChange,
  diagnostic,
  sidebarExtra,
  sidebarAfterDescription,
  renderFileViewer,
  renderFileView,
  onFileSelect,
  componentVerification,
  onInspectSymbol,
}: ConstructsCatalogProps) {
  const { theme, mode } = useTheme();
  const pierreTheme = resolvePierreSyntaxThemeName(mode);
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const accentColor = theme.colors.accent ?? theme.colors.info;

  // Sort by process (client before server, etc.), constructs with no process
  // last; stable within a group by the model's authored order.
  const orderedComponents = useMemo(() => {
    return components
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const ra = a.c.process?.trim() ? 0 : 1;
        const rb = b.c.process?.trim() ? 0 : 1;
        if (ra !== rb) return ra - rb;
        const pa = a.c.process ?? '';
        const pb = b.c.process ?? '';
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }, [components]);

  const [visibleAliases, setVisibleAliases] = useState<string[]>([]);
  const [focusedAlias, setFocusedAlias] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const descriptionOpen = descriptionOpenProp ?? descriptionVisible;
  const setDescriptionOpen = (open: boolean) => {
    setDescriptionVisible(open);
    onDescriptionOpenChange?.(open);
  };
  const [descToggleHover, setDescToggleHover] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  // Explicit description toggles per file run. Unset falls back to the kind's
  // default (externals open, files closed).
  const [purposeOverrides, setPurposeOverrides] = useState<
    Record<string, boolean>
  >({});
  const [drawer, setDrawer] = useState<{ file: string; startLine?: number } | null>(
    null,
  );

  const visibleSet = useMemo(() => new Set(visibleAliases), [visibleAliases]);
  const visibleComponents = useMemo(
    () => orderedComponents.filter((c) => visibleSet.has(c.alias)),
    [orderedComponents, visibleSet],
  );

  // When nothing is toggled on, the right pane falls back to a searchable list
  // of every construct, rendered as if all were selected.
  const searchActive = visibleComponents.length === 0;
  const searchResults = useMemo(() => {
    if (!searchActive) return visibleComponents;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orderedComponents;
    return orderedComponents.filter((c) => {
      const haystack = [
        c.name,
        c.symbol,
        c.alias,
        c.file,
        c.construct,
        c.stereotype,
        c.purpose,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchActive, searchQuery, orderedComponents, visibleComponents]);

  const fileTree = useMemo(() => buildFileTree(orderedComponents), [orderedComponents]);
  const hasFiles = useMemo(
    () => orderedComponents.some((c) => !!c.file),
    [orderedComponents],
  );

  // Group the declarations on screen by purl so the repo/app identity
  // (logo + name) renders once per group instead of on every card.
  const repoGroups = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      logo?: string;
      items: SubsystemComponent[];
    }> = [];
    const index = new Map<string, number>();
    for (const c of searchResults) {
      const key = c.purl || c.alias;
      let at = index.get(key);
      if (at == null) {
        at = groups.length;
        index.set(key, at);
        groups.push({ key, label: repoLabel(c), logo: repoLogo(c), items: [] });
      }
      if (!groups[at]!.logo && c.logo) groups[at]!.logo = c.logo;
      groups[at]!.items.push(c);
    }
    return groups;
  }, [searchResults]);

  useEffect(() => {
    const last = visibleAliases[visibleAliases.length - 1];
    if (!last) return;
    document
      .getElementById(`construct-signature-${last}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [visibleAliases]);

  // Keep the declaration whose file is open in view, so the source and its
  // signature stay legible together.
  useEffect(() => {
    if (!drawer) return;
    const match =
      orderedComponents.find(
        (c) => c.file === drawer.file && c.declarationRef?.startLine === drawer.startLine,
      ) ?? orderedComponents.find((c) => c.file === drawer.file);
    if (!match) return;
    document
      .getElementById(`construct-signature-${match.alias}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [orderedComponents, drawer]);

  // Drop aliases that left the model; an empty set is valid (search fallback).
  useEffect(() => {
    const aliases = new Set(orderedComponents.map((c) => c.alias));
    setVisibleAliases((prev) => prev.filter((alias) => aliases.has(alias)));
    setFocusedAlias((prev) => (prev && aliases.has(prev) ? prev : null));
  }, [orderedComponents]);

  const show = useCallback(
    (alias: string) => {
      setFocusedAlias(alias);
      setVisibleAliases((prev) => (prev.includes(alias) ? prev : [...prev, alias]));
      onSelect?.(alias);
    },
    [onSelect],
  );

  const toggleFolder = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const setPurposeOpen = useCallback((key: string, open: boolean) => {
    setPurposeOverrides((prev) => ({ ...prev, [key]: open }));
  }, []);

  /** File-tree click: show every construct declared in the file, or hide them
   *  all when they're already shown — a bulk toggle of the file's constructs. */
  const toggleFile = useCallback(
    (comps: SubsystemComponent[]) => {
      const aliases = comps.map((c) => c.alias);
      setVisibleAliases((prev) => {
        const set = new Set(prev);
        const allVisible = aliases.every((alias) => set.has(alias));
        aliases.forEach((alias) => (allVisible ? set.delete(alias) : set.add(alias)));
        return orderedComponents.filter((c) => set.has(c.alias)).map((c) => c.alias);
      });
      const first = comps[0];
      if (first) {
        setFocusedAlias(first.alias);
        onSelect?.(first.alias);
      }
    },
    [orderedComponents, onSelect],
  );

  const renderTree = useCallback(
    (node: FileTreeNode, depth: number): ReactNode => {
      return node.children.map((child) => {
        if (!child.isFile) {
          const collapsed = collapsedFolders.has(child.path);
          const hovered = hoveredRow === child.path;
          return (
            <li key={child.path} role="presentation">
              <button
                type="button"
                onClick={() => toggleFolder(child.path)}
                onMouseEnter={() => setHoveredRow(child.path)}
                onMouseLeave={() =>
                  setHoveredRow((h) => (h === child.path ? null : h))
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  width: '100%',
                  padding: '4px 8px',
                  paddingLeft: 8 + depth * 12,
                  border: 'none',
                  borderRadius: 6,
                  background: hovered ? theme.colors.border : 'transparent',
                  color:
                    hovered
                      ? theme.colors.text
                      : theme.colors.textSecondary ?? muted,
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 100ms ease',
                }}
              >
                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <Folder size={12} />
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {child.name}
                </span>
              </button>
              {!collapsed && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {renderTree(child, depth + 1)}
                </ul>
              )}
            </li>
          );
        }
        const aliases = child.components.map((c) => c.alias);
        const allVisible = aliases.length > 0 && aliases.every((alias) => visibleSet.has(alias));
        const hovered = hoveredRow === child.path;
        const color = componentColor(child.components[0]!, pierreTheme);
        return (
          <li key={child.path} role="presentation">
            <button
              type="button"
              data-testid={`file-row-${child.path}`}
              aria-pressed={allVisible}
              onClick={() => toggleFile(child.components)}
              onMouseEnter={() => setHoveredRow(child.path)}
              onMouseLeave={() =>
                setHoveredRow((h) => (h === child.path ? null : h))
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '4px 8px',
                paddingLeft: 8 + depth * 12 + 16,
                border: 'none',
                borderRadius: 6,
                background: hovered ? theme.colors.border : 'transparent',
                color:
                  allVisible
                    ? color
                    : hovered
                      ? theme.colors.text
                      : theme.colors.textSecondary ?? muted,
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[0],
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 100ms ease',
              }}
            >
              <FileText size={12} style={{ flexShrink: 0 }} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: allVisible ? 600 : 400,
                }}
              >
                {child.name}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: theme.fontSizes[0] * 0.85,
                  color: allVisible ? color : muted,
                }}
              >
                {aliases.length}
              </span>
            </button>
          </li>
        );
      });
    },
    [
      collapsedFolders,
      hoveredRow,
      visibleSet,
      toggleFolder,
      toggleFile,
      theme,
      muted,
      pierreTheme,
    ],
  );

  const onOpenFile = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) => {
      const startLine = opts?.startLine;
      setDrawer((prev) => {
        if (prev?.file === file && prev.startLine === startLine) return null;
        return { file, startLine };
      });
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  const onRelatedSelect = useCallback(
    (ref: string) => {
      const comp = resolveRelated(components, ref);
      if (!comp) return;
      // In the all-constructs search fallback nothing needs revealing — just
      // surface the target. Otherwise add it to the visible set.
      if (searchActive) {
        setFocusedAlias(comp.alias);
        document
          .getElementById(`construct-signature-${comp.alias}`)
          ?.scrollIntoView({ block: 'nearest' });
        return;
      }
      show(comp.alias);
    },
    [components, show, searchActive],
  );

  const fileViewer = useMemo(() => {
    if (renderFileViewer) return renderFileViewer;
    if (renderFileView) {
      const byFile = new Map(
        components.filter((c) => c.file).map((c) => [c.file, c] as const),
      );
      return (file: string, _opts?: SubsystemOpenFileOptions) => {
        const comp = byFile.get(file);
        return comp ? renderFileView(comp) : null;
      };
    }
    return undefined;
  }, [renderFileViewer, renderFileView, components]);

  const fileViewerRef = useRef(fileViewer);
  fileViewerRef.current = fileViewer;
  const renderDrawerContent = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) =>
      fileViewerRef.current?.(file, opts) ?? null,
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawer) setDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const showChrome =
    !hideSidebar &&
    !!(
      title ||
      description ||
      diagnostic ||
      sidebarExtra ||
      sidebarAfterDescription
    );

  return (
    <div
      data-testid="constructs-catalog"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        background: theme.colors.background,
      }}
    >
      <aside
        style={{
          width: 280,
          minWidth: 200,
          maxWidth: 360,
          flexShrink: 0,
          borderRight: `1px solid ${theme.colors.border}`,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {showChrome && (
          <div
            style={{
              padding: '16px 16px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {sidebarExtra}
            {(title || description || diagnostic) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                {title && (
                  <h2
                    style={{
                      margin: 0,
                      flex: 1,
                      minWidth: 0,
                      fontSize: theme.fontSizes[2],
                      fontWeight: 600,
                      color: theme.colors.text,
                      fontFamily: theme.fonts.monospace,
                    }}
                  >
                    {title}
                  </h2>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    marginLeft: title ? undefined : 'auto',
                  }}
                >
                  {diagnostic && <SubsystemDiagnosticToggle {...diagnostic} />}
                  {description && (
                    <button
                      type="button"
                      aria-expanded={descriptionOpen}
                      aria-label={
                        descriptionOpen ? 'Hide description' : 'Show description'
                      }
                      title={
                        descriptionOpen ? 'Hide description' : 'Show description'
                      }
                      onMouseEnter={() => setDescToggleHover(true)}
                      onMouseLeave={() => setDescToggleHover(false)}
                      onClick={() => setDescriptionOpen(!descriptionOpen)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        padding: 0,
                        border: 'none',
                        borderRadius: 4,
                        background: descriptionOpen || descToggleHover ? theme.colors.border : 'transparent',
                        color: descriptionOpen || descToggleHover ? theme.colors.text : muted,
                        cursor: 'pointer',
                      }}
                    >
                      <FileText size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {sidebarAfterDescription}
          </div>
        )}
        {hasFiles ? (
          <ul
            role="tree"
            aria-label="Files"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '6px 8px 12px',
              overflowY: 'auto',
              flex: 1,
              minHeight: 0,
            }}
          >
            {renderTree(fileTree, 0)}
          </ul>
        ) : (
          <p
            style={{
              margin: 0,
              padding: '12px 16px',
              color: muted,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[0],
            }}
          >
            No files in this model.
          </p>
        )}
      </aside>
      <div
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {description && descriptionOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3,
              display: 'flex',
              flexDirection: 'column',
              background: theme.colors.background,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                  fontSize: theme.fontSizes[1],
                  fontWeight: 600,
                  fontFamily: theme.fonts.monospace,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: theme.colors.textSecondary ?? muted,
                }}
              >
                Overview
              </h3>
              <button
                type="button"
                aria-label="Close description"
                title="Close"
                onClick={() => setDescriptionOpen(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  padding: 0,
                  border: 'none',
                  borderRadius: 4,
                  background: 'transparent',
                  color: muted,
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                padding: 16,
                fontSize: theme.fontSizes[0],
                lineHeight: 1.5,
              }}
            >
              <IndustryMarkdownSlide
                content={description}
                slideIdPrefix="constructs-desc-overlay"
                slideIndex={0}
                isVisible
                theme={theme}
                disableScroll
                disableBasePadding
                enableKeyboardScrolling={false}
                autoFocusOnVisible={false}
              />
            </div>
          </div>
        )}
        {searchActive && (
          <div style={{ flexShrink: 0, padding: '12px 16px 0' }}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search constructs…"
              aria-label="Search constructs"
              data-testid="construct-search"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 6,
                background: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[1],
                outline: 'none',
              }}
            />
          </div>
        )}
        <div
          data-testid="construct-signature"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {searchResults.length > 0 ? (
            repoGroups.map((group) => (
              <div
                key={group.key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {group.logo && (
                    <img
                      src={group.logo}
                      alt=""
                      width={18}
                      height={18}
                      style={{ borderRadius: 4, flexShrink: 0 }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span
                    style={{
                      color: theme.colors.textSecondary ?? muted,
                      fontFamily: theme.fonts.body,
                      fontSize: theme.fontSizes[1],
                    }}
                  >
                    {group.label}
                  </span>
                </div>
                {splitByFileRun(group.items).map((run) => {
                  const lead = run[0]!;
                  const hasFile = !!lead.file;
                  const isExternal = lead.construct === 'external';
                  // File-backed runs and externals both get a header; externals
                  // name their kind instead of a path, so the body doesn't have
                  // to spell it out.
                  const showHeader = hasFile || isExternal;
                  const runKey = `${group.key}:${lead.file || lead.alias}`;
                  const runHasPurpose = run.some((c) => !!c.purpose?.trim());
                  const purposeOpen = purposeOverrides[runKey] ?? isExternal;
                  const runFileOpen =
                    drawer != null && hasFile && lead.file === drawer.file;
                  return (
                    <div
                      key={runKey}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        border: `1px solid ${runFileOpen ? accentColor : theme.colors.border}`,
                        borderRadius: 8,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {showHeader && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 10px',
                            borderBottom: `1px solid ${
                              runFileOpen ? accentColor : theme.colors.border
                            }`,
                            background: runFileOpen
                              ? `${accentColor}14`
                              : theme.colors.backgroundSecondary ??
                                theme.colors.background,
                            color: runFileOpen
                              ? accentColor
                              : theme.colors.textSecondary ?? muted,
                            fontFamily: theme.fonts.monospace,
                            fontSize: theme.fontSizes[0],
                          }}
                        >
                          {isExternal ? (
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <Box size={12} style={{ flexShrink: 0 }} />
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                external
                              </span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              title={fileViewer ? `Open ${lead.file}` : lead.file}
                              onClick={
                                fileViewer
                                  ? () => onOpenFile(lead.file)
                                  : undefined
                              }
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flex: 1,
                                minWidth: 0,
                                padding: 0,
                                border: 'none',
                                background: 'transparent',
                                color: 'inherit',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                textAlign: 'left',
                                cursor: fileViewer ? 'pointer' : 'default',
                              }}
                            >
                              <FileText size={12} style={{ flexShrink: 0 }} />
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {lead.file}
                              </span>
                            </button>
                          )}
                          {runHasPurpose && (
                            <button
                              type="button"
                              title={
                                purposeOpen ? 'Hide description' : 'Show description'
                              }
                              aria-label={
                                purposeOpen ? 'Hide description' : 'Show description'
                              }
                              aria-expanded={purposeOpen}
                              onClick={() => setPurposeOpen(runKey, !purposeOpen)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                width: 20,
                                height: 20,
                                padding: 0,
                                border: 'none',
                                borderRadius: 4,
                                background: 'transparent',
                                color: purposeOpen
                                  ? accentColor
                                  : theme.colors.textSecondary ?? muted,
                                cursor: 'pointer',
                              }}
                            >
                              <AlignLeft size={13} />
                            </button>
                          )}
                        </div>
                      )}
                      {run.map((c, i) => {
                        // File-level: every declaration sharing the open file
                        // shows the indicator. Line-level: only the declaration
                        // actually highlighted gets the inner accent ring.
                        const fileOpen =
                          drawer != null && !!c.file && c.file === drawer.file;
                        const lineOpen =
                          fileOpen &&
                          drawer.startLine != null &&
                          c.declarationRef?.startLine === drawer.startLine;
                        // A combined header owns the path, so declarations under
                        // it drop their own badge; those with no known line just
                        // render unnumbered. Without a header, keep the badge.
                        const numbered =
                          hasFile && c.declarationRef?.startLine != null;
                        // The header names the external kind, so the body just
                        // names the construct.
                        const isExt = c.construct === 'external';
                        return (
                          <div
                            key={c.alias}
                            id={`construct-signature-${c.alias}`}
                            style={{
                              borderTop:
                                i > 0
                                  ? `1px solid ${theme.colors.border}`
                                  : undefined,
                              boxShadow: lineOpen
                                ? `inset 0 0 0 1px ${accentColor}`
                                : undefined,
                            }}
                          >
                            <ComponentDeclaration
                              component={c}
                              onOpenFile={fileViewer ? onOpenFile : undefined}
                              defaultShowFile={showHeader ? false : !!fileViewer}
                              onRelatedSelect={onRelatedSelect}
                              onInspectSymbol={
                                onInspectSymbol
                                  ? (symbol, ref) =>
                                      onInspectSymbol({
                                        purl: c.purl,
                                        file: c.file,
                                        symbol,
                                        ref,
                                      })
                                  : undefined
                              }
                              fileOpen={fileOpen}
                              declarationOpen={lineOpen}
                              showRepoIdentity={false}
                              fileBadgeChrome={showHeader ? false : !!fileViewer}
                              hideActions={showHeader}
                              externalName={isExt}
                              showPurpose={showHeader ? purposeOpen : undefined}
                              lineNumbers={numbered}
                              verification={
                                componentVerification && focusedAlias === c.alias
                                  ? componentVerification
                                  : undefined
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p
              style={{
                margin: 0,
                color: muted,
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[1],
              }}
            >
              {searchQuery.trim()
                ? `No constructs match “${searchQuery.trim()}”.`
                : 'No constructs in this model.'}
            </p>
          )}
        </div>
        <FileDrawer
          title={drawer?.file ?? null}
          onClose={() => setDrawer(null)}
          fillHeight={drawer != null && drawer.startLine == null}
        >
          {drawer ? (
            <FileDrawerContent
              render={renderDrawerContent}
              file={drawer.file}
              startLine={drawer.startLine}
            />
          ) : null}
        </FileDrawer>
      </div>
    </div>
  );
}
