import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { C4SketchView } from '../../../subsystem/C4SketchView';
import type { C4Sketch } from '../../../subsystem/c4Sketch';
import { SKETCH_FIXTURE } from '../../../subsystem/__fixtures__/c4Sketch';
import {
  CONTAINER_MATRIX_SKETCH,
  DESCRIPTION_BOUNDARY_SKETCH,
  MAINTENANCE_BRIDGE_SKETCH,
  NOTES_ONLY_SKETCH,
  OPENBOT_SKETCH,
  STUDIO_SKETCH,
} from '../../../subsystem/__fixtures__/c4SketchGallery';

const meta = {
  title: 'Canvases/C4/Views/C4Sketch',
  component: C4SketchView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof C4SketchView>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ sketch }: { sketch: C4Sketch }) {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <C4SketchView sketch={sketch} />
    </div>
  );
}

/** A standalone authored sketch: no model, no grounding, no promotion. */
export const Sketch: Story = {
  render: () => <Demo sketch={SKETCH_FIXTURE} />,
};

/**
 * This repo's own system at the container level: Studio host + renderer,
 * Principal CLI, site, and the shared JSON model store. The realistic set for
 * reviewing the sidebar rows and the C4 → component drill.
 */
export const StudioSystem: Story = {
  render: () => <Demo sketch={STUDIO_SKETCH} />,
};

/**
 * The real OpenBot architecture sketch (12 containers, 32 edges): long
 * technology strings, several application containers and one data store,
 * agents as containers, and a sidebar that has to scroll.
 */
export const OpenBot: Story = {
  render: () => <Demo sketch={OPENBOT_SKETCH} />,
};

/**
 * The real Studio → OpenBot maintenance bridge sketch: two systems in one
 * authored hypothesis, with Studio's renderer/host/store beside OpenBot's
 * app/server/database.
 */
export const MaintenanceBridge: Story = {
  render: () => <Demo sketch={MAINTENANCE_BRIDGE_SKETCH} />,
};

/**
 * One row per container variant: application/data-store, accepted/proposed,
 * known/missing technology, long labels, and 0 / 1 / 6 members. Use this to
 * review hover, truncation, the proposed chip, and the open/closed control.
 */
export const ContainerMatrix: Story = {
  render: () => <Demo sketch={CONTAINER_MATRIX_SKETCH} />,
};

/**
 * A 200-character description with long Markdown notes — the header is sized
 * by the short description and **Show more** opens the extended document.
 */
export const DescriptionBoundary: Story = {
  render: () => <Demo sketch={DESCRIPTION_BOUNDARY_SKETCH} />,
};

/** Legacy sketch with only notes: the sidebar falls back to a clamped preview. */
export const NotesOnly: Story = {
  render: () => <Demo sketch={NOTES_ONLY_SKETCH} />,
};
