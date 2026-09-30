import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import {
  SubsystemModelTransition,
  type SubsystemTransitionStep,
} from '../../../subsystem/SubsystemModelTransition';
import type { SubsystemComponent, SubsystemWalkthrough } from '../../../subsystem/model';

/**
 * Harness for `SubsystemModelTransition` — the same progression cases
 * (constructs → static → dynamic → walkthrough) animated between, with a nav.
 */

const meta = {
  title: 'Subsystem/ComponentGraph/Animated progression',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

const PURL = 'pkg:github/you/scheduling-app';

const components: SubsystemComponent[] = [
  { alias: 'booking-page', name: 'BookingPage', construct: 'function', symbol: 'BookingPage', role: 'entry', framework: 'react', stereotype: 'component', purl: PURL, file: 'app/book/page.tsx', module: 'app/book/page.tsx', process: 'booking-web/client' },
  { alias: 'list-open-slots', name: 'listOpenSlots', construct: 'function', symbol: 'listOpenSlots', role: 'entry', framework: 'next', stereotype: 'server-action', purl: PURL, file: 'app/book/actions.ts', module: 'app/book/actions.ts', process: 'booking-web/server' },
  { alias: 'book-slot', name: 'bookSlot', construct: 'function', symbol: 'bookSlot', role: 'entry', framework: 'next', stereotype: 'server-action', purl: PURL, file: 'app/book/actions.ts', module: 'app/book/actions.ts', process: 'booking-web/server' },
  { alias: 'list-slots', name: 'listSlots', construct: 'function', symbol: 'listSlots', purl: PURL, file: 'lib/listSlots.ts', module: 'lib/listSlots.ts', process: 'booking-web/server' },
  { alias: 'create-booking', name: 'createBooking', construct: 'function', symbol: 'createBooking', purl: PURL, file: 'lib/createBooking.ts', module: 'lib/createBooking.ts', process: 'booking-web/server' },
  { alias: 'capture-event', name: 'captureEvent', construct: 'function', symbol: 'captureEvent', purl: PURL, file: 'lib/captureEvent.ts', module: 'lib/captureEvent.ts', process: 'booking-web/client' },
  { alias: 'Database', name: 'Database', construct: 'external', role: 'service', purl: 'external', file: '' },
];

const walkthroughs: SubsystemWalkthrough[] = [
  {
    id: 'wt-book',
    title: 'Guest books',
    steps: [
      { from: 'booking-page', to: 'book-slot', mechanism: 'calls', file: 'app/book/page.tsx', line: 24, purl: PURL, symbol: 'bookSlot' },
      { from: 'book-slot', to: 'create-booking', mechanism: 'calls', file: 'app/book/actions.ts', line: 22, purl: PURL, symbol: 'createBooking' },
      { from: 'create-booking', to: 'Database', mechanism: 'writes', file: 'lib/createBooking.ts', line: 13, purl: PURL, symbol: 'insert' },
      { from: 'booking-page', to: 'capture-event', mechanism: 'calls', file: 'app/book/page.tsx', line: 26, purl: PURL, symbol: 'captureEvent' },
    ],
  },
  {
    id: 'wt-pick',
    title: 'Guest picks a slot',
    steps: [
      { from: 'booking-page', to: 'list-open-slots', mechanism: 'calls', file: 'app/book/page.tsx', line: 17, purl: PURL, symbol: 'listOpenSlots' },
      { from: 'list-open-slots', to: 'list-slots', mechanism: 'calls', file: 'app/book/actions.ts', line: 14, purl: PURL, symbol: 'listSlots' },
      { from: 'list-slots', to: 'Database', mechanism: 'reads', file: 'lib/listSlots.ts', line: 9, purl: PURL, symbol: 'findOpen' },
    ],
  },
];

const LABELS = ['Constructs', 'Static topology', 'Dynamic topology', 'Walkthrough'];

const STEPS: SubsystemTransitionStep[] = [
  {
    model: { title: 'Booking', components: components.map(({ module: _m, process: _p, ...rest }) => rest) },
  },
  {
    model: { title: 'Booking', components: components.map(({ process: _p, ...rest }) => rest) },
    moduleNesting: 'path',
  },
  {
    // Dynamic topology = process framing only (no runtime edges).
    model: { title: 'Booking', components },
    moduleNesting: 'path',
  },
  {
    model: { title: 'Booking', components, walkthroughs },
    moduleNesting: 'path',
    autoPlayWalkthroughs: true,
    showWalkthroughTitle: true,
  },
];

const STEP_MS = 4000;

/** Dwell long enough for an autoplaying step to cycle all its hops. */
function dwellFor(index: number): number {
  const step = STEPS[index];
  if (step?.autoPlayWalkthroughs) {
    const hops = step.model.walkthroughs?.reduce((n, w) => n + w.steps.length, 0) ?? 0;
    // Whole-flow phase + one tick per hop.
    if (hops > 0) return (hops + 1) * STEP_MS;
  }
  return 3200;
}

function Harness() {
  const [active, setActive] = useState(0);
  const steps = useMemo(() => STEPS, []);

  useEffect(() => {
    const t = window.setTimeout(
      () => setActive((i) => (i + 1) % STEPS.length),
      dwellFor(active),
    );
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: defaultEditorTheme.colors.background }}>
      <SubsystemModelTransition
        steps={steps}
        activeIndex={active}
        walkthroughAutoPlayIntervalMs={STEP_MS}
      />
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, zIndex: 10 }}>
        {LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => setActive(i)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${i === active ? defaultEditorTheme.colors.primary : '#555'}`,
              background: i === active ? defaultEditorTheme.colors.primary : 'transparent',
              color: i === active ? '#fff' : defaultEditorTheme.colors.text,
              cursor: 'pointer',
              font: '600 12px system-ui',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Cases: Story = {
  render: () => (
    <ThemeProvider theme={defaultEditorTheme}>
      <Harness />
    </ThemeProvider>
  ),
};
