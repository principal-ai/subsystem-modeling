import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, slateTheme } from '@principal-ade/industry-theme';
import { ChangeTypeVisual } from '../../../../principal-studio/src/mainview/components/ChangeTypeVisual';

const meta = {
  title: 'Features/ChangeTypeVisual',
  component: ChangeTypeVisual,
  decorators: [
    (Story) => (
      <ThemeProvider theme={slateTheme}>
        <div
          style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: slateTheme.colors.background,
          }}
        >
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof ChangeTypeVisual>;

export default meta;
type Story = StoryObj<typeof meta>;

function frame(content: React.ReactNode) {
  return (
    <div
      style={{
        border: `1px solid ${slateTheme.colors.border}`,
        borderRadius: 16,
        padding: 48,
        background: slateTheme.colors.backgroundSecondary,
      }}
    >
      {content}
    </div>
  );
}

export const Sequence: Story = {
  args: { changeType: 'execution', theme: slateTheme, height: 320 },
  render: (args) => frame(<ChangeTypeVisual {...args} />),
};

export const Derive: Story = {
  args: { changeType: 'derive', theme: slateTheme, height: 320 },
  render: (args) => frame(<ChangeTypeVisual {...args} />),
};

export const Integration: Story = {
  args: { changeType: 'integration', theme: slateTheme, height: 320 },
  render: (args) => frame(<ChangeTypeVisual {...args} />),
};

export const UI: Story = {
  args: { changeType: 'ui', theme: slateTheme, height: 320 },
  render: (args) => frame(<ChangeTypeVisual {...args} />),
};
