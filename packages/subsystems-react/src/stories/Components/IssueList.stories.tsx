import type { Meta, StoryObj } from '@storybook/react';
import { FileCodeCorner } from 'lucide-react';

/**
 * The span-finding icon: `FileCodeCorner`, shared by all four span kinds.
 *
 * State is carried by the row color, not the glyph:
 *   - not captured (`*_span_unconfirmed`) → error → red
 *   - changed (`*_span_stale`)            → info  → amber
 *
 * No "?" badge (removed by request).
 */
const meta = {
  title: 'Components/IssueList',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ERROR = '#e5534b';
const INFO = '#d4a017';

function Row({
  color,
  title,
  kinds,
}: {
  color: string;
  title: string;
  kinds: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        marginBottom: 10,
        border: '1px solid #2c2c2c',
        borderRadius: 8,
      }}
    >
      <FileCodeCorner size={18} color={color} />
      <div>
        <div style={{ fontSize: 12, color: '#e6e6e6' }}>{title}</div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#9a9a9a' }}>{kinds}</div>
      </div>
    </div>
  );
}

export const SpanFamily: Story = {
  render: () => (
    <div style={{ background: '#141414', minHeight: '100vh', padding: 24, color: '#e6e6e6' }}>
      <h1 style={{ fontSize: 16, marginTop: 0 }}>Span finding icon — `FileCodeCorner`</h1>
      <p style={{ color: '#9a9a9a', fontSize: 12, maxWidth: 620 }}>
        One glyph for all four span kinds; red = not captured, amber = changed.
      </p>
      <Row color={ERROR} title="not captured — error (red)" kinds="construct_span_unconfirmed · step_span_unconfirmed" />
      <Row color={INFO} title="changed — info (amber)" kinds="construct_span_stale · step_span_stale" />
    </div>
  ),
};
