import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import {
  ComponentDeclaration,
  type SubsystemComponent,
  type SubsystemComponentConstruct,
} from '@principal-ai/subsystems-react';
import {
  ConstructsSearchList,
  type DeclarationSearchItem,
} from './ConstructsSearchList';
import sample from '../fixtures/graphify-constructs-sample.json';

/** Fills the story frame. Studio's preview decorator supplies no padding, so a
 *  story that wants the full viewport takes all of it. */
const FRAME = { width: '100%', height: '100vh' } as const;

const meta = {
  title: 'Subsystem/ConstructsSearch',
  component: ConstructsSearchList,
  args: {
    items: sample.declarations as unknown as DeclarationSearchItem[],
  },
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={FRAME}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ConstructsSearchList>;

export default meta;
type Story = StoryObj<typeof meta>;

const declarations = sample.declarations as unknown as DeclarationSearchItem[];
const source = sample.source;

/** Graphify-inferred kinds that map onto a real subsystem construct. */
const RENDERABLE: Record<string, SubsystemComponentConstruct> = {
  class: 'class',
  function: 'function',
  method: 'method',
  type: 'interface',
};

/**
 * Lift a fixture row into the shape `ComponentDeclaration` expects. Only rows
 * with rebuilt detail can do this — the graph's `unknown`/`module` nodes have no
 * construct or signature to show, so they're handled by the fallback instead.
 *
 * No `declarationRef` is attached: graph.json carries the start line but not the
 * declaration's content hash, so a ref here would claim a freshness the fixture
 * can't back up.
 */
function toComponent(item: DeclarationSearchItem): SubsystemComponent | null {
  const construct = RENDERABLE[item.construct];
  if (!construct || !item.declaration) return null;
  return {
    alias: item.id,
    name: item.name,
    symbol: item.symbol ?? item.name,
    construct,
    file: item.file,
    purl: item.purl ?? source.purl,
    declaration: item.declaration,
  };
}

/**
 * Rows the graph gave no declaration detail for. The list renders these inert
 * and dimmed rather than expanding them to an empty panel.
 */
function canExpand(item: DeclarationSearchItem): boolean {
  return toComponent(item) !== null;
}

function renderExpanded(item: DeclarationSearchItem) {
  const component = toComponent(item);
  if (!component) return null;
  return <ComponentDeclaration component={component} />;
}

function SearchDemo({
  items,
  selected: selectedProp,
}: {
  items: DeclarationSearchItem[];
  selected?: string;
}) {
  const [selected, setSelected] = useState(selectedProp ?? null);
  return (
    <div style={{ ...FRAME, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ConstructsSearchList
          items={items}
          title="Constructs"
          placeholder="Search functions, classes, files…"
          onSelect={(item) => setSelected(`${item.name}  —  ${item.file}`)}
          renderExpanded={renderExpanded}
          canExpand={canExpand}
          noExpansionHint="No structured declaration in this graph"
        />
      </div>
      <div
        style={{
          flexShrink: 0,
          padding: '6px 16px',
          borderTop: `1px solid ${defaultEditorTheme.colors.border}`,
          fontFamily: 'monospace',
          fontSize: 11,
          color: defaultEditorTheme.colors.textMuted ?? '#999',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span>{selected ?? '↑ ↓ to move · Enter to open'}</span>
        <span>
          graph.json @ {source.builtAtCommit?.slice(0, 7) ?? 'unknown'} ·{' '}
          {source.declarationCount} declarations
        </span>
      </div>
    </div>
  );
}

/** Every declaration in the current repo's graphify graph, searchable. */
export const AllDeclarations: Story = {
  render: () => <SearchDemo items={declarations} />,
};

/** Opens with a query typed in to show filtering + match highlighting. */
export const InitialQuery: Story = {
  render: () => (
    <div style={FRAME}>
      <ConstructsSearchList
        items={declarations}
        title="Constructs"
        initialQuery="subsystem"
        onSelect={() => {}}
        renderExpanded={renderExpanded}
        canExpand={canExpand}
        noExpansionHint="No structured declaration in this graph"
      />
    </div>
  ),
};

/**
 * The `has declaration` chip engaged — the 1,351 rows graphify recorded without
 * a signature or members are hidden, leaving only the 1,475 that expand. The
 * `other` 1,351 are mostly `const` bindings, plus the 573 interfaces and type
 * aliases the structural inference can't yet tell apart.
 */
export const DeclarationOnly: Story = {
  render: () => (
    <div style={FRAME}>
      <ConstructsSearchList
        items={declarations}
        title="Constructs"
        initialExpandableOnly
        onSelect={() => {}}
        renderExpanded={renderExpanded}
        canExpand={canExpand}
        noExpansionHint="No structured declaration in this graph"
      />
    </div>
  ),
};

/** No declarations — the empty result state. */
export const Empty: Story = {
  render: () => (
    <div style={FRAME}>
      <ConstructsSearchList items={[]} title="Constructs" onSelect={() => {}} />
    </div>
  ),
};

/**
 * Preview of the planned decoration: a trailing pill counting how many
 * subsystem models each declaration belongs to. The counts here are
 * illustrative — no model membership is wired up yet.
 */
export const ModelCountDecoration: Story = {
  render: () => {
    const decorated = declarations.map((item, i) =>
      i < 12 ? { ...item, modelCount: (i % 4) + 1 } : item,
    );
    return <SearchDemo items={decorated} />;
  },
};
