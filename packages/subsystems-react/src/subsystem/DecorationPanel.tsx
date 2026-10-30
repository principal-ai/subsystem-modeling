/**
 * DecorationPanel — the reading surface for one `SubsystemDecoration`.
 *
 * A decoration is an additive, unverified layer over one or more subsystem
 * models: markdown prose, an ordered list of trails (each naming its own
 * model), and optional draft structure. This panel is the container's own
 * surface — it deliberately does not render the graph. Selecting a trail (or
 * a draft component) is handed back to the host, which decides whether to
 * focus a model, open a tab, or overlay the draft.
 *
 * Nothing here writes: the first prototype is read-only plus an on/off toggle.
 */

import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Box, Eye, EyeOff, Network, Route, Sparkles } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import type { C4Edge } from './c4';
import {
  decorationTrailId,
  groupDecorationTrailsByModel,
  type DecorationDraftComponent,
  type DecorationDraftC4Element,
  type DecorationTrailRef,
  type SubsystemDecoration,
} from './decoration';

export interface DecorationPanelTrailMeta {
  title: string;
  stepCount?: number;
}

export type DecorationPanelSelection =
  | { kind: 'c4'; id: string }
  | { kind: 'c4-edge'; id: string }
  | { kind: 'component'; alias: string };

export interface DecorationPanelProps {
  decoration: SubsystemDecoration;
  /** Whether the decoration overlay is currently on. */
  active: boolean;
  onToggleActive: (active: boolean) => void;
  /** Hide when the host renders DecorationHeader above the sidebar and graph. */
  hideHeader?: boolean;
  /** Click a trail row. The host focuses the owning model/trail. */
  onSelectTrail?: (ref: DecorationTrailRef) => void;
  /** Click a draft component. Omit to render the draft list read-only. */
  onSelectDraftComponent?: (component: DecorationDraftComponent) => void;
  /** Click a draft C4 box. The host can open its container and focus it. */
  onSelectDraftC4Element?: (element: DecorationDraftC4Element) => void;
  /** Click a draft C4 relationship. The host reveals its endpoints and selects the line. */
  onSelectDraftC4Edge?: (edge: C4Edge) => void;
  /** Controlled row selection, shared with the host's graph focus. */
  selectedDraftItem?: DecorationPanelSelection | null;
  /**
   * Resolve a base trail's display title/step count from its owning model.
   * Draft trails carry their content inline and need no resolver.
   */
  resolveTrail?: (ref: DecorationTrailRef) => DecorationPanelTrailMeta | undefined;
  /** Friendly model names, keyed by `modelId`. Falls back to the id. */
  modelLabels?: ReadonlyMap<string, string>;
  /** Friendly names for existing C4 endpoints. Draft elements resolve from the decoration. */
  c4ElementLabels?: ReadonlyMap<string, string>;
}

export interface DecorationHeaderProps {
  decoration: Pick<SubsystemDecoration, 'title'>;
  active: boolean;
  onToggleActive: (active: boolean) => void;
  actions?: ReactNode;
}

/** Shared title and toggle, usable above the whole canvas or within the panel. */
export function DecorationHeader({
  decoration,
  active,
  onToggleActive,
  actions,
}: DecorationHeaderProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const accent = theme.colors.accent ?? theme.colors.primary ?? theme.colors.text;
  return (
    <header
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: theme.colors.background,
        color: theme.colors.text,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      <Sparkles size={15} strokeWidth={2} color={accent} aria-hidden />
      <h2
        style={{
          flex: 1,
          minWidth: 0,
          margin: 0,
          overflowWrap: 'anywhere',
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[2],
          fontWeight: theme.fontWeights.semibold,
        }}
      >
        {decoration.title}
      </h2>
      {actions}
      <button
        type="button"
        aria-pressed={active}
        aria-label={active ? 'Turn decoration off' : 'Turn decoration on'}
        title={active ? 'Turn decoration off' : 'Turn decoration on'}
        onClick={() => onToggleActive(!active)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          padding: '3px 8px',
          borderRadius: 4,
          border: `1px solid ${active ? accent : theme.colors.border}`,
          background: active ? `${accent}18` : 'transparent',
          color: active ? accent : muted,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          cursor: 'pointer',
        }}
      >
        {active ? <Eye size={12} strokeWidth={2} /> : <EyeOff size={12} strokeWidth={2} />}
        {active ? 'On' : 'Off'}
      </button>
    </header>
  );
}

export function DecorationPanel({
  decoration,
  active,
  onToggleActive,
  hideHeader = false,
  onSelectTrail,
  onSelectDraftComponent,
  onSelectDraftC4Element,
  onSelectDraftC4Edge,
  selectedDraftItem,
  resolveTrail,
  modelLabels,
  c4ElementLabels,
}: DecorationPanelProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const secondary = theme.colors.textSecondary ?? muted;
  const warning = theme.colors.warning ?? secondary;
  const accent = theme.colors.accent ?? theme.colors.primary ?? theme.colors.text;
  const proposedTrails = decoration.trails.filter((ref) => ref.kind === 'draft');
  const contextTrails = decoration.trails.filter((ref) => ref.kind === 'base');
  const draftComponents = decoration.draft?.components ?? [];
  const draftEdges = decoration.draft?.edges ?? [];
  const draftC4Elements = decoration.draft?.c4?.elements ?? [];
  const draftC4Edges = decoration.draft?.c4?.edges ?? [];
  const c4Labels = new Map(c4ElementLabels);
  for (const element of draftC4Elements) c4Labels.set(element.id, element.label);
  const sectionLabel: CSSProperties = {
    fontFamily: theme.fonts.monospace,
    fontSize: theme.fontSizes[0],
    fontWeight: theme.fontWeights.semibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  function draftRowStyle(selected: boolean): CSSProperties {
    return {
      borderRadius: 4,
      padding: '6px 8px',
      background: selected ? theme.colors.backgroundSecondary : undefined,
      color: selected ? accent : theme.colors.text,
      fontWeight: selected ? theme.fontWeights.semibold : theme.fontWeights.body,
      transition: 'background 120ms ease, color 120ms ease',
    };
  }

  function renderTrails(title: string, trails: DecorationTrailRef[]) {
    if (trails.length === 0) return null;
    const groups = groupDecorationTrailsByModel(trails);
    return (
        <section
          aria-label={title}
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <div style={{ ...sectionLabel, color: secondary }}>
            {title} · {trails.length}
          </div>
          {groups.map((group) => (
            <div key={group.modelId}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  margin: '12px 0 3px',
                }}
              >
                <Network size={14} strokeWidth={2} color={secondary} aria-hidden />
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[1],
                    fontWeight: theme.fontWeights.semibold,
                    color: theme.colors.text,
                  }}
                >
                  {modelLabels?.get(group.modelId) ?? group.modelId}
                </span>
              </div>
              {group.trails.map((ref) => {
                const meta = resolveTrail?.(ref);
                const title =
                  meta?.title ??
                  (ref.kind === 'draft' ? ref.trail.title : ref.trailId);
                const stepCount =
                  meta?.stepCount ??
                  (ref.kind === 'draft' ? ref.trail.steps.length : undefined);
                return (
                  <button
                    key={decorationTrailId(ref)}
                    type="button"
                    onClick={() => onSelectTrail?.(ref)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      minWidth: 0,
                      padding: '6px 6px 6px 0',
                      border: 'none',
                      borderRadius: 4,
                      background: 'transparent',
                      color: theme.colors.text,
                      textAlign: 'left',
                      cursor: onSelectTrail ? 'pointer' : 'default',
                    }}
                  >
                    <Route size={13} strokeWidth={2} color={muted} aria-hidden />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: theme.fonts.monospace,
                        fontSize: theme.fontSizes[1],
                      }}
                    >
                      {title}
                    </span>
                    {ref.kind === 'draft' && (
                      <span
                        style={{
                          flexShrink: 0,
                          padding: '1px 5px',
                          borderRadius: 3,
                          border: `1px solid ${warning}`,
                          color: warning,
                          fontFamily: theme.fonts.monospace,
                          fontSize: theme.fontSizes[0],
                        }}
                      >
                        draft
                      </span>
                    )}
                    {stepCount != null && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontFamily: theme.fonts.monospace,
                          fontSize: theme.fontSizes[0],
                          color: secondary,
                        }}
                      >
                        {stepCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </section>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      {!hideHeader && (
        <DecorationHeader decoration={decoration} active={active} onToggleActive={onToggleActive} />
      )}
      <style>{`
        .subsystem-decoration-draft-row {
          background: transparent;
        }
        .subsystem-decoration-draft-row:hover {
          background: color-mix(in srgb, currentColor 8%, transparent);
        }
      `}</style>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 18px' }}>
        {decoration.description && (
          <div style={{ fontSize: theme.fontSizes[1], lineHeight: theme.lineHeights.body }}>
            <IndustryMarkdownSlide
              content={decoration.description}
              slideIdPrefix={`decoration-${decoration.id}`}
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

        {renderTrails('Proposed flows', proposedTrails)}

        {(draftComponents.length > 0 || draftEdges.length > 0 ||
          draftC4Elements.length > 0 || draftC4Edges.length > 0) && (
          <section style={{ marginTop: 18 }}>
            <div style={{ ...sectionLabel, color: secondary }}>
              Draft structure · not verified
            </div>
            {draftC4Elements.map((element) => (
              <button
                key={element.id}
                className="subsystem-decoration-draft-row"
                type="button"
                aria-current={selectedDraftItem?.kind === 'c4' && selectedDraftItem.id === element.id ? 'true' : undefined}
                onClick={() => onSelectDraftC4Element?.(element)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 6px 6px 0',
                  border: 'none',
                  color: theme.colors.text,
                  textAlign: 'left',
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[1],
                  cursor: onSelectDraftC4Element ? 'pointer' : 'default',
                  ...draftRowStyle(selectedDraftItem?.kind === 'c4' && selectedDraftItem.id === element.id),
                }}
              >
                <Network size={13} color={warning} aria-hidden />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {element.label}
                </span>
                <span style={{ color: secondary, fontSize: theme.fontSizes[0] }}>
                  C4 {element.kind}
                </span>
              </button>
            ))}
            {draftC4Edges.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...sectionLabel, color: secondary }}>
                  Draft C4 relationships · {draftC4Edges.length}
                </div>
                <ol
                  aria-label="Draft C4 relationships"
                  style={{
                    margin: '4px 0 8px',
                    paddingLeft: 22,
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.text,
                  }}
                >
                  {draftC4Edges.map((edge) => (
                    <li key={edge.id} style={{ padding: '2px 0', overflowWrap: 'anywhere' }}>
                      <button
                        type="button"
                        className="subsystem-decoration-draft-row"
                        aria-current={selectedDraftItem?.kind === 'c4-edge' && selectedDraftItem.id === edge.id ? 'true' : undefined}
                        onClick={() => onSelectDraftC4Edge?.(edge)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          width: '100%',
                          border: 'none',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          overflowWrap: 'anywhere',
                          cursor: onSelectDraftC4Edge ? 'pointer' : 'default',
                          ...draftRowStyle(selectedDraftItem?.kind === 'c4-edge' && selectedDraftItem.id === edge.id),
                        }}
                      >
                        <span>{edge.label}</span>
                        <span style={{ marginTop: 3, fontSize: theme.fontSizes[0], color: secondary }}>
                          {c4Labels.get(edge.source) ?? edge.source}
                          {' → '}
                          {c4Labels.get(edge.target) ?? edge.target}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {draftComponents.map((component) => (
              <button
                key={component.alias}
                className="subsystem-decoration-draft-row"
                type="button"
                aria-current={selectedDraftItem?.kind === 'component' && selectedDraftItem.alias === component.alias ? 'true' : undefined}
                onClick={() => onSelectDraftComponent?.(component)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minWidth: 0,
                  padding: '6px 6px 6px 0',
                  border: 'none',
                  borderRadius: 4,
                  color: theme.colors.text,
                  textAlign: 'left',
                  cursor: onSelectDraftComponent ? 'pointer' : 'default',
                  ...draftRowStyle(selectedDraftItem?.kind === 'component' && selectedDraftItem.alias === component.alias),
                }}
              >
                <Box size={13} strokeWidth={2} color={muted} aria-hidden />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: theme.fonts.monospace,
                    fontSize: theme.fontSizes[1],
                  }}
                >
                  {component.name}
                </span>
                {component.construct && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: theme.fonts.monospace,
                      fontSize: theme.fontSizes[0],
                      color: secondary,
                    }}
                  >
                    {component.construct}
                  </span>
                )}
              </button>
            ))}
            {draftEdges.length > 0 && (
              <div
                style={{
                  marginTop: 4,
                  fontFamily: theme.fonts.monospace,
                  fontSize: theme.fontSizes[0],
                  color: secondary,
                }}
              >
                + {draftEdges.length} draft edge{draftEdges.length === 1 ? '' : 's'}
              </div>
            )}
          </section>
        )}
        {renderTrails('Context trails', contextTrails)}
      </div>
    </div>
  );
}
