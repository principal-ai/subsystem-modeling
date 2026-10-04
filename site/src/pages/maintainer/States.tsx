import { useMachine } from '@xstate/react'
import { setup, assign } from 'xstate'
import { SectionPager } from './shared'
import './States.css'

/**
 * Model-level verification state machine.
 * Represents the lifecycle of a subsystem model from creation through verification.
 */
const modelMachine = setup({
  types: {
    context: {} as {
      issueCount: number
      gapCount: number
      verifiedCount: number
      totalClaims: number
    },
    events: {} as
      | { type: 'AUDIT' }
      | { type: 'FIX_ISSUE' }
      | { type: 'FILL_GAP' }
      | { type: 'SOURCE_CHANGED' }
      | { type: 'RESET' },
  },
  actions: {
    incrementVerified: assign({
      verifiedCount: ({ context }) => context.verifiedCount + 1,
    }),
    decrementIssue: assign({
      issueCount: ({ context }) => Math.max(0, context.issueCount - 1),
    }),
    decrementGap: assign({
      gapCount: ({ context }) => Math.max(0, context.gapCount - 1),
    }),
    introduceIssue: assign({
      issueCount: ({ context }) => context.issueCount + 1,
      verifiedCount: ({ context }) => Math.max(0, context.verifiedCount - 1),
    }),
  },
  guards: {
    hasIssues: ({ context }) => context.issueCount > 0,
    hasGaps: ({ context }) => context.gapCount > 0,
    isFullyVerified: ({ context }) =>
      context.issueCount === 0 &&
      context.gapCount === 0 &&
      context.verifiedCount === context.totalClaims,
  },
}).createMachine({
  id: 'subsystemModel',
  initial: 'created',
  context: {
    issueCount: 2,
    gapCount: 3,
    verifiedCount: 0,
    totalClaims: 5,
  },
  states: {
    created: {
      description: 'Model created, no audit run yet',
      on: {
        AUDIT: [
          { target: 'issues', guard: 'hasIssues' },
          { target: 'partiallyVerified', guard: 'hasGaps' },
          { target: 'fullyVerified' },
        ],
      },
    },
    issues: {
      description: 'At least one claim failed verification',
      on: {
        FIX_ISSUE: {
          actions: ['decrementIssue', 'incrementVerified'],
          target: 'auditing',
        },
      },
    },
    partiallyVerified: {
      description: 'Some claims confirmed, gaps remain',
      on: {
        FILL_GAP: {
          actions: ['decrementGap', 'incrementVerified'],
          target: 'auditing',
        },
        SOURCE_CHANGED: {
          target: 'stale',
          actions: 'introduceIssue',
        },
      },
    },
    fullyVerified: {
      description: 'All claims confirmed, verifiedAtCommits stamped',
      on: {
        SOURCE_CHANGED: {
          target: 'stale',
          actions: 'introduceIssue',
        },
      },
    },
    auditing: {
      description: 'Re-running audit after a fix',
      after: {
        500: [
          { target: 'issues', guard: 'hasIssues' },
          { target: 'partiallyVerified', guard: 'hasGaps' },
          { target: 'fullyVerified' },
        ],
      },
    },
    stale: {
      description: 'Source changed since last verification',
      on: {
        AUDIT: [
          { target: 'issues', guard: 'hasIssues' },
          { target: 'partiallyVerified', guard: 'hasGaps' },
          { target: 'fullyVerified' },
        ],
      },
    },
  },
  on: {
    RESET: {
      target: '.created',
      actions: assign({
        issueCount: 2,
        gapCount: 3,
        verifiedCount: 0,
      }),
    },
  },
})

/**
 * Component-level lifecycle state machine.
 */
const componentMachine = setup({
  types: {
    events: {} as
      | { type: 'PROMOTE' }
      | { type: 'VERIFY' }
      | { type: 'FIND_ISSUE' }
      | { type: 'FIX' }
      | { type: 'SOURCE_DELETED' }
      | { type: 'CLEANUP' }
      | { type: 'RESET' },
  },
}).createMachine({
  id: 'component',
  initial: 'proposed',
  states: {
    proposed: {
      description: 'Design placeholder — code not written yet',
      on: {
        PROMOTE: 'unverified',
      },
    },
    unverified: {
      description: 'Live claim, not yet checked',
      on: {
        VERIFY: 'verified',
        FIND_ISSUE: 'hasIssues',
        SOURCE_DELETED: 'deprecated',
      },
    },
    verified: {
      description: 'All checks passed',
      on: {
        SOURCE_DELETED: 'deprecated',
        FIND_ISSUE: 'hasIssues',
      },
    },
    hasIssues: {
      description: 'At least one check failed',
      on: {
        FIX: 'unverified',
        SOURCE_DELETED: 'deprecated',
      },
    },
    deprecated: {
      description: 'Source removed upstream',
      on: {
        CLEANUP: 'removed',
      },
    },
    removed: {
      type: 'final',
      description: 'Component deleted from model',
    },
  },
  on: {
    RESET: { target: '.proposed' },
  },
})

function StateNode({
  label,
  description,
  active,
  variant,
}: {
  label: string
  description: string
  active: boolean
  variant?: 'success' | 'warning' | 'error' | 'neutral'
}) {
  const variantClass = variant ? `state-node--${variant}` : ''
  return (
    <div
      className={`state-node ${variantClass} ${active ? 'state-node--active' : ''}`}
    >
      <div className="state-node-label">{label}</div>
      <div className="state-node-description">{description}</div>
    </div>
  )
}

function ModelStateMachine() {
  const [state, send] = useMachine(modelMachine)
  const { issueCount, gapCount, verifiedCount, totalClaims } = state.context

  return (
    <div className="state-machine">
      <h3>Model Verification States</h3>
      <p className="state-machine-intro">
        A subsystem model progresses through verification as its claims are
        validated. Click the buttons to simulate the lifecycle.
      </p>

      <div className="state-machine-context">
        <span className="context-item context-item--error">
          Issues: {issueCount}
        </span>
        <span className="context-item context-item--warning">
          Gaps: {gapCount}
        </span>
        <span className="context-item context-item--success">
          Verified: {verifiedCount}/{totalClaims}
        </span>
      </div>

      <div className="state-machine-diagram state-machine-diagram--model">
        <StateNode
          label="Created"
          description="Model created, no audit run yet"
          active={state.matches('created')}
          variant="neutral"
        />
        <div className="state-arrow state-arrow--down">
          <span>AUDIT</span>
        </div>
        <div className="state-machine-row">
          <StateNode
            label="Issues"
            description="Verification failed"
            active={state.matches('issues')}
            variant="error"
          />
          <StateNode
            label="Partially Verified"
            description="Gaps remain"
            active={state.matches('partiallyVerified')}
            variant="warning"
          />
          <StateNode
            label="Fully Verified"
            description="All claims confirmed"
            active={state.matches('fullyVerified')}
            variant="success"
          />
        </div>
        <div className="state-arrow state-arrow--loop">
          <span>FIX / FILL → Re-audit</span>
        </div>
        {state.matches('auditing') && (
          <div className="state-machine-auditing">
            <div className="auditing-spinner" />
            <span>Re-auditing...</span>
          </div>
        )}
        {state.matches('stale') && (
          <div className="state-machine-stale">
            <StateNode
              label="Stale"
              description="Source changed since verification"
              active={true}
              variant="warning"
            />
          </div>
        )}
      </div>

      <div className="state-machine-actions">
        {state.matches('created') && (
          <button onClick={() => send({ type: 'AUDIT' })}>Run Audit</button>
        )}
        {state.matches('issues') && (
          <button onClick={() => send({ type: 'FIX_ISSUE' })}>
            Fix Issue (construct-fixer)
          </button>
        )}
        {state.matches('partiallyVerified') && (
          <>
            <button onClick={() => send({ type: 'FILL_GAP' })}>
              Fill Gap (construct-verifier)
            </button>
            <button
              className="btn-secondary"
              onClick={() => send({ type: 'SOURCE_CHANGED' })}
            >
              Simulate Source Change
            </button>
          </>
        )}
        {state.matches('fullyVerified') && (
          <button
            className="btn-secondary"
            onClick={() => send({ type: 'SOURCE_CHANGED' })}
          >
            Simulate Source Change
          </button>
        )}
        {state.matches('stale') && (
          <button onClick={() => send({ type: 'AUDIT' })}>Re-audit</button>
        )}
        <button className="btn-reset" onClick={() => send({ type: 'RESET' })}>
          Reset
        </button>
      </div>
    </div>
  )
}

function ComponentStateMachine() {
  const [state, send] = useMachine(componentMachine)

  return (
    <div className="state-machine">
      <h3>Component Lifecycle</h3>
      <p className="state-machine-intro">
        Each component in a model has its own lifecycle, from proposed
        placeholder to verified claim to eventual deprecation.
      </p>

      <div className="state-machine-diagram state-machine-diagram--component">
        <div className="state-machine-column">
          <StateNode
            label="Proposed"
            description="Design placeholder"
            active={state.matches('proposed')}
            variant="neutral"
          />
          <div className="state-arrow state-arrow--down">
            <span>PROMOTE</span>
          </div>
          <StateNode
            label="Unverified"
            description="Live, not checked"
            active={state.matches('unverified')}
            variant="neutral"
          />
          <div className="state-arrow state-arrow--branch">
            <span className="branch-label branch-label--left">VERIFY</span>
            <span className="branch-label branch-label--right">FIND_ISSUE</span>
          </div>
          <div className="state-machine-row">
            <StateNode
              label="Verified"
              description="All checks passed"
              active={state.matches('verified')}
              variant="success"
            />
            <StateNode
              label="Has Issues"
              description="Check(s) failed"
              active={state.matches('hasIssues')}
              variant="error"
            />
          </div>
        </div>
        <div className="state-machine-column state-machine-column--deprecated">
          <div className="deprecated-arrow">
            <span>SOURCE_DELETED</span>
          </div>
          <StateNode
            label="Deprecated"
            description="Source removed"
            active={state.matches('deprecated')}
            variant="warning"
          />
          <div className="state-arrow state-arrow--down">
            <span>CLEANUP</span>
          </div>
          <StateNode
            label="Removed"
            description="Deleted from model"
            active={state.matches('removed')}
            variant="neutral"
          />
        </div>
      </div>

      <div className="state-machine-actions">
        {state.matches('proposed') && (
          <button onClick={() => send({ type: 'PROMOTE' })}>
            Promote (fill file + symbol)
          </button>
        )}
        {state.matches('unverified') && (
          <>
            <button onClick={() => send({ type: 'VERIFY' })}>
              Verify (checks pass)
            </button>
            <button
              className="btn-secondary"
              onClick={() => send({ type: 'FIND_ISSUE' })}
            >
              Find Issue
            </button>
            <button
              className="btn-secondary"
              onClick={() => send({ type: 'SOURCE_DELETED' })}
            >
              Source Deleted
            </button>
          </>
        )}
        {state.matches('verified') && (
          <>
            <button
              className="btn-secondary"
              onClick={() => send({ type: 'FIND_ISSUE' })}
            >
              Drift (issue found)
            </button>
            <button
              className="btn-secondary"
              onClick={() => send({ type: 'SOURCE_DELETED' })}
            >
              Source Deleted
            </button>
          </>
        )}
        {state.matches('hasIssues') && (
          <>
            <button onClick={() => send({ type: 'FIX' })}>Fix Issue</button>
            <button
              className="btn-secondary"
              onClick={() => send({ type: 'SOURCE_DELETED' })}
            >
              Source Deleted
            </button>
          </>
        )}
        {state.matches('deprecated') && (
          <button onClick={() => send({ type: 'CLEANUP' })}>
            Cleanup (remove from model)
          </button>
        )}
        <button className="btn-reset" onClick={() => send({ type: 'RESET' })}>
          Reset
        </button>
      </div>
    </div>
  )
}

function VerificationLayers() {
  return (
    <div className="verification-layers">
      <h3 id="verification-layers">Verification Layers</h3>
      <p>
        The audit organizes checks into four layers that progress from
        fundamental to runtime:
      </p>

      <div className="layer-stack">
        <div className="layer layer--construct">
          <div className="layer-badge">L1</div>
          <div className="layer-content">
            <h4>Construct</h4>
            <p>
              File exists, symbol declared, construct correct, signature
              matches. "Is this component what it claims to be?"
            </p>
            <ul className="layer-checks">
              <li>File existence</li>
              <li>Symbol anchor (Graphify)</li>
              <li>Construct match</li>
              <li>Signature verification</li>
              <li>Declaration freshness</li>
            </ul>
          </div>
        </div>

        <div className="layer layer--static">
          <div className="layer-badge">L2</div>
          <div className="layer-content">
            <h4>Static Topology</h4>
            <p>
              Containment relationships — does <code>module</code> match{' '}
              <code>file</code>? Package and source-file grouping.
            </p>
            <ul className="layer-checks">
              <li>Module ↔ file alignment</li>
              <li>Package membership</li>
            </ul>
          </div>
        </div>

        <div className="layer layer--dynamic">
          <div className="layer-badge">L3</div>
          <div className="layer-content">
            <h4>Dynamic Topology</h4>
            <p>
              Runtime relationships — do members of a module agree on{' '}
              <code>process</code>? Deployment-unit membership.
            </p>
            <ul className="layer-checks">
              <li>Process consistency within modules</li>
              <li>Runtime component has process</li>
            </ul>
          </div>
        </div>

        <div className="layer layer--trail">
          <div className="layer-badge">L4</div>
          <div className="layer-content">
            <h4>Trail</h4>
            <p>
              Ordered execution stories — do step files resolve? Are lines in
              range?
            </p>
            <ul className="layer-checks">
              <li>Step file exists</li>
              <li>Step line in range</li>
              <li>Step purl matches file</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function FindingsSeverity() {
  return (
    <div className="findings-section">
      <h3 id="findings">Audit Findings</h3>
      <p>Issues discovered during an audit, organized by severity:</p>

      <div className="findings-grid">
        <div className="findings-column findings-column--error">
          <h4>
            <span className="severity-dot severity-dot--error" />
            Error (Blocking)
          </h4>
          <p>Must be fixed for the model to verify:</p>
          <ul>
            <li>
              <code>missing_file</code> — claimed file not on disk
            </li>
            <li>
              <code>symbol_ambiguous</code> — multiple Graphify nodes match
            </li>
            <li>
              <code>construct_mismatch</code> — construct contradicts Graphify
            </li>
            <li>
              <code>signature_mismatch</code> — signature types differ
            </li>
            <li>
              <code>stale_declaration</code> — declaration moved
            </li>
            <li>
              <code>boundary_*_mismatch</code> — topology inconsistency
            </li>
          </ul>
        </div>

        <div className="findings-column findings-column--info">
          <h4>
            <span className="severity-dot severity-dot--info" />
            Info (Gaps)
          </h4>
          <p>Unconfirmed claims needing follow-up:</p>
          <ul>
            <li>
              <code>construct_unconfirmed</code> — Graphify couldn't classify
            </li>
            <li>
              <code>signature_unconfirmed</code> — no signature edges
            </li>
            <li>
              <code>store_type_undeclared</code> — store has no type
            </li>
            <li>
              <code>symbol_unmatched</code> — no Graphify node
            </li>
            <li>
              <code>repo_unresolved</code> — no local checkout
            </li>
            <li>
              <code>graphify_unavailable</code> — cache not built
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function MaintainerStates() {
  return (
    <section className="maintainer-page maintainer-page--states">
      <header className="maintainer-header">
        <h1 id="states">Model States</h1>
        <p>
          A subsystem model progresses through verification states as its claims
          are validated against source code. Understanding these states helps
          you know where a model stands and what work remains.
        </p>
      </header>

      <ModelStateMachine />
      <ComponentStateMachine />
      <VerificationLayers />
      <FindingsSeverity />

      <div className="commit-provenance">
        <h3 id="provenance">Commit Provenance</h3>
        <p>Models track verification against specific commits:</p>

        <div className="provenance-cards">
          <div className="provenance-card">
            <h4>createdAtCommits</h4>
            <p>
              Immutable record of the commits each referenced repo was at when
              the model was created. The coordinate system for every{' '}
              <code>file:line</code> anchor.
            </p>
          </div>
          <div className="provenance-card">
            <h4>verifiedAtCommits</h4>
            <p>
              The commits when the audit last passed <code>fully_verified</code>
              , stamped only against a clean referenced state. Absent until
              earned.
            </p>
          </div>
        </div>

        <h4 id="freshness">Freshness Status</h4>
        <table className="freshness-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>match</code>
              </td>
              <td>Checkout is at the pinned commit</td>
            </tr>
            <tr>
              <td>
                <code>moved</code>
              </td>
              <td>HEAD has advanced since the pin</td>
            </tr>
            <tr>
              <td>
                <code>unresolved</code>
              </td>
              <td>No pinned commit or no local checkout</td>
            </tr>
          </tbody>
        </table>
      </div>

      <SectionPager sectionId="states" />
    </section>
  )
}
