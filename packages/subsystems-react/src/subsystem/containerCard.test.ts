import { describe, expect, test } from 'bun:test';
import { containerLabelChunks } from './containerCard';

describe('containerLabelChunks', () => {
  test('keeps slash-delimited path segments intact and offers a break after slash', () => {
    expect(containerLabelChunks('subsystems-studio/host')).toEqual([
      { text: 'subsystems-studio/', pathSegment: true, breakAfter: true },
      { text: 'host', pathSegment: true, breakAfter: false },
    ]);
  });

  test('supports multiple slash boundaries', () => {
    expect(containerLabelChunks('packages/foo-bar/baz-qux')).toEqual([
      { text: 'packages/', pathSegment: true, breakAfter: true },
      { text: 'foo-bar/', pathSegment: true, breakAfter: true },
      { text: 'baz-qux', pathSegment: true, breakAfter: false },
    ]);
  });

  test('preserves ordinary labels and whitespace', () => {
    expect(containerLabelChunks('foo-bar ordinary label/path-name')).toEqual([
      { text: 'foo-bar', pathSegment: false, breakAfter: false },
      { text: ' ', pathSegment: false, breakAfter: false },
      { text: 'ordinary', pathSegment: false, breakAfter: false },
      { text: ' ', pathSegment: false, breakAfter: false },
      { text: 'label/', pathSegment: true, breakAfter: true },
      { text: 'path-name', pathSegment: true, breakAfter: false },
    ]);
  });
});
