/**
 * ConstructsCatalog — master/detail for a constructs-only subsystem
 * (components, no topology or walkthrough edges).
 *
 * Left: the model's constructs as a toggle list. Right: signatures for
 * every construct currently on (`ComponentDeclaration`, stacked). File
 * opens still use the bottom FileDrawer when the host injects a viewer.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import {
  constructBadgeColor,
  constructBadgeLabel,
  deriveNameFromSymbol,
  formatPurl,
  type SubsystemComponent,
} from './model';
import type { SubsystemOpenFileOptions } from './declarationRef';
import { ComponentDeclaration } from './ComponentDeclaration';
import type { ComponentVerificationState } from './ComponentDeclaration';
import { SubsystemDiagnosticToggle, type SubsystemDiagnostic } from './DiagnosticToggle';
import { FileDrawer } from './FileDrawer';
import { componentColor } from '../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';

export interface ConstructsCatalogProps {
  components: SubsystemComponent[];
  onSelect?: (componentId: string) => void;
  title?: string;
  hideSidebar?: boolean;
  description?: string;
  diagnostic?: SubsystemDiagnostic;
  sidebarExtra?: ReactNode;
  sidebarAfterDescription?: ReactNode;
  renderFileViewer?: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  renderFileView?: (component: SubsystemComponent) => ReactNode;
  onFileSelect?: (file: string) => void;
  onVerifyComponent?: (componentId: string) => void;
  componentVerification?: ComponentVerificationState | null;
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
      c.id === clean ||
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

export function ConstructsCatalog({
  components,
  onSelect,
  title,
  hideSidebar,
  description,
  diagnostic,
  sidebarExtra,
  sidebarAfterDescription,
  renderFileViewer,
  renderFileView,
  onFileSelect,
  onVerifyComponent,
  componentVerification,
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

  const [visibleIds, setVisibleIds] = useState<string[]>(() =>
    orderedComponents[0] ? [orderedComponents[0].id] : [],
  );
  const [focusedId, setFocusedId] = useState<string | null>(
    () => orderedComponents[0]?.id ?? null,
  );
  const [descriptionVisible, setDescriptionVisible] = useState(false);
  const [descToggleHover, setDescToggleHover] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'constructs' | 'files'>('files');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [drawer, setDrawer] = useState<{ file: string; startLine?: number } | null>(
    null,
  );
  const focusedRef = useRef<string | null>(focusedId);
  focusedRef.current = focusedId;

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const visibleComponents = useMemo(
    () => orderedComponents.filter((c) => visibleSet.has(c.id)),
    [orderedComponents, visibleSet],
  );

  const fileTree = useMemo(() => buildFileTree(orderedComponents), [orderedComponents]);
  const hasFiles = useMemo(
    () => orderedComponents.some((c) => !!c.file),
    [orderedComponents],
  );
  const effectiveTab = hasFiles ? sidebarTab : 'constructs';

  // Group visible declarations by purl so the repo/app identity (logo + name)
  // renders once per group instead of on every card.
  const repoGroups = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      logo?: string;
      items: SubsystemComponent[];
    }> = [];
    const index = new Map<string, number>();
    for (const c of visibleComponents) {
      const key = c.purl || c.id;
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
  }, [visibleComponents]);

  useEffect(() => {
    if (!focusedId) return;
    document.getElementById(`construct-${focusedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  useEffect(() => {
    const last = visibleIds[visibleIds.length - 1];
    if (!last) return;
    document
      .getElementById(`construct-signature-${last}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [visibleIds]);

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
      .getElementById(`construct-signature-${match.id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [orderedComponents, drawer]);

  // Drop ids that left the model; if nothing remains, show the first construct.
  useEffect(() => {
    const ids = new Set(orderedComponents.map((c) => c.id));
    setVisibleIds((prev) => {
      const next = prev.filter((id) => ids.has(id));
      if (next.length > 0 || orderedComponents.length === 0) return next;
      return [orderedComponents[0]!.id];
    });
    setFocusedId((prev) => {
      if (prev && ids.has(prev)) return prev;
      return orderedComponents[0]?.id ?? null;
    });
  }, [orderedComponents]);

  const toggle = useCallback(
    (id: string) => {
      setFocusedId(id);
      setVisibleIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      onSelect?.(id);
    },
    [onSelect],
  );

  const show = useCallback(
    (id: string) => {
      setFocusedId(id);
      setVisibleIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      onSelect?.(id);
    },
    [onSelect],
  );

  const focusAt = useCallback(
    (id: string) => {
      setFocusedId(id);
    },
    [],
  );

  const toggleFolder = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  /** File-tree click: show every construct declared in the file, or hide them
   *  all when they're already shown — mirroring a construct row toggle. */
  const toggleFile = useCallback(
    (comps: SubsystemComponent[]) => {
      const ids = comps.map((c) => c.id);
      setVisibleIds((prev) => {
        const set = new Set(prev);
        const allVisible = ids.every((id) => set.has(id));
        ids.forEach((id) => (allVisible ? set.delete(id) : set.add(id)));
        return orderedComponents.filter((c) => set.has(c.id)).map((c) => c.id);
      });
      const first = comps[0];
      if (first) {
        setFocusedId(first.id);
        onSelect?.(first.id);
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
        const ids = child.components.map((c) => c.id);
        const allVisible = ids.length > 0 && ids.every((id) => visibleSet.has(id));
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
                {ids.length}
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
      show(comp.id);
    },
    [components, show],
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

  const moveFocus = useCallback(
    (delta: number) => {
      if (orderedComponents.length === 0) return;
      const idx = Math.max(
        0,
        orderedComponents.findIndex((c) => c.id === focusedRef.current),
      );
      const next =
        orderedComponents[
          (idx + delta + orderedComponents.length) % orderedComponents.length
        ]!;
      focusAt(next.id);
    },
    [orderedComponents, focusAt],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (orderedComponents[0]) focusAt(orderedComponents[0].id);
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = orderedComponents[orderedComponents.length - 1];
        if (last) focusAt(last.id);
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (focusedRef.current) {
          e.preventDefault();
          toggle(focusedRef.current);
        }
      } else if (e.key === 'Escape' && drawer) {
        setDrawer(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedComponents, drawer, moveFocus, focusAt, toggle]);

  const showChrome =
    !hideSidebar &&
    !!(title || description || diagnostic || sidebarExtra || sidebarAfterDescription);
  const showDesc = !!description && descriptionVisible;

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
              flex: showDesc ? '0 0 auto' : undefined,
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
                      aria-expanded={descriptionVisible}
                      aria-label={
                        descriptionVisible ? 'Hide description' : 'Show description'
                      }
                      title={
                        descriptionVisible ? 'Hide description' : 'Show description'
                      }
                      onMouseEnter={() => setDescToggleHover(true)}
                      onMouseLeave={() => setDescToggleHover(false)}
                      onClick={() => setDescriptionVisible((v) => !v)}
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
                        background: descriptionVisible || descToggleHover ? theme.colors.border : 'transparent',
                        color: descriptionVisible || descToggleHover ? theme.colors.text : muted,
                        cursor: 'pointer',
                      }}
                    >
                      <FileText size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {showDesc && (
              <div style={{ fontSize: theme.fontSizes[0], lineHeight: 1.5 }}>
                <IndustryMarkdownSlide
                  content={description!}
                  slideIdPrefix="constructs-desc"
                  slideIndex={0}
                  isVisible={true}
                  theme={theme}
                  disableScroll={true}
                  disableBasePadding
                  enableKeyboardScrolling={false}
                  autoFocusOnVisible={false}
                />
              </div>
            )}
            {sidebarAfterDescription}
          </div>
        )}
        <div
          role="tablist"
          aria-label="Sidebar view"
          style={{
            display: 'flex',
            width: '100%',
            flexShrink: 0,
            borderBottom: `1px solid ${theme.colors.border}`,
            background:
              theme.colors.backgroundSecondary ?? theme.colors.background,
          }}
        >
          {(['files', 'constructs'] as const).map((tab) => {
            if (tab === 'files' && !hasFiles) return null;
            const active = effectiveTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSidebarTab(tab)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '8px 8px',
                  border: 'none',
                  borderRadius: 0,
                  background: active
                    ? theme.colors.background
                    : 'transparent',
                  color: active ? theme.colors.text : muted,
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts.monospace,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {tab === 'constructs' ? 'Constructs' : 'Files'}
              </button>
            );
          })}
        </div>
        {effectiveTab === 'constructs' ? (
        <ul
          role="listbox"
          aria-label="Constructs"
          aria-multiselectable="true"
          aria-activedescendant={focusedId ? `construct-${focusedId}` : undefined}
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '0 8px 12px',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {orderedComponents.map((c) => {
            const visible = visibleSet.has(c.id);
            const focused = c.id === focusedId;
            const color = componentColor(c, pierreTheme);
            const badgeColor = constructBadgeColor(c) ?? color;
            const badgeLabel = constructBadgeLabel(c);
            const displayName = deriveNameFromSymbol(
              c.symbol,
              c.construct,
              c.name,
              c.file,
              c.stereotype,
            );
            const rowOpen =
              drawer != null &&
              drawer.startLine != null &&
              !!c.file &&
              c.file === drawer.file &&
              c.declarationRef?.startLine === drawer.startLine;
            const hovered = hoveredRow === c.id;
            return (
              <li key={c.id} role="presentation">
                <button
                  type="button"
                  id={`construct-${c.id}`}
                  role="option"
                  aria-selected={visible}
                  data-testid={`construct-row-${c.id}`}
                  onClick={() => toggle(c.id)}
                  onMouseEnter={() => setHoveredRow(c.id)}
                  onMouseLeave={() =>
                    setHoveredRow((h) => (h === c.id ? null : h))
                  }
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 2,
                    width: '100%',
                    margin: '2px 0',
                    padding: '8px 10px 8px 12px',
                    textAlign: 'left',
                    border: 'none',
                    borderRadius: 6,
                    background: hovered
                      ? theme.colors.border
                      : visible
                        ? theme.colors.background
                        : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 100ms ease, opacity 100ms ease',
                    boxShadow: [
                      visible ? `inset 0 0 0 1px ${theme.colors.border}` : null,
                      rowOpen ? `inset 2px 0 0 ${accentColor}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || undefined,
                    outline: focused && !visible ? `1px dotted ${muted}` : undefined,
                    outlineOffset: -1,
                    opacity: visible ? 1 : hovered ? 1 : 0.72,
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: theme.fonts.monospace,
                        fontSize: theme.fontSizes[1],
                        color,
                        fontWeight: visible ? 600 : 500,
                      }}
                    >
                      {displayName}
                    </span>
                  </span>
                  {badgeLabel && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: theme.fonts.monospace,
                          fontSize: theme.fontSizes[0],
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          color: badgeColor,
                        }}
                      >
                        {badgeLabel}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        ) : (
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
        )}
      </aside>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
          {visibleComponents.length > 0 ? (
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
                {group.items.map((c) => {
                  // File-level: every declaration sharing the open file shows the
                  // indicator. Line-level: only the declaration actually being
                  // highlighted gets the accent border.
                  const fileOpen = drawer != null && !!c.file && c.file === drawer.file;
                  const lineOpen =
                    fileOpen &&
                    drawer.startLine != null &&
                    c.declarationRef?.startLine === drawer.startLine;
                  return (
                    <div
                      key={c.id}
                      id={`construct-signature-${c.id}`}
                      style={{
                        border: `1px solid ${lineOpen ? accentColor : theme.colors.border}`,
                        boxShadow: lineOpen ? `0 0 0 1px ${accentColor}` : undefined,
                        borderRadius: 8,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <ComponentDeclaration
                        component={c}
                        onOpenFile={fileViewer ? onOpenFile : undefined}
                        defaultShowFile={!!fileViewer}
                        onRelatedSelect={onRelatedSelect}
                        onVerify={onVerifyComponent}
                        fileOpen={fileOpen}
                        declarationOpen={lineOpen}
                        showRepoIdentity={false}
                        fileBadgeChrome={!!fileViewer}
                        verification={
                          componentVerification && focusedId === c.id
                            ? componentVerification
                            : undefined
                        }
                      />
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
              Toggle constructs on the left to show their signatures.
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
