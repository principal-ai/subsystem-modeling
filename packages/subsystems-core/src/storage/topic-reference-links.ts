import type { TopicReference } from './topic-types';

// IDs are opaque single path segments, not paths. Decode exactly once and
// reject traversal, separators, whitespace, and control characters.
function isReferenceId(id: string): boolean {
  return id.length > 0 && id !== '.' && id !== '..' && !/[/\\\s\u0000-\u001f\u007f]/.test(id);
}

function referenceId(reference: TopicReference): string {
  switch (reference.kind) {
    case 'topic':
      return reference.topicId;
    case 'c4-sketch':
      return reference.sketchId;
    case 'drawing':
      return reference.drawingId;
  }
}

/** Format a Markdown-safe href. Does not attach or resolve the target. */
export function formatTopicReferenceLink(reference: TopicReference): string {
  const id = referenceId(reference);
  if (!isReferenceId(id)) throw new Error('Invalid topic reference id');
  const encoded = encodeURIComponent(id).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `principal://${reference.kind}/${encoded}`;
}

/**
 * Parse a local topic/sketch/drawing href without I/O. Unknown kinds, malformed
 * escapes, extra path segments, queries, and fragments return null. Target
 * existence and navigation belong to the host. Parsing never creates an attachment.
 */
export function parseTopicReferenceLink(href: string): TopicReference | null {
  const match = /^principal:\/\/(topic|c4-sketch|drawing)\/([^/?#]+)$/.exec(href);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!isReferenceId(id)) return null;
  switch (match[1]) {
    case 'topic':
      return { kind: 'topic', topicId: id };
    case 'c4-sketch':
      return { kind: 'c4-sketch', sketchId: id };
    default:
      return { kind: 'drawing', drawingId: id };
  }
}
