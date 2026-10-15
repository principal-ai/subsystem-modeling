/**
 * Canonical topic contract — the shapes every consumer of `~/.principal/topics`
 * agrees on. Browser-safe (no `node:*`); the file-per-topic store that reads and
 * writes these lives in `./node` (see `topicStore.ts`).
 *
 * A **topic** is a locally authored subject brief that may be published. Two
 * distinct named shapes, split by id-namespace / ownership, with an explicit
 * translation between them — NOT one shared shape. Their `id` fields live in
 * different namespaces (local vs server), so passing one where the other is
 * expected corrupts topic identity.
 *
 * - {@link DraftTopic}     — locally-authored, what desktop persists + edits.
 * - {@link PublishedTopic} — server-authoritative, what the server returns and
 *                            mobile reads.
 * - {@link publishedFromDraft} — the Draft -> Published projection (one-way;
 *                            there is no reverse hydration).
 *
 * All timestamps are ISO 8601 strings because this contract crosses the
 * desktop/web boundary.
 */

/**
 * Status of a topic — a small structured axis plus optional human nuance.
 *
 * `state` is the machine-meaningful signal (drives badge color, sorting, and
 * filtering). `label` is free-form text shown in place of the default per-state
 * label. `waitingOn` describes an external blocker and is meaningful when
 * `state` is `waiting`.
 *
 * The structured shape is deliberate: it lets automations check and resolve a
 * blocker without parsing prose — e.g. flip `waiting` -> `paused` once `until`
 * passes, or once a referenced PR merges.
 */
export interface TopicStatus {
  /**
   * Structured lifecycle axis, ordered by a feature's "aliveness" from nascent
   * to retired. Readers treat an absent OR unrecognized `state` as
   * `new-thought`, so legacy topics and renamed values need no migration.
   */
  state:
    'new-thought' | 'working' | 'paused' | 'waiting' | 'done-for-now' | 'deprecated' | 'abandoned';
  /** Free-form text shown in place of the default label for the state. */
  label?: string;
  /** External blocker description. Meaningful when `state` is `waiting`. */
  waitingOn?: {
    /** Human description of the blocker, e.g. "design sign-off". */
    note?: string;
    /** ISO 8601 — when the hold is expected to lift. */
    until?: string;
    /** Structured pointer to the thing being waited on, for automations. */
    ref?: {
      kind: 'url' | 'pr' | 'issue' | 'topic';
      /** The address/id of the referenced thing. */
      value: string;
      /** Optional human label for display. */
      title?: string;
    };
  };
}

/**
 * An image attached to a topic — primarily a screenshot dragged into the
 * description. Bytes live on the topic (referenced from the description via an
 * `asset://<id>` markdown link), not inlined into the description string. A
 * render-time resolver swaps `asset://<id>` for `url` (preferred) or a data-URL
 * built from `data`, keeping a local (data-only) and a published (url-bearing)
 * topic interchangeable on read.
 *
 * Local-only on a {@link DraftTopic}: assets are uploaded/resolved at publish
 * time, so a {@link PublishedTopic} carries the resolved `url`, not raw `data`.
 */
export interface TopicAsset {
  /** Content hash — free dedup and the stable `asset://` target. */
  id: string;
  /** MIME type, e.g. "image/png". */
  mime: string;
  /** Base64-encoded bytes. Present locally and on publish. */
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
 * sign-in. The server requires this on publish.
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
 * never on the model: a subsystem-model document is a portable, host-free
 * artifact (shared/published) that must not embed local topic or store ids.
 */
export interface TopicSubsystemModelRef {
  /** Store-assigned model id, e.g. "sg-1781...". */
  modelId: string;
  /** Specific runtime trails (flows) within the model, if narrower than the whole. */
  trailIds?: string[];
}

/**
 * Locally-authored topic — the shape desktop persists to
 * `~/.principal/topics/<id>.json` and edits.
 *
 * Local id namespace. `description` / `createdBy` are optional (a Draft may be
 * authored before sign-in). Carries local-only {@link TopicAsset}s
 * (`asset://<id>` screenshots, raw `data`). Has NO `visibility` — that's a
 * published concept.
 *
 * A Draft keeps existing after publish (it can be in a "published state"); its
 * link to the server identity lives in the desktop's `topics-sync.json`
 * sidecar, not in this shape.
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
   * appear here, so this round-trips across machines on publish/fetch.
   */
  repos?: string[];
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
  /** Creator identity; undefined for topics authored before sign-in. */
  createdBy?: TopicCreator;
  /** Optional workflow status. Absent reads as `new-thought`. */
  status?: TopicStatus;
  /** Local image attachments, referenced from the description via `asset://<id>`. */
  assets?: TopicAsset[];
  /**
   * Subsystem models this topic concerns, as local store ids. Local-only: not
   * carried on publish, since the referenced models are a local artifact.
   */
  subsystemModels?: TopicSubsystemModelRef[];
}

/**
 * Server-authoritative topic — the shape the server returns and mobile reads.
 *
 * Remote id namespace. `description` / `createdBy` are required (publish is the
 * validation gate). Carries `visibility`; assets have been resolved to `url`s.
 *
 * CAVEAT: "Published" means "has a server identity", NOT "public" — a
 * PublishedTopic can be `visibility: 'private'`.
 */
export interface PublishedTopic {
  /** Unique identifier in the REMOTE (server) id namespace. */
  id: string;
  /** Display title. */
  title: string;
  /** Markdown body — required on the server. */
  description: string;
  /**
   * Repositories this topic is about, as PURL strings (e.g.
   * `pkg:github/owner/repo`). Travels with the topic across the wire so a
   * received shared topic carries its repos; preserved on publish/fetch.
   */
  repos?: string[];
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
  /** Creator identity — required on the server. */
  createdBy: TopicCreator;
  /** Optional workflow status, travels with the topic when published. */
  status?: TopicStatus;
  /** Server visibility. "private" is still a PublishedTopic. */
  visibility: 'private' | 'public';
}

/**
 * Inputs the {@link DraftTopic} cannot supply on its own — the namespace
 * crossing and the fields publish must enforce. The caller resolves these
 * before projecting:
 * - `createdBy`: required on the server; supplied here if the draft lacks it.
 * - `visibility`: a published concept the draft never carries.
 */
export interface PublishProjection {
  createdBy: TopicCreator;
  visibility: 'private' | 'public';
}

/**
 * Project a {@link DraftTopic} into a {@link PublishedTopic} — the one-way
 * Draft -> Published translation. It does NOT perform any I/O (no id minting,
 * no asset upload, no network): the caller resolves the namespace-crossing and
 * required fields into {@link PublishProjection} first (uploading assets,
 * choosing visibility), and this enforces the shape.
 *
 * One-way by design: there is no reverse `PublishedTopic -> DraftTopic`
 * hydration. A published topic's edits write through to the server; the local
 * Draft is reconciled from the server's response field-by-field, never by
 * rebuilding a Draft from a Published shape.
 *
 * Throws if `description` is empty — publish is also the validation gate, and
 * the server rejects a description-less topic.
 */
export function publishedFromDraft(
  draft: DraftTopic,
  projection: PublishProjection
): PublishedTopic {
  const description = (draft.description ?? '').trim();
  if (description.length === 0) {
    throw new Error(`Topic ${draft.id} has no description; a description is required to publish.`);
  }
  return {
    id: draft.id,
    title: draft.title,
    description,
    ...(draft.repos !== undefined ? { repos: draft.repos } : {}),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    createdBy: projection.createdBy,
    ...(draft.status !== undefined ? { status: draft.status } : {}),
    visibility: projection.visibility,
  };
}
