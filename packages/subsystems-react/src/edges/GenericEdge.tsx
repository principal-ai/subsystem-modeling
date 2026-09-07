import React from 'react';
import type { EdgeTypeDefinition } from '@principal-ai/subsystems-core';

export interface GenericEdgeProps {
  /** Edge ID */
  id: string;

  /** Edge type definition from configuration */
  typeDefinition: EdgeTypeDefinition;

  /** Edge data */
  data?: Record<string, unknown>;

  /** Whether this edge has violations */
  hasViolations?: boolean;
}

/**
 * Generic edge renderer that adapts based on EdgeTypeDefinition
 * TODO: Implement different styles, animations, and labels
 */
export const GenericEdge: React.FC<GenericEdgeProps> = ({ id, typeDefinition, hasViolations }) => {
  const color = hasViolations ? 'red' : typeDefinition.color || '#888';

  return (
    <div>
      {/* This is a placeholder - actual edge rendering happens in xyflow */}
      <div style={{ fontSize: '10px', color }}>
        Edge: {id} ({typeDefinition.style})
      </div>
      <div style={{ fontSize: '8px' }}>
        <strong>TODO:</strong> Render in xyflow with proper styling
      </div>
    </div>
  );
};
