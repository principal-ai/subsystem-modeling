import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';
import { graphSpecFromSteps } from './fixtures';

const meta = {
  title: 'Subsystem/ComponentGraph/Packages',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
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

const APP = 'pkg:github/acme/app';
const LIB = 'pkg:github/acme/lib';

/**
 * Package frames are derived from `purl` when a graph spans multiple repos.
 * No separate `package` field — single-repo graphs stay unframed at this level.
 */
const multiRepoComponents: SubsystemComponent[] = [
  {
    alias: 'dispatch',
    name: 'dispatch',
    construct: 'function',
    symbol: 'dispatch',
    file: 'src/host/dispatch.ts',
    module: 'src/host/dispatch.ts',
    process: 'app/host',
    purl: APP,
    purpose: 'host entry',
    layer: 1,
  },
  {
    alias: 'session',
    name: 'SessionService',
    construct: 'class',
    symbol: 'SessionService',
    file: 'src/host/session.ts',
    module: 'src/host/session.ts',
    process: 'app/host',
    purl: APP,
    purpose: 'session state',
    layer: 2,
  },
  {
    alias: 'parse',
    name: 'parseEvent',
    construct: 'function',
    symbol: 'parseEvent',
    file: 'src/parse.ts',
    module: 'src/parse.ts',
    process: 'lib/worker',
    purl: LIB,
    purpose: 'shared parser',
    layer: 1,
  },
  {
    alias: 'normalize',
    name: 'normalize',
    construct: 'function',
    symbol: 'normalize',
    file: 'src/normalize.ts',
    module: 'src/normalize.ts',
    process: 'lib/worker',
    purl: LIB,
    purpose: 'normalize payloads',
    layer: 2,
  },
];

const multiRepoEdges = graphSpecFromSteps([
  ['dispatch', 'session', 'calls'],
  ['dispatch', 'parse', 'calls'],
  ['parse', 'normalize', 'calls'],
]);

export const MultiRepoPackageFrames: Story = {
  name: 'Multi-repo package frames',
  args: {
    components: multiRepoComponents,
    trails: multiRepoEdges.trails,
  },
  render: (args) => (
    <div style={{ width: '100vw', height: '100vh' }}>
      <SubsystemComponentGraph {...args} />
    </div>
  ),
};

/** Same components, one purl — no package frames (process/module only). */
const singleRepo = multiRepoComponents.map((c) => ({ ...c, purl: APP }));

export const SingleRepoNoPackageFrames: Story = {
  name: 'Single-repo (no package frames)',
  args: {
    components: singleRepo,
    trails: multiRepoEdges.trails,
  },
  render: (args) => (
    <div style={{ width: '100vw', height: '100vh' }}>
      <SubsystemComponentGraph {...args} />
    </div>
  ),
};

/**
 * Full nest: package → process → module → leaves.
 * Each module path has 2+ exports so module frames survive the singleton rule.
 */
const nestedComponents: SubsystemComponent[] = [
  {
    alias: 'dispatch',
    name: 'dispatch',
    construct: 'function',
    symbol: 'dispatch',
    file: 'src/host/main.ts',
    module: 'src/host/main.ts',
    process: 'app/host',
    purl: APP,
    purpose: 'host entry',
    layer: 1,
  },
  {
    alias: 'boot',
    name: 'boot',
    construct: 'function',
    symbol: 'boot',
    file: 'src/host/main.ts',
    module: 'src/host/main.ts',
    process: 'app/host',
    purl: APP,
    purpose: 'host bootstrap',
    layer: 1,
  },
  {
    alias: 'session',
    name: 'SessionService',
    construct: 'class',
    symbol: 'SessionService',
    file: 'src/host/session.ts',
    module: 'src/host/session.ts',
    process: 'app/host',
    purl: APP,
    purpose: 'session state',
    layer: 2,
  },
  {
    alias: 'session-types',
    name: 'SessionRecord',
    construct: 'type_alias',
    symbol: 'SessionRecord',
    file: 'src/host/session.ts',
    module: 'src/host/session.ts',
    process: 'app/host',
    purl: APP,
    purpose: 'session record shape',
    layer: 2,
  },
  {
    alias: 'parse',
    name: 'parseEvent',
    construct: 'function',
    symbol: 'parseEvent',
    file: 'src/parse.ts',
    module: 'src/parse.ts',
    process: 'lib/worker',
    purl: LIB,
    purpose: 'shared parser',
    layer: 1,
  },
  {
    alias: 'parse-types',
    name: 'RawEvent',
    construct: 'type_alias',
    symbol: 'RawEvent',
    file: 'src/parse.ts',
    module: 'src/parse.ts',
    process: 'lib/worker',
    purl: LIB,
    purpose: 'raw event shape',
    layer: 1,
  },
  {
    alias: 'normalize',
    name: 'normalize',
    construct: 'function',
    symbol: 'normalize',
    file: 'src/normalize.ts',
    module: 'src/normalize.ts',
    process: 'lib/worker',
    purl: LIB,
    purpose: 'normalize payloads',
    layer: 2,
  },
  {
    alias: 'normalize-types',
    name: 'NormalizedEvent',
    construct: 'type_alias',
    symbol: 'NormalizedEvent',
    file: 'src/normalize.ts',
    module: 'src/normalize.ts',
    process: 'lib/worker',
    purl: LIB,
    purpose: 'normalized event shape',
    layer: 2,
  },
];

const nestedEdges = graphSpecFromSteps([
  ['boot', 'dispatch', 'calls'],
  ['dispatch', 'session', 'calls'],
  ['dispatch', 'parse', 'calls'],
  ['parse', 'normalize', 'calls'],
]);

export const PackageProcessModuleNesting: Story = {
  name: 'Package → process → module nesting',
  args: {
    components: nestedComponents,
    trails: nestedEdges.trails,
  },
  render: (args) => (
    <div style={{ width: '100vw', height: '100vh' }}>
      <SubsystemComponentGraph {...args} />
    </div>
  ),
};
