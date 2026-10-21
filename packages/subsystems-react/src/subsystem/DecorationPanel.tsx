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

import type { CSSProperties } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Box, Eye, EyeOff, Network, Route, Sparkles } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import {
  decorationTrailId,
  groupDecorationTrailsByModel,
  type DecorationDraftComponent,
  type DecorationTrailRef,
  type SubsystemDecoration,
} from './decoration';

export interface DecorationPanelTrailMeta {
  title: string;
  stepCount?: number;
}

export interface DecorationPanelProps {
  decoration: SubsystemDecoration;
  /** Whether the decoration overlay is currently on. */
  active: boolean;
  onToggleActive: (active: boolean) => void;
  /** Click a trail row. The host focuses the owning model/trail. */
  onSelectTrail?: (ref: DecorationTrailRef) => void;
  /** Click a draft component. Omit to render the draft list read-only. */
  onSelectDraftComponent?: (component: DecorationDraftComponent) => void;
  /**
   * Resolve a base trail's display title/step count from its owning model.
   * Draft trails carry their content inline and need no resolver.
   */
  resolveTrail?: (ref: DecorationTrailRef) => DecorationPanelTrailMeta | undefined;
  /** Friendly model names, keyed by `modelId`. Falls back to the id. */
  modelLabels?: ReadonlyMap<string, string>;
}

export function DecorationPanel({
  decoration,
  active,
  onToggleActive,
  onSelectTrail,
  onSelectDraftComponent,
  resolveTrail,
  modelLabels,
}: DecorationPanelProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const secondary = theme.colors.textSecondary ?? muted;
  const warning = theme.colors.warning ?? secondary;
  const accent = theme.colors.accent ?? theme.colors.primary ?? theme.colors.text;
  const groups = groupDecorationTrailsByModel(decoration.trails);
  const draftComponents = decoration.draft?.components ?? [];
  const draftEdges = decoration.draft?.edges ?? [];
  const sectionLabel: CSSProperties = {
    fontFamily: theme.fonts.monospace,
    fontSize: theme.fontSizes[0],
    fontWeight: theme.fontWeights.semibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

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
      <header
        style={{
          flexShrink: 0,
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        </div>
      </header>

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

        <section
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <div style={{ ...sectionLabel, color: secondary }}>
            Trails · {decoration.trails.length}
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

        {(draftComponents.length > 0 || draftEdges.length > 0) && (
          <section style={{ marginTop: 18 }}>
            <div style={{ ...sectionLabel, color: secondary }}>
              Draft structure · not verified
            </div>
            {draftComponents.map((component) => (
              <button
                key={component.alias}
                type="button"
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
                  background: 'transparent',
                  color: theme.colors.text,
                  textAlign: 'left',
                  cursor: onSelectDraftComponent ? 'pointer' : 'default',
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
      </div>
    </div>
  );
}
