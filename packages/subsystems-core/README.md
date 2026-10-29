# @principal-ai/subsystems-core

Subsystem model types/schema and agent-session tooling for Principal AI.

## Entry points

| Import | Use |
|---|---|
| `@principal-ai/subsystems-core` | Browser-safe subsystem model/topic types, reference links + `isSubsystemModelDocument` |
| `@principal-ai/subsystems-core/node` | OpenCode store, agent-session list/fetch/normalize, topic store, fixtures |
| `@principal-ai/subsystems-core/pipeline` | Bun-safe session normalize/accumulate (no `better-sqlite3`) |

## Schema

Portable document schema: `schemas/subsystem-model.schema.json`

## Topic references

`DraftTopic.references` attaches local topics and C4 sketches by ID:

```ts
import {
  formatTopicReferenceLink,
  parseTopicReferenceLink,
  type TopicReference,
} from '@principal-ai/subsystems-core';

const reference: TopicReference = { kind: 'c4-sketch', sketchId: 'c4s-123-abc' };
formatTopicReferenceLink(reference); // principal://c4-sketch/c4s-123-abc
parseTopicReferenceLink('principal://topic/topic-123-abc');
// { kind: 'topic', topicId: 'topic-123-abc' }
```

Create/update accepts `references`; updates replace the whole array (`[]` clears
it). Existing topics may omit the field. References are directional and local-only.
Targets stay separate artifacts; deleting a target leaves a missing reference,
not a cascading deletion. Existing `subsystemModels` associations are unchanged.

Markdown links such as `[Architecture](principal://c4-sketch/c4s-123-abc)` and
`[Related](principal://topic/topic-123-abc)` use the same target shapes but are
independent of attachments. Helpers only format/parse hrefs; hosts must allow the
`principal` protocol in Markdown sanitizers and handle resolution, navigation,
target validation, deduplication, and self-reference rejection. Sketch references
do not turn authored hypotheses into evidence.

## Installation

```bash
npm install @principal-ai/subsystems-core
# or
bun add @principal-ai/subsystems-core
```

Peer: `@principal-ai/agent-monitoring` (session pipeline / fixtures).

## License

Apache-2.0
