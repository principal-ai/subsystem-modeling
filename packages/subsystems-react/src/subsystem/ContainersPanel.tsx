/**
 * Sidebar list of the graph's container frames — the process and package
 * regions drawn as container cards.
 *
 * One row per frame, nested the way the frames nest on the canvas. A row click
 * frames the container on the canvas; the trailing button opens or closes it
 * (members folded away into the card, or laid back out). The header's
 * "Open all" / "Close all" set every frame at once.
 */

import { useTheme } from '@principal-ade/industry-theme';
import { AppWindow, Component, Database, Maximize2, Minimize2, Package } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { SubsystemProcessRegion } from './model';
import { TechMark, technologyBrand } from './techIcons';

export interface ContainerListItem {
  /** Boundary group node id — what the canvas toggles and frames. */
  id: string;
  region: SubsystemProcessRegion;
  /** Drawn as a closed card. */
  collapsed: boolean;
  /** Nesting depth under other container frames (0 = top level). */
  depth: number;
  /** Frame colour as drawn on the canvas. */
  color: string;
}

export interface ContainersPanelProps {
  containers: readonly ContainerListItem[];
  /** The container last framed from this list. */
  activeId?: string | null;
  onFocus: (id: string) => void;
  onToggle: (id: string) => void;
  onOpenAll: () => void;
  onCloseAll: () => void;
}

export function ContainersPanel({
  containers,
  activeId,
  onFocus,
  onToggle,
  onOpenAll,
  onCloseAll,
}: ContainersPanelProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const anyOpen = containers.some((c) => !c.collapsed);
  const anyClosed = containers.some((c) => c.collapsed);
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
      <div style={{ padding: 16, color: theme.colors.textSecondary }}>No container frames.</div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
        {containers.map((c) => (
          <ContainerRow
            key={c.id}
            item={c}
            active={c.id === activeId}
            onFocus={() => onFocus(c.id)}
            onToggle={() => onToggle(c.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function ContainerRow({
  item,
  active,
  onFocus,
  onToggle,
}: {
  item: ContainerListItem;
  active: boolean;
  onFocus: () => void;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const { region, collapsed, depth, color } = item;
  const isPackage = region.kind === 'package' || region.chrome === 'package';
  const containerKind = region.containerKind ?? 'application';
  const Icon = isPackage ? Package : containerKind === 'data-store' ? Database : AppWindow;
  const brand = technologyBrand(region.technology);
  const topLabel = region.technology ?? (isPackage ? 'package' : containerKind);
  const ToggleIcon = collapsed ? Maximize2 : Minimize2;

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: `6px 12px 6px ${12 + depth * 16}px`,
        background: active ? theme.colors.backgroundSecondary : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={onFocus}
        title={region.description}
        aria-current={active || undefined}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
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
          aria-hidden
          style={{
            width: 3,
            alignSelf: 'stretch',
            borderRadius: 2,
            background: color,
            flexShrink: 0,
          }}
        />
        <Icon size={14} color={color} aria-hidden />
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontSize: theme.fontSizes[1],
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {region.label}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              color: muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            {brand && <TechMark brand={brand} size={10} />}
            <span>{topLabel}</span>
            <span aria-hidden>·</span>
            <Component size={10} aria-hidden />
            <span>{region.memberAliases.length}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? `Show members of ${region.label}` : `Hide members of ${region.label}`}
        aria-pressed={collapsed}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          padding: 0,
          flexShrink: 0,
          borderRadius: 4,
          border: `1px solid ${color}`,
          background: 'transparent',
          color,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        <ToggleIcon size={12} strokeWidth={2.25} />
      </button>
    </li>
  );
}
