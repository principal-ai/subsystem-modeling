import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent } from '../../../subsystem/model';

/**
 * Prototype for path-based module nesting: `module` is the file path, and
 * `moduleNesting="path"` derives directory frames from the path segments and
 * nests the module frames inside them.
 *
 * Compare `FilesFlat` (one module frame per file, the current "column") with
 * `FilesByPath` (directory frames interposed) and `FolderModules` (the same
 * model read with folders as modules instead of files).
 */

const meta = {
  title: 'Subsystem/ComponentGraph/Module path nesting',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ width: '100%', height: '100vh' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  argTypes: {
    moduleNesting: { control: 'inline-radio', options: ['exact', 'path'] },
  },
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

const PURL = 'pkg:github/you/scheduling-app';

function fileModules(): SubsystemComponent[] {
  return [
    { alias: 'booking-page', name: 'BookingPage', construct: 'function', symbol: 'BookingPage', purl: PURL, file: 'app/book/page.tsx', module: 'app/book/page.tsx' },
    { alias: 'list-open-slots', name: 'listOpenSlots', construct: 'function', symbol: 'listOpenSlots', purl: PURL, file: 'app/book/actions.ts', module: 'app/book/actions.ts' },
    { alias: 'book-slot', name: 'bookSlot', construct: 'function', symbol: 'bookSlot', purl: PURL, file: 'app/book/actions.ts', module: 'app/book/actions.ts' },
    { alias: 'cancel-slot', name: 'cancelSlot', construct: 'function', symbol: 'cancelSlot', purl: PURL, file: 'app/book/actions.ts', module: 'app/book/actions.ts' },
    { alias: 'list-slots', name: 'listSlots', construct: 'function', symbol: 'listSlots', purl: PURL, file: 'lib/listSlots.ts', module: 'lib/listSlots.ts' },
    { alias: 'create-booking', name: 'createBooking', construct: 'function', symbol: 'createBooking', purl: PURL, file: 'lib/createBooking.ts', module: 'lib/createBooking.ts' },
    { alias: 'cancel-booking', name: 'cancelBooking', construct: 'function', symbol: 'cancelBooking', purl: PURL, file: 'lib/cancelBooking.ts', module: 'lib/cancelBooking.ts' },
    { alias: 'capture-event', name: 'captureEvent', construct: 'function', symbol: 'captureEvent', purl: PURL, file: 'lib/captureEvent.ts', module: 'lib/captureEvent.ts' },
  ];
}

/** Current behavior: one frame per file path — the "column". */
export const FilesFlat: Story = {
  args: {
    title: 'File modules (exact)',
    description: 'module = file path, moduleNesting="exact". One frame per file.',
    components: fileModules(),
    moduleNesting: 'exact',
  },
};

/** Path-nested: directory frames wrap the file frames. */
export const FilesByPath: Story = {
  args: {
    title: 'File modules (path nesting)',
    description:
      'module = file path, moduleNesting="path". `app/book` and `lib` directory frames wrap their file frames.',
    components: fileModules(),
    moduleNesting: 'path',
  },
};

/** Deeper hierarchy: src → host/renderer/bun → file frames. */
const deepComponents: SubsystemComponent[] = [
  { alias: 'boot', name: 'boot', construct: 'function', symbol: 'boot', purl: 'pkg:github/p/app', file: 'src/host/main.ts', module: 'src/host/main.ts' },
  { alias: 'create-host', name: 'createHost', construct: 'function', symbol: 'createHost', purl: 'pkg:github/p/app', file: 'src/host/main.ts', module: 'src/host/main.ts' },
  { alias: 'session-store', name: 'SessionStore', construct: 'store', symbol: 'SessionStore', purl: 'pkg:github/p/app', file: 'src/host/store.ts', module: 'src/host/store.ts' },
  { alias: 'bridge', name: 'bridge', construct: 'function', symbol: 'bridge', purl: 'pkg:github/p/app', file: 'src/renderer/bridge.ts', module: 'src/renderer/bridge.ts' },
  { alias: 'trail-view', name: 'TrailView', construct: 'function', symbol: 'TrailView', framework: 'react', stereotype: 'component', purl: 'pkg:github/p/app', file: 'src/renderer/view.tsx', module: 'src/renderer/view.tsx' },
  { alias: 'audit-store', name: 'auditStore', construct: 'store', symbol: 'auditStore', purl: 'pkg:github/p/app', file: 'src/bun/audit.ts', module: 'src/bun/audit.ts' },
  { alias: 'audit-run', name: 'runAudit', construct: 'function', symbol: 'runAudit', purl: 'pkg:github/p/app', file: 'src/bun/audit.ts', module: 'src/bun/audit.ts' },
  { alias: 'registry', name: 'registry', construct: 'store', symbol: 'registry', purl: 'pkg:github/p/app', file: 'src/bun/registry.ts', module: 'src/bun/registry.ts' },
];

export const DeepNesting: Story = {
  args: {
    title: 'Deep path nesting',
    description:
      'src → host / renderer / bun → file frames. Directories nest recursively by path segment.',
    components: deepComponents,
    moduleNesting: 'path',
  },
};

/** Same shape, but `module` is the folder (no per-file frames). */
const folderComponents: SubsystemComponent[] = [
  { alias: 'booking-page', name: 'BookingPage', construct: 'function', symbol: 'BookingPage', purl: PURL, file: 'app/book/page.tsx', module: 'app/book' },
  { alias: 'list-open-slots', name: 'listOpenSlots', construct: 'function', symbol: 'listOpenSlots', purl: PURL, file: 'app/book/actions.ts', module: 'app/book' },
  { alias: 'book-slot', name: 'bookSlot', construct: 'function', symbol: 'bookSlot', purl: PURL, file: 'app/book/actions.ts', module: 'app/book' },
  { alias: 'cancel-slot', name: 'cancelSlot', construct: 'function', symbol: 'cancelSlot', purl: PURL, file: 'app/book/actions.ts', module: 'app/book' },
  { alias: 'list-slots', name: 'listSlots', construct: 'function', symbol: 'listSlots', purl: PURL, file: 'lib/listSlots.ts', module: 'lib' },
  { alias: 'create-booking', name: 'createBooking', construct: 'function', symbol: 'createBooking', purl: PURL, file: 'lib/createBooking.ts', module: 'lib' },
  { alias: 'cancel-booking', name: 'cancelBooking', construct: 'function', symbol: 'cancelBooking', purl: PURL, file: 'lib/cancelBooking.ts', module: 'lib' },
  { alias: 'capture-event', name: 'captureEvent', construct: 'function', symbol: 'captureEvent', purl: PURL, file: 'lib/captureEvent.ts', module: 'lib' },
];

export const FolderModules: Story = {
  args: {
    title: 'Folder modules',
    description:
      'module = folder. Two folder frames hold the exports directly — no per-file frames.',
    components: folderComponents,
  },
};
