import { describe, expect, test } from 'bun:test';
import {
  buildBackgroundCSS,
  buildPierreOptions,
  PIERRE_BASE_OPTIONS,
} from './pierreBackground';

describe('Pierre chrome colors', () => {
  test.each([
    { background: '#181818', text: '#eeeeee', textSecondary: '#999999' },
    { background: '#ffffff', text: '#222222', textSecondary: '#666666' },
  ])('uses host colors without replacing syntax foregrounds (%j)', (colors) => {
    const options = buildPierreOptions(
      colors.background,
      { color: colors.text },
      colors.textSecondary,
    );
    const css = 'unsafeCSS' in options ? options.unsafeCSS : '';

    expect(css).toContain(`--diffs-light-bg: ${colors.background};`);
    expect(css).toContain(`--diffs-dark-bg: ${colors.background};`);
    expect(css).toContain(`--diffs-fg-number-override: ${colors.textSecondary};`);
    expect(css).toContain(`[data-diffs-header] {\n  color: ${colors.text};`);
    expect(css).not.toContain('--diffs-light:');
    expect(css).not.toContain('--diffs-dark:');
    expect(css).not.toContain('--diffs-fg:');
  });

  test('keeps Pierre number colors when no override is supplied', () => {
    expect(buildBackgroundCSS('#181818')).not.toContain('--diffs-fg-number-override');
    expect(buildPierreOptions()).toBe(PIERRE_BASE_OPTIONS);
  });

  test('preserves header layout overrides alongside colors', () => {
    const css = buildBackgroundCSS(
      '#181818',
      { background: '#222222', color: '#eeeeee', fontSize: '12px', lineHeight: '1.15', padding: '2px 8px' },
      '#999999',
    );

    expect(css).toContain('background: #222222;');
    expect(css).toContain('font-size: 12px;');
    expect(css).toContain('line-height: 1.15;');
    expect(css).toContain('padding: 2px 8px;');
  });
});
