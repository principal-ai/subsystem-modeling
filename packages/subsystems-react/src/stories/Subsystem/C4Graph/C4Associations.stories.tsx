import React, { useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4Graph } from '../../../subsystem/C4Graph';
import { toC4, type C4View } from '../../../subsystem/toC4';
import type { C4Association } from '../../../subsystem/toC4';
import { summarizeAssociations, mergeAssociations } from '../../../subsystem/c4Associations';
import { c4FixtureModel, c4MemberCounts } from './c4Fixture';
import { c4Associations, C4_MERGE_CANDIDATES, C4_CONCERNS } from './c4Associations.fixture';

const MEMBER_COUNTS = new Map(Object.entries(c4MemberCounts));

const meta = {
  title: 'Subsystem/C4Graph/C4Associations',
  component: C4Graph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4Graph>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * C4 associations — the confirmed layer over a raw derivation.
 *
 * `toC4()` alone rolls components up into boxes keyed by `process`. That
 * derivation is a guess: two keys may be the same deployable, a library may be
 * pretending to be a container, and a store may not be a C4 data store at all.
 *
 * This story starts from a real composite of 40 stored models and lets you act
 * on the 13 proposed associations:
 *
 *   accept   the box goes solid — it is part of the architecture
 *   reject   the box disappears, and so do the edges into it
 *   merge    two keys collapse into one box
 *
 * Try `merge host` first: it takes `subsystems-studio/host` (113 components)
 * and `principal-studio/host` (1 component) and folds them into one container.
 */

function Demo({ initialAccepted = [] as string[] }: { initialAccepted?: string[] }) {
  const [view, setView] = useState<C4View>('container');
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, C4Association['state']>>(() =>
    Object.fromEntries(initialAccepted.map((id) => [id, 'accepted' as const])),
  );
  /** Roles the user has merged. Folds the candidates into one association each. */
  const [mergedRoles, setMergedRoles] = useState<string[]>([]);

  const associations = useMemo<C4Association[]>(() => {
    let set: C4Association[] = c4Associations;
    for (const role of mergedRoles) {
      const candidate = C4_MERGE_CANDIDATES.find((c) => c.role === role);
      if (!candidate) continue;
      // The evidence-heavy side survives automatically — see mergeAssociations.
      set = mergeAssociations(set, candidate.keys, undefined, MEMBER_COUNTS);
    }
    // Apply the user's accept/reject last, over the merged set.
    return set.map((a) => ({ ...a, state: state[a.id] ?? a.state }));
  }, [state, mergedRoles]);

  const model = useMemo(
    () => toC4(c4FixtureModel, { view, systemLabel: 'Subsystem Modeling', associations }),
    [view, associations],
  );

  const stats = useMemo(() => summarizeAssociations(model, associations), [model, associations]);

  const concernsFor = (id: string) => {
    const a = associations.find((x) => x.id === id);
    if (!a) return [];
    return C4_CONCERNS.filter((c) => a.sourceKeys.includes(c.target));
  };

  const decide = (id: string, next: C4Association['state']) =>
    setState((prev) => ({ ...prev, [id]: next }));

  const reset = () => {
    setState({});
    setMergedRoles([]);
  };

  const button = (label: string, value: C4View) => (
    <button
      type="button"
      onClick={() => setView(value)}
      style={{
        fontFamily: 'monospace',
        fontSize: 12,
        padding: '2px 10px',
        borderRadius: 4,
        cursor: 'pointer',
        border: '1px solid #555',
        background: view === value ? '#1D9E75' : 'transparent',
        color: view === value ? '#020B12' : '#ddd',
      }}
    >
      {label}
    </button>
  );

  const act = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: 'monospace',
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        cursor: 'pointer',
        border: '1px solid #555',
        background: 'transparent',
        color: '#ddd',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#12141a' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <C4Graph model={model} title="Subsystem Modeling" onSelectNode={setSelected} />
      </div>

      <div
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          gap: 18,
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#aaa',
          borderTop: '1px solid #333',
        }}
      >
        <div style={{ minWidth: 210 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {button('container', 'container')}
            {button('component', 'component')}
          </div>
          <div>
            {stats.confirmed} confirmed · {stats.proposed} proposed
          </div>
          <div>{stats.rejected} rejected · {stats.mergedAway} keys merged away</div>
          <div style={{ color: stats.missingTechnology > 0 ? '#e8a33a' : '#5a5' }}>
            {stats.missingTechnology} containers missing technology
          </div>
          <div>{stats.needsDecision} still need a decision</div>
          <div style={{ marginTop: 8 }}>{act('reset', reset)}</div>
        </div>

        {/* The merge question, with one click to try it. */}
        <div style={{ minWidth: 300, maxWidth: 340 }}>
          <div style={{ color: '#ddd', marginBottom: 4 }}>MERGE CANDIDATES</div>
          {C4_MERGE_CANDIDATES.map((c) => {
            const done = mergedRoles.includes(c.role);
            // Show which side the evidence will keep, before you click.
            const heaviest = c.keys.reduce((a, b) =>
              (c4MemberCounts[b] ?? 0) > (c4MemberCounts[a] ?? 0) ? b : a,
            );
            return (
              <div key={c.role} style={{ marginBottom: 8 }}>
                {c.keys.map((k) => (
                  <div
                    key={k}
                    style={{
                      color: done && k === heaviest ? '#5a5' : '#888',
                      lineHeight: 1.35,
                      fontWeight: done && k === heaviest ? 600 : 400,
                    }}
                  >
                    {k} · {c4MemberCounts[k] ?? 0}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                  {done ? (
                    <>
                      <span style={{ color: '#5a5' }}>merged — kept {heaviest.split('/').pop()}</span>
                      {act('undo', () => setMergedRoles((prev) => prev.filter((r) => r !== c.role)))}
                    </>
                  ) : (
                    act(`merge ${c.role}`, () => setMergedRoles((prev) => [...prev, c.role]))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-association review. This is the surface a real confirm UI would use. */}
        <div style={{ flex: 1, minWidth: 380 }}>
          <div style={{ color: '#ddd', marginBottom: 4 }}>
            ASSOCIATIONS · {associations.length}
          </div>
          {associations.map((a) => {
            const s = state[a.id] ?? a.state;
            const concerns = concernsFor(a.id);
            const missing: string[] = [];
            if (!a.technology) missing.push('technology');
            if (!a.description) missing.push('description');
            return (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '4px 0',
                  borderBottom: '1px solid #222',
                  opacity: s === 'rejected' ? 0.45 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#ddd' }}>
                    {a.label}
                    <span style={{ color: s === 'accepted' ? '#5a5' : s === 'proposed' ? '#e8a33a' : '#888' }}>
                      {' '}
                      · {s} · {a.type}
                    </span>
                  </div>
                  <div style={{ color: '#777', fontSize: 11 }}>
                    keys: {a.sourceKeys.join(', ')}
                    {a.technology ? ` · tech: ${a.technology}` : ''}
                    {missing.length > 0 ? ` · needs ${missing.join(' + ')}` : ''}
                  </div>
                  {concerns.length > 0 && (
                    <div style={{ color: '#c96', fontSize: 11, lineHeight: 1.35 }}>
                      {concerns.map((c) => (
                        <div key={c.kind + c.target}>⚠ {c.message}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {act('accept', () => decide(a.id, 'accepted'))}
                  {act('reject', () => decide(a.id, 'rejected'))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ minWidth: 130, fontSize: 11, color: '#777' }}>
          <div>selected: {selected ?? '(none)'}</div>
          <div style={{ marginTop: 6 }}>solid = confirmed</div>
          <div>dashed = proposed</div>
          <div>muted = unconfirmed</div>
        </div>
      </div>
    </div>
  );
}

export const Associations: Story = {
  render: () => <Demo />,
};

/** Start from a half-confirmed state so the visual difference is obvious. */
export const PartiallyConfirmed: Story = {
  render: () => <Demo initialAccepted={['container:subsystems-studio/host', 'container:subsystems-studio/renderer']} />,
};