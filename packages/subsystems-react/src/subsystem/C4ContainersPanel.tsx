/**
 * C4ContainersPanel — sidebar overview of a C4 diagram's containers.
 *
 * The C4 counterpart to the subsystem graph's `ContainersPanel`: one row per
 * container and a bulk open/close header. A row behaves as a dropdown —
 * selecting it toggles the container's internals on the canvas and frames it,
 * with a chevron showing the open state. A container with no components is
 * select-only: it frames the box without a dropdown.
 *
 * The panel is pure chrome — the view owns the open set and the camera focus,
 * exactly as `SubsystemComponentGraph` owns its frame state.
 */

import { useTheme } from '@principal-ade/industry-theme';
import { ChevronRight, Component, Database, AppWindow } from 'lucide-react';
import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import type { C4Component, C4Container } from './c4';
import { nodeKindIcon, nodeStyle, nodeTechnology } from './C4NodeCard';
import { TechMark, technologyBrand } from './techIcons';

/** One row height for containers and their members, so the dropdown stays tabular. */
const ROW_HEIGHT = 38;

export interface C4ContainerListItem {
  /** Element id — the container the canvas toggles and frames. */
  container: C4Container;
  /** Drawn with its internals laid out. */
  open: boolean;
  /** The authored C4 components inside this container, in model order. */
  members: readonly C4Component[];
}

export interface C4ContainersPanelProps {
  containers: readonly C4ContainerListItem[];
  /** The container last activated from this list. */
  activeId?: string | null;
  /** Toggle a container's internals and frame it. */
  onActivate: (id: string) => void;
  /** Frame a container that has nothing to expand. */
  onSelect: (id: string) => void;
  onOpenAll: () => void;
  onCloseAll: () => void;
}

export function C4ContainersPanel({
  containers,
  activeId,
  onActivate,
  onSelect,
  onOpenAll,
  onCloseAll,
}: C4ContainersPanelProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const anyOpen = containers.some((c) => c.open);
  const anyClosed = containers.some((c) => !c.open);
  const bulkStyle = (enabled: boolean): CSSProperties => ({
    padding: '2px 8px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 4,
    background: 'transparent',
    color: enabled ? theme.colors.textSecondary : muted,
    fontFamily: theme.fonts.monospace,
    fontSize: theme.fontSizes[0],
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5,
  });

  if (containers.length === 0) {
    return (
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>No containers.</div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <style>{`
        .c4-containers-row {
          background: transparent;
          transition: background 120ms ease;
        }
        .c4-containers-row:hover {
          background: color-mix(in srgb, currentColor 8%, transparent);
        }
        .c4-containers-row[data-active='true'] {
          background: color-mix(in srgb, currentColor 12%, transparent);
        }
        .c4-containers-row[data-active='true']:hover {
          background: color-mix(in srgb, currentColor 16%, transparent);
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: muted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {containers.length} {containers.length === 1 ? 'container' : 'containers'}
        </span>
        <button type="button" onClick={onOpenAll} disabled={!anyClosed} style={bulkStyle(anyClosed)}>
          Open all
        </button>
        <button type="button" onClick={onCloseAll} disabled={!anyOpen} style={bulkStyle(anyOpen)}>
          Close all
        </button>
      </div>
      <ul
        role="list"
        aria-label="Containers"
        style={{ listStyle: 'none', margin: 0, padding: '6px 0', overflow: 'auto', minHeight: 0 }}
      >
        {containers.map((item) => {
          const canToggle = item.members.length > 0;
          return (
            <Fragment key={item.container.id}>
              <ContainerRow
                item={item}
                active={item.container.id === activeId}
                canToggle={canToggle}
                onActivate={() =>
                  canToggle
                    ? onActivate(item.container.id)
                    : onSelect(item.container.id)
                }
              />
              {item.open &&
                item.members.map((member) => (
                  <ContainerMemberRow key={member.id} component={member} />
                ))}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

function ContainerRow({
  item,
  active,
  canToggle,
  onActivate,
}: {
  item: C4ContainerListItem;
  active: boolean;
  canToggle: boolean;
  onActivate: () => void;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const { container, open } = item;
  const Icon = nodeKindIcon(container) ?? (container.containerKind === 'data-store' ? Database : AppWindow);
  const brand = technologyBrand(nodeTechnology(container) ?? container.containerKind);
  const proposed = container.state === 'proposed';

  return (
    <li
      className="c4-containers-row"
      data-active={active || undefined}
      style={
        {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: ROW_HEIGHT,
          boxSizing: 'border-box',
          padding: '0 12px',
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={onActivate}
        aria-current={active || undefined}
        aria-expanded={canToggle ? open : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: '18px minmax(0, 1fr) 12px',
          columnGap: 8,
          alignItems: 'center',
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: theme.colors.text,
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: theme.fonts.body,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gridColumn: 1,
            gridRow: 1,
          }}
        >
          {brand ? (
            <span aria-hidden style={{ display: 'inline-flex', transform: 'translateY(2px)' }}>
              <TechMark brand={brand} size={16} showTitle={false} />
            </span>
          ) : (
            <Icon size={16} color={theme.colors.textSecondary} aria-hidden />
          )}
        </span>
        <span
          style={{
            gridColumn: 2,
            gridRow: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: theme.fontSizes[2],
            fontWeight: 600,
            lineHeight: 1.35,
            minWidth: 0,
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {container.label}
          </span>
          {proposed && (
            <span
              style={{
                flexShrink: 0,
                padding: '0 4px',
                borderRadius: 3,
                border: '1px solid #e3b34166',
                color: '#e3b341',
                fontFamily: theme.fonts.monospace,
                fontSize: 9,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              proposed
            </span>
          )}
        </span>
        {canToggle && (
          <ChevronRight
            size={12}
            aria-hidden
            style={{
              gridColumn: 3,
              gridRow: 1,
              justifySelf: 'center',
              color: muted,
              transform: open ? 'rotate(90deg)' : undefined,
              transition: 'transform 120ms ease',
            }}
          />
        )}
      </button>
    </li>
  );
}

/** One authored component under an opened container — the dropdown's rows. */
function ContainerMemberRow({ component }: { component: C4Component }) {
  const { theme } = useTheme();
  const style = nodeStyle(component, theme);
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: ROW_HEIGHT,
        boxSizing: 'border-box',
        padding: '0 12px 0 28px',
        color: theme.colors.textSecondary,
      }}
    >
      <Component size={12} color={style.color} aria-hidden />
      <span
        style={{
          minWidth: 0,
          fontSize: theme.fontSizes[1],
          fontFamily: theme.fonts.body,
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {component.label}
      </span>
    </li>
  );
}
