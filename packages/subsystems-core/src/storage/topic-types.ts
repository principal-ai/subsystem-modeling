/**
 * Canonical topic contract — the shapes every consumer of `~/.principal/topics`
 * agrees on. Browser-safe (no `node:*`); the file-per-topic store that reads and
 * writes these lives in `./node` (see `topicStore.ts`).
 *
 * A **topic** is a locally authored subject brief. {@link DraftTopic} is the
 * shape desktop persists to `~/.principal/topics/<id>.json` and edits.
 *
 * All timestamps are ISO 8601 strings.
 */

/**
 * An image attached to a topic — primarily a screenshot dragged into the
 * description. Bytes live on the topic (referenced from the description via an
 * `asset://<id>` markdown link), not inlined into the description string. A
 * render-time resolver swaps `asset://<id>` for `url` (preferred) or a data-URL
 * built from `data`.
 */
export interface TopicAsset {
  /** Content hash — free dedup and the stable `asset://` target. */
  id: string;
  /** MIME type, e.g. "image/png". */
  mime: string;
  /** Base64-encoded bytes. */
  data?: string;
  /** Resolvable URL, when the bytes have been offloaded (e.g. to S3). */
  url?: string;
  /** Markdown alt text. */
  alt?: string;
  /** Origin metadata, for future re-capture / open-live affordances. */
  source?: { storyId?: string; storybookUrl?: string };
}

/**
 * GitHub identity of a topic's creator. Populated when a signed-in user
 * authors a topic; left undefined for local-only topics created before
 * sign-in.
 */
export interface TopicCreator {
  githubId: number;
  githubLogin: string;
}

/**
 * A topic's reference to a subsystem model it concerns, optionally narrowed to
 * specific runtime trails (flows) within that model.
 *
 * The link lives on the **topic** side, in the local store id namespace, and
 * never on the model: a subsystem-model document is a portable artifact that
 * must not embed local topic or store ids.
 */
export interface TopicSubsystemModelRef {
  /** Store-assigned model id, e.g. "sg-1781...". */
  modelId: string;
  /** Specific runtime trails (flows) within the model, if narrower than the whole. */
  trailIds?: string[];
}

/**
 * A directional, local-only reference owned by a topic. Targets remain separate
 * artifacts; their contents and titles are resolved by the host, not copied here.
 * Referencing a C4 sketch does not make its authored hypothesis evidence.
 */
export type TopicReference =
  | { kind: 'c4-sketch'; sketchId: string }
  | { kind: 'topic'; topicId: string };

/**
 * Locally-authored topic — the shape desktop persists to
 * `~/.principal/topics/<id>.json` and edits.
 *
 * `description` / `createdBy` are optional (a Draft may be authored before
 * sign-in). Carries local-only {@link TopicAsset}s (`asset://<id>` screenshots,
 * raw `data`).
 */
export interface DraftTopic {
  /** Unique identifier in the LOCAL id namespace. */
  id: string;
  /** Display title. */
  title: string;
  /** Optional markdown body. */
  description?: string;
  /**
   * Repositories this topic is about, as PURL strings (e.g.
   * `pkg:github/owner/repo`). The topic's own source of truth for "which repos"
   * — portable and machine-independent, matching `WorkspaceMembership.repositoryId`.
   * Machine-local clone paths stay a workspace-membership concern and never
   * appear here, so this round-trips across machines.
   */
  repos?: string[];
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
  /** Creator identity; undefined for topics authored before sign-in. */
  createdBy?: TopicCreator;
  /** Local image attachments, referenced from the description via `asset://<id>`. */
  assets?: TopicAsset[];
  /**
   * Subsystem models this topic concerns, as local store ids. Local-only, since
   * the referenced models are a local artifact.
   */
  subsystemModels?: TopicSubsystemModelRef[];
  /**
   * Attached topics and C4 sketches. Whole-array replacement on update; `[]`
   * clears attachments. Independent of links in `description`: neither edits
   * the other. Hosts validate target existence and reject self-references.
   */
  references?: TopicReference[];
}
