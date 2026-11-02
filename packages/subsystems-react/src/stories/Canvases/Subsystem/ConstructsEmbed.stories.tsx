import '@xyflow/react/dist/style.css';
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { CatalogDemo } from './Constructs.stories';

const meta = {
  title: 'Canvases/Subsystem/Graphs/Constructs',
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Same catalog, no title chrome — the shape the home-page constructs layer uses. */
export const CatalogEmbed: Story = {
  render: () => <CatalogDemo hideSidebar />,
};
