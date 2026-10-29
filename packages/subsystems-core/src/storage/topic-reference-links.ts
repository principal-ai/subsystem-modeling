import type { TopicReference } from './topic-types';

// IDs are opaque single path segments, not paths. Decode exactly once and
// reject traversal, separators, whitespace, and control characters.
function isReferenceId(id: string): boolean {
  return id.length > 0 && id !== '.' && id !== '..' && !/[/\\\s\u0000-\u001f\u007f]/.test(id);
}

/** Format a Markdown-safe href. Does not attach or resolve the target. */
export function formatTopicReferenceLink(reference: TopicReference): string {
  const id = reference.kind === 'topic' ? reference.topicId : reference.sketchId;
  if (!isReferenceId(id)) throw new Error('Invalid topic reference id');
  const encoded = encodeURIComponent(id).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `principal://${reference.kind}/${encoded}`;
}

/**
 * Parse a local topic/sketch href without I/O. Unknown kinds, malformed escapes,
 * extra path segments, queries, and fragments return null. Target existence and
 * navigation belong to the host. Parsing never creates an attachment.
 */
export function parseTopicReferenceLink(href: string): TopicReference | null {
  const match = /^principal:\/\/(topic|c4-sketch)\/([^/?#]+)$/.exec(href);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!isReferenceId(id)) return null;
  return match[1] === 'topic'
    ? { kind: 'topic', topicId: id }
    : { kind: 'c4-sketch', sketchId: id };
}
