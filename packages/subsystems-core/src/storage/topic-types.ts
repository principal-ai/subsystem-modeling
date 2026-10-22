/**
 * Canonical topic contract — the shapes every consumer of `~/.principal/topics`
 * agrees on. Browser-safe (no `node:*`); the file-per-topic store that reads and
 * writes these lives in `./node` (see `topicStore.ts`).
 *
 * A **topic** is a locally authored subject brief. {@link DraftTopic} is the
 * shape desktop persists to `~/.principal/topics/<id>.json` and edits.
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
  /** Optional workflow status. Absent reads as `new-thought`. */
  status?: TopicStatus;
  /** Local image attachments, referenced from the description via `asset://<id>`. */
  assets?: TopicAsset[];
  /**
   * Subsystem models this topic concerns, as local store ids. Local-only, since
   * the referenced models are a local artifact.
   */
  subsystemModels?: TopicSubsystemModelRef[];
}
