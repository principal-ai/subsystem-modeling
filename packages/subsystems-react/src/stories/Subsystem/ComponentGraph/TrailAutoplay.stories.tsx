import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemTrail } from '../../../subsystem/model';

/**
 * Autoplay-through-steps harness. Drives `autoPlayTrails` with the
 * camera/focus knobs exposed as Storybook controls so the step-focus behavior
 * can be tuned live.
 *
 * Note on current behavior: the autoplay loop advances by setting the
 * *hovered* step (dim-highlight) — it does not camera-focus each step, so
 * `trailStepMode` / `zoomOnTrailFocus` don't change the autoplay
 * camera today. This story exists to expose that gap and iterate on it.
 */
const meta = {
  title: 'Subsystem/ComponentGraph/TrailAutoplay',
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

const PURL = 'pkg:github/acme/booking-web';
const stepPurl = (file: string) => `${PURL}#${file}`;

const components: SubsystemComponent[] = [
  {
    alias: 'ui',
    name: 'BookingPage',
    construct: 'function',
    file: 'src/ui/BookingPage.tsx',
    purl: PURL,
    symbol: 'BookingPage',
    purpose: 'picks a slot and submits the booking',
    process: 'booking-web/client',
  },
  {
    alias: 'api',
    name: 'checkoutApi',
    construct: 'function',
    file: 'src/api/checkout.ts',
    purl: PURL,
    symbol: 'checkoutApi',
    purpose: 'validates and books a slot',
    process: 'booking-web/server',
  },
  {
    alias: 'store',
    name: 'BookingStore',
    construct: 'store',
    file: 'src/store/bookingStore.ts',
    purl: PURL,
    symbol: 'BookingStore',
    purpose: 'retained bookings',
    process: 'booking-web/server',
  },
  {
    alias: 'db',
    name: 'Postgres',
    construct: 'external',
    file: '',
    purl: 'external',
    purpose: 'durable bookings',
    role: 'service',
  },
];

const trails: SubsystemTrail[] = [
  {
    id: 'wt-book',
    title: 'Book a slot',
    steps: [
      {
        from: 'ui',
        to: 'api',
        mechanism: 'calls',
        file: 'src/ui/BookingPage.tsx',
        line: 42,
        purl: stepPurl('src/ui/BookingPage.tsx'),
        symbol: 'BookingPage.submit',
        annotation: 'Submit hands the picked slot to the API.',
      },
      {
        from: 'api',
        to: 'store',
        mechanism: 'writes',
        file: 'src/api/checkout.ts',
        line: 18,
        purl: stepPurl('src/api/checkout.ts'),
        symbol: 'checkoutApi.book',
        annotation: 'API writes the booking into the store.',
      },
      {
        from: 'store',
        to: 'db',
        mechanism: 'writes',
        file: 'src/store/bookingStore.ts',
        line: 27,
        purl: stepPurl('src/store/bookingStore.ts'),
        symbol: 'BookingStore.commit',
        annotation: 'Store commits the row.',
      },
      {
        from: 'api',
        to: 'ui',
        mechanism: 'produces',
        file: 'src/api/checkout.ts',
        line: 24,
        purl: stepPurl('src/api/checkout.ts'),
        symbol: 'checkoutApi.respond',
        annotation: 'API returns the confirmed booking.',
      },
    ],
  },
  {
    id: 'wt-cancel',
    title: 'Cancel a booking',
    steps: [
      {
        from: 'ui',
        to: 'api',
        mechanism: 'calls',
        file: 'src/ui/BookingPage.tsx',
        line: 61,
        purl: stepPurl('src/ui/BookingPage.tsx'),
        symbol: 'BookingPage.cancel',
      },
      {
        from: 'api',
        to: 'store',
        mechanism: 'writes',
        file: 'src/api/checkout.ts',
        line: 33,
        purl: stepPurl('src/api/checkout.ts'),
        symbol: 'checkoutApi.cancel',
      },
      {
        from: 'store',
        to: 'db',
        mechanism: 'writes',
        file: 'src/store/bookingStore.ts',
        line: 41,
        purl: stepPurl('src/store/bookingStore.ts'),
        symbol: 'BookingStore.remove',
      },
    ],
  },
];

const files: Record<string, string> = {
  'src/ui/BookingPage.tsx': ['// src/ui/BookingPage.tsx', '', '// 42 submit()', '// 61 cancel()'].join('\n'),
  'src/api/checkout.ts': ['// src/api/checkout.ts', '', '// 18 book()', '// 24 respond()', '// 33 cancel()'].join('\n'),
  'src/store/bookingStore.ts': ['// src/store/bookingStore.ts', '', '// 27 commit()', '// 41 remove()'].join('\n'),
};

const readFile = (path: string): Promise<string> =>
  files[path] != null
    ? Promise.resolve(files[path]!)
    : Promise.reject(new Error(`file not found in graph repos: ${path}`));

export const AutoplayFocus: Story = {
  args: {
    autoPlayTrails: true,
    trailStepMode: 'focus',
    zoomOnTrailFocus: true,
    trailAutoPlayIntervalMs: 5000,
    trailFocusDurationMs: 800,
    showTrailTitle: true,
    initialTrailId: 'wt-book',
  },
  argTypes: {
    autoPlayTrails: { control: 'boolean' },
    trailStepMode: { control: 'inline-radio', options: ['focus', 'dim'] },
    zoomOnTrailFocus: { control: 'boolean' },
    trailAutoPlayIntervalMs: {
      control: { type: 'range', min: 400, max: 8000, step: 100 },
    },
    trailFocusDurationMs: {
      control: { type: 'range', min: 100, max: 2000, step: 50 },
    },
    showTrailTitle: { control: 'boolean' },
  },
  render: (args) => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        {...args}
        components={components}
        trails={trails}
        hideSidebar
        hideDrawer
        edgeView="trails"
        initialTrailId="wt-book"
        title="Autoplay through steps"
        description="Autoplay cycles the trail steps. **Goal to refine:** each advance should camera-focus the step (and optionally open its snippet), not just dim the rest of the graph. Use the controls to compare `focus` vs `dim` and the zoom gate."
        renderFileViewer={(file, opts) => (
          <div style={{ padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#bbb', whiteSpace: 'pre' }}>
            {`// ${file}`}
            {opts?.startLine != null ? `\n  // → focus line ${opts.startLine}` : ''}
            {'\n  …'}
          </div>
        )}
      />
    </div>
  ),
};
