import { describe, expect, test } from 'bun:test';
import { formatTopicReferenceLink, parseTopicReferenceLink } from './topic-reference-links';
import type { TopicReference } from './topic-types';

describe('topic reference links', () => {
  test('formats topic, C4 sketch, and drawing links', () => {
    expect(formatTopicReferenceLink({ kind: 'topic', topicId: 'topic-123-abc' }))
      .toBe('principal://topic/topic-123-abc');
    expect(formatTopicReferenceLink({ kind: 'c4-sketch', sketchId: 'c4s-123-abc' }))
      .toBe('principal://c4-sketch/c4s-123-abc');
    expect(formatTopicReferenceLink({ kind: 'drawing', drawingId: '0b6f7c1e-2a4d-4e8f-9c3b-1d2e3f4a5b6c' }))
      .toBe('principal://drawing/0b6f7c1e-2a4d-4e8f-9c3b-1d2e3f4a5b6c');
  });

  test('round-trips opaque ids and escapes Markdown delimiters', () => {
    const references: TopicReference[] = [
      { kind: 'topic', topicId: 'topic-123-abc' },
      { kind: 'c4-sketch', sketchId: 'c4s-123-abc' },
      { kind: 'drawing', drawingId: 'drawing-123' },
      { kind: 'topic', topicId: "topic-é(1)!'?#%" },
      { kind: 'topic', topicId: 'topic-%2F' },
    ];
    for (const reference of references) {
      const href = formatTopicReferenceLink(reference);
      expect(href).not.toMatch(/[()!'?#]/);
      expect(parseTopicReferenceLink(href)).toEqual(reference);
    }
  });

  test('rejects invalid ids when formatting', () => {
    for (const topicId of ['', '.', '..', 'a/b', 'a\\b', ' a', 'a b', 'a\n', 'a\u0000']) {
      expect(() => formatTopicReferenceLink({ kind: 'topic', topicId })).toThrow();
    }
    expect(() => formatTopicReferenceLink({ kind: 'drawing', drawingId: '../d1' })).toThrow();
  });

  test('returns null for unsupported or malformed hrefs', () => {
    for (const href of [
      '', 'https://example.com', 'pkg:github/acme/repo',
      'principal://model/sg-1', 'principal://topic/', 'principal://topic',
      'principal://topic/a/b', 'principal://topic/a/', 'principal://topic/a?q=1',
      'principal://topic/a#heading', 'principal://topic/..', 'principal://topic/%2e%2e',
      'principal://topic/%2F', 'principal://topic/%5C', 'principal://topic/%00',
      'principal://topic/%20', 'principal://topic/a\n', 'principal://topic/%',
      'principal://topic/%GG', 'principal://topic/%FF',
      ' principal://topic/a', 'principal://topic@host/a',
      'principal://drawing/', 'principal://drawing/a/b', 'principal://drawing/..',
      'principal://drawings/a',
    ]) {
      expect(parseTopicReferenceLink(href)).toBeNull();
    }
  });
});
