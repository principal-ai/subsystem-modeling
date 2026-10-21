import React, { useCallback, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { Star } from 'lucide-react';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';
import {
  buildStepEmphasisMap,
  orphanedEmphasis,
  stepClaimKey,
  type StepEmphasisDocument,
  type StepEmphasisRecord,
} from '../../../subsystem/stepEmphasis';

/**
 * PROTOTYPE: step emphasis as a separate augmentation document.
 *
 * The point of the story is to make the *data model* concrete before the store
 * lands. The marks below live in story state, keyed by trail + claim
 * fingerprint — not on the portable `SubsystemTrail`. Reorder the steps or edit
 * a claim and watch what the keys do.
 */
const meta = {
  title: 'Canvases/Subsystem/Step emphasis',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Prototype for the focus-guidance augmentation: star a walkthrough step with a kind + optional note, stored separately from the model document.',
      },
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

const STORY_PURL = 'pkg:github/principal-ai/desktop-app';
const stepPurl = (file: string) => `${STORY_PURL}#${file}`;

const components: SubsystemComponent[] = [
  {
    alias: 'panel',
    name: 'DrawingsLeftPanel',
    construct: 'class',
    file: 'src/panels/DrawingsLeftPanel.tsx',
    purl: STORY_PURL,
    purpose: 'lists drawings; emits open/delete intents',
    symbol: 'DrawingsLeftPanel',
    process: 'draw-list',
  },
  {
    alias: 'host',
    name: 'useDrawingsHost',
    construct: 'function',
    file: 'src/hooks/useDrawingsHost.ts',
    purl: STORY_PURL,
    purpose: 'hosts drawing CRUD; dispatches to storage and shell',
    symbol: 'useDrawingsHost',
    process: 'draw-host',
  },
  {
    alias: 'storage',
    name: 'DrawingsStorage',
    construct: 'class',
    file: 'src/storage/drawingsStorage.ts',
    purl: STORY_PURL,
    purpose: 'persists drawings as files',
    symbol: 'DrawingsStorage',
    process: 'draw-host',
  },
  {
    alias: 'fs',
    name: 'FileSystemService',
    construct: 'external',
    file: 'src/services/fileSystem.ts',
    purl: STORY_PURL,
    purpose: 'sandboxed host fd/fs access',
    symbol: 'FileSystemService',
    role: 'service',
  },
  {
    alias: 'shell',
    name: 'WorkspaceShell',
    construct: 'class',
    file: 'src/workspace/WorkspaceShell.tsx',
    purl: STORY_PURL,
    purpose: 'mounts tabs for opened drawings',
    symbol: 'WorkspaceShell',
    process: 'draw-host',
  },
  {
    alias: 'tab',
    name: 'DrawingTabContent',
    construct: 'class',
    file: 'src/components/DrawingTabContent.tsx',
    purl: STORY_PURL,
    purpose: 'loads/saves an open drawing',
    symbol: 'DrawingTabContent',
    process: 'draw-host',
  },
];

const seedTrails: SubsystemTrail[] = [
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      {
        from: 'panel',
        to: 'storage',
        mechanism: 'calls',
        file: 'src/panels/DrawingsLeftPanel.tsx',
        span: { startLine: 56, endLine: 56, contentHash: 'fixture' },
        purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'),
        symbol: 'DrawingsLeftPanel.scan',
        annotation: 'Lists the drawings directory; each row feeds an open intent.',
      },
      {
        from: 'panel',
        to: 'host',
        mechanism: 'produces',
        file: 'src/panels/DrawingsLeftPanel.tsx',
        span: { startLine: 85, endLine: 85, contentHash: 'fixture' },
        purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'),
        symbol: 'DrawingsLeftPanel.openDrawing',
        annotation: 'Emits the open intent up to the host.',
      },
      {
        from: 'host',
        to: 'storage',
        mechanism: 'calls',
        file: 'src/hooks/useDrawingsHost.ts',
        span: { startLine: 45, endLine: 45, contentHash: 'fixture' },
        purl: stepPurl('src/hooks/useDrawingsHost.ts'),
        symbol: 'useDrawingsHost.openDrawing',
        annotation: 'Host resolves the path and delegates to storage.',
      },
      {
        from: 'host',
        to: 'shell',
        mechanism: 'produces',
        file: 'src/workspace/WorkspaceShell.tsx',
        span: { startLine: 369, endLine: 369, contentHash: 'fixture' },
        purl: stepPurl('src/workspace/WorkspaceShell.tsx'),
        symbol: 'WorkspaceShell.openTab',
        annotation: 'Asks the shell to surface the drawing as a tab.',
      },
      {
        from: 'shell',
        to: 'tab',
        mechanism: 'feeds',
        file: 'src/workspace/WorkspaceShell.tsx',
        span: { startLine: 372, endLine: 372, contentHash: 'fixture' },
        purl: stepPurl('src/workspace/WorkspaceShell.tsx'),
        symbol: 'WorkspaceShell.mountTab',
      },
      {
        from: 'storage',
        to: 'fs',
        mechanism: 'calls',
        file: 'src/storage/drawingsStorage.ts',
        span: { startLine: 90, endLine: 90, contentHash: 'fixture' },
        purl: stepPurl('src/storage/drawingsStorage.ts'),
        symbol: 'DrawingsStorage.read',
        annotation: 'Reads the file through the sandboxed fs service.',
      },
      {
        from: 'tab',
        to: 'fs',
        mechanism: 'calls',
        file: 'src/components/DrawingTabContent.tsx',
        span: { startLine: 83, endLine: 83, contentHash: 'fixture' },
        purl: stepPurl('src/components/DrawingTabContent.tsx'),
        symbol: 'DrawingTabContent.load',
      },
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save drawing',
    steps: [
      {
        from: 'tab',
        to: 'fs',
        mechanism: 'calls',
        file: 'src/components/DrawingTabContent.tsx',
        span: { startLine: 112, endLine: 112, contentHash: 'fixture' },
        purl: stepPurl('src/components/DrawingTabContent.tsx'),
        symbol: 'DrawingTabContent.save',
      },
      {
        from: 'tab',
        to: 'host',
        mechanism: 'produces',
        file: 'src/components/DrawingTabContent.tsx',
        span: { startLine: 121, endLine: 121, contentHash: 'fixture' },
        purl: stepPurl('src/components/DrawingTabContent.tsx'),
        symbol: 'DrawingTabContent.emitSaved',
      },
      {
        from: 'host',
        to: 'panel',
        mechanism: 'produces',
        file: 'src/hooks/useDrawingsHost.ts',
        span: { startLine: 64, endLine: 64, contentHash: 'fixture' },
        purl: stepPurl('src/hooks/useDrawingsHost.ts'),
        symbol: 'useDrawingsHost.onSaved',
      },
      {
        from: 'panel',
        to: 'storage',
        mechanism: 'calls',
        file: 'src/panels/DrawingsLeftPanel.tsx',
        span: { startLine: 56, endLine: 56, contentHash: 'fixture' },
        purl: stepPurl('src/panels/DrawingsLeftPanel.tsx'),
        symbol: 'DrawingsLeftPanel.scan',
      },
    ],
  },
];

const SEEDED_AT = '2026-10-19T12:00:00.000Z';

function seedEmphasis(trails: SubsystemTrail[]): StepEmphasisRecord[] {
  const trail = trails[0]!;
  const at = (stepIndex: number, guidance: string): StepEmphasisRecord => ({
    trailId: trail.id,
    stepKey: stepClaimKey(trail.steps[stepIndex]!),
    guidance,
    provenance: { source: 'author', at: SEEDED_AT, author: 'you' },
  });
  return [
    at(
      0,
      'The **scan** is where a drawing row becomes an open intent. Everything below depends on this hand-off.',
    ),
    at(
      3,
      'The shell is the **hinge**: the tab only exists after this call, so this is where the flow becomes visible.',
    ),
    at(
      5,
      '**Risky seam.** First filesystem touch — a sandbox denial lands here rather than in storage.',
    ),
  ];
}

const muted = '#9aa4b2';
const border = '#2a2f3a';
const panelBg = '#0f1115';

function InspectorRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.5 }}>
      <span style={{ color: muted, minWidth: 74 }}>{label}</span>
      <span style={{ color: color ?? '#e6edf3', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

function Prototype() {
  const [trails, setTrails] = useState<SubsystemTrail[]>(seedTrails);
  const [records, setRecords] = useState<StepEmphasisRecord[]>(() =>
    seedEmphasis(seedTrails),
  );
  const emphasis = useMemo(() => buildStepEmphasisMap(records), [records]);
  const orphans = useMemo(() => orphanedEmphasis(records, trails), [records, trails]);

  const removeGuidance = useCallback(
    (trail: SubsystemTrail, stepIndex: number) => {
      const step = trail.steps[stepIndex];
      if (!step) return;
      const stepKey = stepClaimKey(step);
      setRecords((prev) =>
        prev.filter((r) => !(r.trailId === trail.id && r.stepKey === stepKey)),
      );
    },
    [],
  );

  const swapFirstSteps = useCallback(() => {
    setTrails((prev) =>
      prev.map((trail, trailIndex) =>
        trailIndex === 0 && trail.steps.length > 2
          ? {
              ...trail,
              steps: [trail.steps[1]!, trail.steps[0]!, ...trail.steps.slice(2)],
            }
          : trail,
      ),
    );
  }, []);

  const editStepClaim = useCallback(() => {
    setTrails((prev) =>
      prev.map((trail, trailIndex) =>
        trailIndex === 0
          ? {
              ...trail,
              steps: trail.steps.map((step, stepIndex) =>
                stepIndex === 1
                  ? {
                      ...step,
                      span: step.span
                        ? { ...step.span, startLine: step.span.startLine + 1, contentHash: 'edited' }
                        : { startLine: 1, endLine: 1, contentHash: 'edited' },
                    }
                  : step,
              ),
            }
          : trail,
      ),
    );
  }, []);

  const addAgentMark = useCallback(() => {
    const trail = trails[1];
    const step = trail?.steps[3];
    if (!trail || !step) return;
    const stepKey = stepClaimKey(step);
    setRecords((prev) =>
      prev.some((r) => r.trailId === trail.id && r.stepKey === stepKey)
        ? prev
        : [
            ...prev,
            {
              trailId: trail.id,
              stepKey,
              guidance:
                'Marked by **opencode** while tracing the save path. The panel scan runs again after the write to refresh the list.',
              provenance: {
                source: 'agent',
                at: new Date().toISOString(),
                author: 'opencode',
              },
            },
          ],
    );
  }, [trails]);

  const pruneOrphans = useCallback(() => {
    setRecords((prev) => {
      const dead = new Set(orphans.map((r) => `${r.trailId}:${r.stepKey}`));
      return prev.filter((r) => !dead.has(`${r.trailId}:${r.stepKey}`));
    });
  }, [orphans]);

  const documentModel: StepEmphasisDocument = {
    version: 1,
    modelId: 'sg-prototype',
    emphasis: records,
  };

  const button = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 9px',
        borderRadius: 5,
        border: `1px solid ${border}`,
        background: '#171a21',
        color: disabled ? '#5b636e' : '#e6edf3',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: panelBg }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <SubsystemComponentGraph
          components={components}
          trails={trails}
          initialTrailId="tl-open-drawing"
          persistKey="step-emphasis-prototype"
          stepEmphasis={emphasis}
          onRemoveStepEmphasis={removeGuidance}
          title="Step emphasis prototype"
          description="Key steps carry a star and markdown guidance. The mark lives in a separate augmentation document, keyed by the step's claim."
        />
      </div>

      <aside
        style={{
          width: 380,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `1px solid ${border}`,
          background: '#0b0d11',
          overflow: 'hidden',
        }}
      >
        <header style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${border}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              color: '#e6edf3',
            }}
          >
            <Star size={13} fill="#f5a524" color="#f5a524" />
            Step emphasis · prototype
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.5, color: muted }}>
            A separate augmentation document, not the portable model. Marks key on the
            step&apos;s <em>claim</em>, so reorder keeps them and a claim edit orphans them.
          </p>
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px' }}>
          {button('Reorder steps', swapFirstSteps)}
          {button('Edit step 2 claim', editStepClaim)}
          {button('Add agent mark', addAgentMark)}
          {button(
            `Prune ${orphans.length} orphan${orphans.length === 1 ? '' : 's'}`,
            pruneOrphans,
            orphans.length === 0,
          )}
        </div>

        <div style={{ padding: '0 16px 10px', display: 'grid', gap: 3 }}>
          <InspectorRow label="store" value="~/.principal/subsystem-model-augmentations/" />
          <InspectorRow label="modelId" value={documentModel.modelId} />
          <InspectorRow
            label="marks"
            value={`${records.length} total · ${orphans.length} orphaned`}
            color={orphans.length > 0 ? '#e5534b' : undefined}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 16px 10px',
            fontSize: 10,
            color: muted,
          }}
        >
          <Star size={10} fill="#f5a524" color="#f5a524" />
          A mark is a single star plus markdown guidance.
        </div>

        {orphans.length > 0 && (
          <div style={{ padding: '0 16px 10px', display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#e5534b' }}>
              ORPHANED — the claim changed
            </span>
            {orphans.map((r) => (
              <div
                key={`${r.trailId}:${r.stepKey}`}
                style={{ fontSize: 11, color: muted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              >
                <span style={{ color: '#f5a524' }}>Key</span> {r.trailId} · {r.stepKey}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            borderTop: `1px solid ${border}`,
            padding: '10px 16px 16px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              color: muted,
              marginBottom: 6,
            }}
          >
            AUGMENTATION DOCUMENT
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 10,
              lineHeight: 1.45,
              color: '#c9d1d9',
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(documentModel, null, 2)}
          </pre>
        </div>
      </aside>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <Prototype />,
};
