import React from 'react';
import type { NodeTypeDefinition } from '@principal-ai/subsystems-core';

export interface GenericNodeProps {
  /** Node ID */
  id: string;

  /** Node type definition from configuration */
  typeDefinition: NodeTypeDefinition;

  /** Node data */
  data: Record<string, unknown>;

  /** Current state (if applicable) */
  state?: string;

  /** Whether this node has violations */
  hasViolations?: boolean;
}

/**
 * Generic node renderer that adapts based on NodeTypeDefinition
 * TODO: Implement different shapes, icons, and states
 */
export const GenericNode: React.FC<GenericNodeProps> = ({
  id,
  typeDefinition,
  state,
  hasViolations,
}) => {
  // Get color based on state or default
  const color =
    state && typeDefinition.states?.[state]?.color
      ? typeDefinition.states[state].color
      : typeDefinition.color || '#888';

  return (
    <div
      style={{
        padding: '10px',
        border: `2px solid ${hasViolations ? 'red' : color}`,
        borderRadius: typeDefinition.shape === 'circle' ? '50%' : '4px',
        backgroundColor: 'white',
        minWidth: '60px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{id}</div>
      {state && <div style={{ fontSize: '10px', color: '#666' }}>{state}</div>}
      <div style={{ fontSize: '10px' }}>
        <strong>TODO:</strong> Render shapes, icons
      </div>
    </div>
  );
};
