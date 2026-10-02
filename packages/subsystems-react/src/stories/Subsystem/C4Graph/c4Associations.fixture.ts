// GENERATED from live store data by generateFixture.ts — do not hand-edit.
//
// Derived from the SAME composition as c4Fixture.ts: 225 components
// → 13 container keys → 13 associations.
//
// Every association is state:'proposed'. None of it is accepted — accepting is
// a human's decision, and this story exists to make that decision visible.

import type { C4Association } from "../../../subsystem/toC4";

/** Container keys whose trailing role matches — candidates for a merge. */
export const C4_MERGE_CANDIDATES = [
  {
    "role": "host",
    "keys": [
      "principal-studio/host",
      "subsystems-studio/host"
    ],
    "reason": "2 process keys end in \"/host\" (principal-studio/host, subsystems-studio/host) — one deployable unit under two names, or two units?"
  },
  {
    "role": "renderer",
    "keys": [
      "principal-studio/renderer",
      "subsystems-studio/renderer"
    ],
    "reason": "2 process keys end in \"/renderer\" (principal-studio/renderer, subsystems-studio/renderer) — one deployable unit under two names, or two units?"
  }
] as const;

/** Every mechanical concern, for the review panel. */
export const C4_CONCERNS = [
  {
    "target": "subsystems-studio/host",
    "kind": "store_unclassified",
    "message": "1 store(s) in \"subsystems-studio/host\" declare no storage kind (c127) — decide whether each is a C4 data store or an internal detail",
    "members": [
      "c127"
    ]
  },
  {
    "target": "subsystems-studio/renderer",
    "kind": "store_unclassified",
    "message": "4 store(s) in \"subsystems-studio/renderer\" declare no storage kind (c42, c95, c102, c131) — decide whether each is a C4 data store or an internal detail",
    "members": [
      "c42",
      "c95",
      "c102",
      "c131"
    ]
  },
  {
    "target": "site/web",
    "kind": "missing_technology",
    "message": "container \"site/web\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c82",
      "c83",
      "c84"
    ]
  },
  {
    "target": "subsystems-core/types",
    "kind": "missing_technology",
    "message": "container \"subsystems-core/types\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c85",
      "c86",
      "c87"
    ]
  },
  {
    "target": "principal-studio-cli",
    "kind": "singleton",
    "message": "process \"principal-studio-cli\" has exactly one member (c88) — a lone function is not a deployable unit",
    "members": [
      "c88"
    ]
  },
  {
    "target": "principal-studio-cli",
    "kind": "missing_technology",
    "message": "container \"principal-studio-cli\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c88"
    ]
  },
  {
    "target": "subsystems-react",
    "kind": "missing_technology",
    "message": "container \"subsystems-react\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c96",
      "c97",
      "c98",
      "c99",
      "c100",
      "c101",
      "c108",
      "c109",
      "c112",
      "c113",
      "c114"
    ]
  },
  {
    "target": "subsystems-react",
    "kind": "store_unclassified",
    "message": "1 store(s) in \"subsystems-react\" declare no storage kind (c98) — decide whether each is a C4 data store or an internal detail",
    "members": [
      "c98"
    ]
  },
  {
    "target": "subsystems-core",
    "kind": "missing_technology",
    "message": "container \"subsystems-core\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c106",
      "c107",
      "c167"
    ]
  },
  {
    "target": "subsystems-studio/shared",
    "kind": "library_shaped",
    "message": "process \"subsystems-studio/shared\" has 2 member(s) but none execute at runtime (type_alias) — this reads as a library, not a container",
    "members": [
      "c132",
      "c133"
    ]
  },
  {
    "target": "packages/subsystems-studio/run",
    "kind": "missing_technology",
    "message": "container \"packages/subsystems-studio/run\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c147",
      "c148",
      "c149"
    ]
  },
  {
    "target": "packages/subsystems-studio/run",
    "kind": "store_unclassified",
    "message": "1 store(s) in \"packages/subsystems-studio/run\" declare no storage kind (c148) — decide whether each is a C4 data store or an internal detail",
    "members": [
      "c148"
    ]
  },
  {
    "target": "principal-studio/host",
    "kind": "singleton",
    "message": "process \"principal-studio/host\" has exactly one member (c155) — a lone function is not a deployable unit",
    "members": [
      "c155"
    ]
  },
  {
    "target": "principal-studio/host",
    "kind": "missing_technology",
    "message": "container \"principal-studio/host\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c155"
    ]
  },
  {
    "target": "subsystems-react/session-ui",
    "kind": "singleton",
    "message": "process \"subsystems-react/session-ui\" has exactly one member (c211) — a lone function is not a deployable unit",
    "members": [
      "c211"
    ]
  },
  {
    "target": "subsystems-react/session-ui",
    "kind": "missing_technology",
    "message": "container \"subsystems-react/session-ui\" has no framework signal — C4 requires a technology on every container",
    "members": [
      "c211"
    ]
  }
] as const;

export const c4Associations: C4Association[] = [
  {
    "id": "container:(unassigned)",
    "level": "container",
    "sourceKeys": [
      "(unassigned)"
    ],
    "label": "(unassigned)",
    "type": "application",
    "technology": "react",
    "state": "proposed",
    "author": "c4-proposer"
  },
  {
    "id": "container:packages/subsystems-studio/run",
    "level": "container",
    "sourceKeys": [
      "packages/subsystems-studio/run"
    ],
    "label": "packages/subsystems-studio/run",
    "type": "application",
    "state": "proposed",
    "rationale": "container \"packages/subsystems-studio/run\" has no framework signal — C4 requires a technology on every container 1 store(s) in \"packages/subsystems-studio/run\" declare no storage kind (c148) — decide whether each is a C4 data store or an internal detail",
    "author": "c4-proposer"
  },
  {
    "id": "container:principal-studio-cli",
    "level": "container",
    "sourceKeys": [
      "principal-studio-cli"
    ],
    "label": "principal-studio-cli",
    "type": "application",
    "state": "proposed",
    "rationale": "process \"principal-studio-cli\" has exactly one member (c88) — a lone function is not a deployable unit container \"principal-studio-cli\" has no framework signal — C4 requires a technology on every container",
    "author": "c4-proposer"
  },
  {
    "id": "container:principal-studio/host",
    "level": "container",
    "sourceKeys": [
      "principal-studio/host"
    ],
    "label": "principal-studio/host",
    "type": "application",
    "state": "proposed",
    "rationale": "process \"principal-studio/host\" has exactly one member (c155) — a lone function is not a deployable unit container \"principal-studio/host\" has no framework signal — C4 requires a technology on every container",
    "author": "c4-proposer"
  },
  {
    "id": "container:principal-studio/renderer",
    "level": "container",
    "sourceKeys": [
      "principal-studio/renderer"
    ],
    "label": "principal-studio/renderer",
    "type": "application",
    "technology": "react",
    "state": "proposed",
    "author": "c4-proposer"
  },
  {
    "id": "container:site/web",
    "level": "container",
    "sourceKeys": [
      "site/web"
    ],
    "label": "site/web",
    "type": "application",
    "state": "proposed",
    "rationale": "container \"site/web\" has no framework signal — C4 requires a technology on every container",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-core",
    "level": "container",
    "sourceKeys": [
      "subsystems-core"
    ],
    "label": "subsystems-core",
    "type": "application",
    "state": "proposed",
    "rationale": "container \"subsystems-core\" has no framework signal — C4 requires a technology on every container",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-core/types",
    "level": "container",
    "sourceKeys": [
      "subsystems-core/types"
    ],
    "label": "subsystems-core/types",
    "type": "application",
    "state": "proposed",
    "rationale": "container \"subsystems-core/types\" has no framework signal — C4 requires a technology on every container",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-react",
    "level": "container",
    "sourceKeys": [
      "subsystems-react"
    ],
    "label": "subsystems-react",
    "type": "application",
    "state": "proposed",
    "rationale": "container \"subsystems-react\" has no framework signal — C4 requires a technology on every container 1 store(s) in \"subsystems-react\" declare no storage kind (c98) — decide whether each is a C4 data store or an internal detail",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-react/session-ui",
    "level": "container",
    "sourceKeys": [
      "subsystems-react/session-ui"
    ],
    "label": "subsystems-react/session-ui",
    "type": "application",
    "state": "proposed",
    "rationale": "process \"subsystems-react/session-ui\" has exactly one member (c211) — a lone function is not a deployable unit container \"subsystems-react/session-ui\" has no framework signal — C4 requires a technology on every container",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-studio/host",
    "level": "container",
    "sourceKeys": [
      "subsystems-studio/host"
    ],
    "label": "subsystems-studio/host",
    "type": "data-store",
    "technology": "bun",
    "state": "proposed",
    "rationale": "1 store(s) in \"subsystems-studio/host\" declare no storage kind (c127) — decide whether each is a C4 data store or an internal detail",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-studio/renderer",
    "level": "container",
    "sourceKeys": [
      "subsystems-studio/renderer"
    ],
    "label": "subsystems-studio/renderer",
    "type": "application",
    "technology": "react",
    "state": "proposed",
    "rationale": "4 store(s) in \"subsystems-studio/renderer\" declare no storage kind (c42, c95, c102, c131) — decide whether each is a C4 data store or an internal detail",
    "author": "c4-proposer"
  },
  {
    "id": "container:subsystems-studio/shared",
    "level": "container",
    "sourceKeys": [
      "subsystems-studio/shared"
    ],
    "label": "subsystems-studio/shared",
    "type": "library",
    "state": "proposed",
    "rationale": "process \"subsystems-studio/shared\" has 2 member(s) but none execute at runtime (type_alias) — this reads as a library, not a container",
    "author": "c4-proposer"
  }
];
