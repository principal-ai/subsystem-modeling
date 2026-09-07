/**
 * OTEL Boundary Node
 *
 * Renders boundary nodes as rounded rectangles with:
 * - Direction identifier (inbound/outbound)
 * - Direction badge (arrow indicating flow)
 * - Status and references badges
 */

import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import { NodeTooltip } from '../../components/NodeTooltip';
import type { OtelInfo } from '../../components/NodeTooltip';
import { NodeBadges } from './shared/NodeBadges';
import { NodeContent } from './shared/NodeContent';
import { useNodeBehavior } from './shared/useNodeBehavior';
import type { BoundaryData } from './shared/types';

export interface OtelBoundaryNodeData extends Record<string, unknown> {
  name: string;
  typeDefinition: {
    color?: string;
    icon?: string;
    states?: Record<string, { color?: string; label?: string; icon?: string }>;
  };
  state?: string;
  hasViolations?: boolean;
  data: {
    color?: string;
    scopeColor?: string;
    spanColor?: string;
    stroke?: string;
    icon?: string;
    status?: 'draft' | 'approved' | 'implemented';
    description?: string;
    sources?: string[];
    references?: string[];
    states?: Record<string, { color?: string; label?: string; icon?: string }>;
    boundary?: BoundaryData;
    otel?: { files?: string[] };
  };
  editable?: boolean;
  tooltipsEnabled?: boolean;
  shiftKeyPressed?: boolean;
  isHighlighted?: boolean;
  isActive?: boolean;
  isHidden?: boolean;
  animationType?: 'pulse' | 'flash' | 'shake' | 'entry' | null;
  animationDuration?: number;
}

export const OtelBoundaryNode: React.FC<NodeProps<Node<OtelBoundaryNodeData>>> = ({
  data,
  selected,
  dragging,
}) => {
  const { theme } = useTheme();
  const nodeProps = data;
  const {
    typeDefinition,
    state,
    hasViolations,
    data: nodeData,
    editable = false,
    tooltipsEnabled = true,
    shiftKeyPressed = false,
    isHighlighted = false,
    isActive = true,
    isHidden = false,
    animationType,
    animationDuration = 1000,
  } = nodeProps;

  const {
    nodeRef,
    showTooltip,
    handleMouseDown,
    handleMouseEnter,
    handleMouseLeave,
    handleResizeEnd,
  } = useNodeBehavior({ editable, tooltipsEnabled, shiftKeyPressed, selected, dragging });

  const nodeOpacity = isHidden ? 0.4 : isActive ? 1 : 0.1;

  // Color resolution
  const scopeColor = nodeData.scopeColor as string | undefined;
  const spanColor = nodeData.spanColor as string | undefined;
  const nodeDataColor = nodeData.color as string | undefined;
  // Fill color priority: explicit color > scope color > type definition color > default cyan
  const baseFillColor = nodeDataColor || scopeColor || typeDefinition.color || '#06b6d4';
  const fillColor = baseFillColor;
  // Stroke color priority: explicit stroke > span color (workflow context) > fill color
  const nodeDataStroke = nodeData.stroke as string | undefined;
  const strokeColor = nodeDataStroke || spanColor || fillColor;

  // Display info
  const displayName = nodeProps.name;
  const boundaryData = nodeData.boundary;
  const identifier = boundaryData?.direction;

  // Badge data
  const status = nodeData.status;
  const sourceFiles = nodeData.otel?.files || nodeData.sources;
  const references = nodeData.references;
  const description = nodeData.description;

  // Icon
  const icon =
    (nodeData.icon as string) ||
    (state && nodeData.states?.[state]?.icon) ||
    typeDefinition.icon;

  const stateDefinitions = nodeData.states || typeDefinition.states;

  const getAnimationClass = () => {
    switch (animationType) {
      case 'pulse': return 'node-pulse';
      case 'flash': return 'node-flash';
      case 'shake': return 'node-shake';
      case 'entry': return 'node-entry';
      default: return '';
    }
  };

  const borderStyle = status === 'draft' ? 'dotted' : status === 'approved' ? 'dashed' : 'solid';

  const boundaryStyle: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: fillColor,
    color: '#000',
    border: `2px ${borderStyle} ${hasViolations ? '#D0021B' : strokeColor}`,
    fontSize: theme.fontSizes[0],
    fontWeight: theme.fontWeights.medium,
    fontFamily: theme.fonts.body,
    width: '100%',
    height: '100%',
    minWidth: 20,
    minHeight: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    boxShadow: isHighlighted
      ? '0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)'
      : selected
        ? `0 0 0 2px ${strokeColor}`
        : '0 2px 4px rgba(0,0,0,0.1)',
    opacity: nodeOpacity,
    transition: 'box-shadow 0.2s ease, opacity 0.3s ease',
    animationDuration: animationType ? `${animationDuration}ms` : undefined,
    boxSizing: 'border-box',
    borderRadius: '8px', // Rounded corners for boundary nodes
  };

  const handleStyle = editable
    ? { background: fillColor, width: 12, height: 12, border: '2px solid white', boxShadow: '0 0 0 1px ' + fillColor }
    : { background: fillColor, width: 8, height: 8, opacity: 0, pointerEvents: 'none' as const };

  return (
    <>
      {editable && (
        <NodeResizer
          color={strokeColor}
          isVisible={selected}
          minWidth={40}
          minHeight={30}
          onResizeEnd={handleResizeEnd}
          handleStyle={{ width: 8, height: 8, borderRadius: 2, zIndex: 20 }}
          lineStyle={{ borderWidth: 1, zIndex: 20 }}
        />
      )}

      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" style={handleStyle} />

      <div
        ref={nodeRef}
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <NodeBadges
          shape="rectangle"
          status={status}
          sourceFiles={sourceFiles}
          references={references}
          boundary={boundaryData}
          opacity={nodeOpacity}
        />
        <div style={boundaryStyle} className={getAnimationClass()}>
          <NodeContent
            displayName={displayName}
            identifier={identifier}
            icon={icon}
            state={state}
            stateDefinitions={stateDefinitions}
            hasViolations={hasViolations}
          />
        </div>
        {tooltipsEnabled && (
          <NodeTooltip
            description={description}
            otel={nodeData.otel as OtelInfo}
            sources={nodeData.sources}
            references={references}
            visible={showTooltip}
            nodeRef={nodeRef}
          />
        )}
      </div>

      <Handle type="source" position={Position.Top} id="top-out" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom-out" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left-out" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right-out" style={handleStyle} />
    </>
  );
};
