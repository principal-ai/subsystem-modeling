import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { HeroCityGraph } from '../src/components/HeroCityGraph';

/**
 * Site hero: a File City base with the Checkout Subsystem Model projected
 * above it. Beams tie each graph node to the building (file) it names.
 */
const meta = {
  title: 'Site/Hero city graph',
  component: HeroCityGraph,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HeroCityGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  const [key, setKey] = useState(0);
  return (
    <div style={{ padding: 32, background: '#05070d', minHeight: '100vh', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <HeroCityGraph key={key} />
      </div>
      <button
        type="button"
        onClick={() => setKey((k) => k + 1)}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          padding: '8px 14px',
          borderRadius: 6,
          border: '1px solid #334155',
          background: '#0f172a',
          color: '#e2e8f0',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Replay
      </button>
    </div>
  );
}

export const Hero: Story = {
  render: () => <Demo />,
};
