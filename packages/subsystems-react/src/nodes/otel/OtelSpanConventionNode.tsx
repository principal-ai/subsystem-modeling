/**
 * OTEL Span Convention Node
 *
 * Renders span convention nodes as hexagons with:
 * - Span pattern identifier
 * - Workflow chips showing which workflows use this span
 * - Status, sources, and references badges
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
import type { WorkflowChip } from './shared/types';

export interface OtelSpanConventionNodeData extends Record<string, unknown> {
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
    otel?: {
      spanPattern?: string;
      files?: string[];
    };
    /** Workflow chips to display */
    workflowChips?: WorkflowChip[];
    /** Callback when workflow chip is clicked */
    onWorkflowChipClick?: (chipId: string) => void;
    /** Currently selected workflow ID */
    selectedWorkflowId?: string;
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

export const OtelSpanConventionNode: React.FC<
  NodeProps<Node<OtelSpanConventionNodeData>>
> = ({ data, selected, dragging }) => {
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
    animationDuration: _animationDuration = 1000,
  } = nodeProps;

  const {
    nodeRef,
    showTooltip,
    handleMouseDown,
    handleMouseEnter,
    handleMouseLeave,
    handleResizeEnd,
  } = useNodeBehavior({
    editable,
    tooltipsEnabled,
    shiftKeyPressed,
    selected,
    dragging,
  });

  // Calculate opacity based on node state
  const nodeOpacity = isHidden ? 0.4 : isActive ? 1 : 0.1;

  // Color resolution
  const scopeColor = nodeData.scopeColor as string | undefined;
  const spanColor = nodeData.spanColor as string | undefined;
  const nodeDataColor = nodeData.color as string | undefined;
  // Fill color priority: explicit color > scope color > type definition color > default purple
  const baseFillColor = nodeDataColor || scopeColor || typeDefinition.color || '#8b5cf6';
  const fillColor = baseFillColor;
  // Stroke color priority: explicit stroke > span color (workflow context) > fill color
  const nodeDataStroke = nodeData.stroke as string | undefined;
  const strokeColor = nodeDataStroke || spanColor || fillColor;

  // Get display info
  const displayName = nodeProps.name;
  const otelData = nodeData.otel;
  const identifier = otelData?.spanPattern;

  // Extract badge data
  const status = nodeData.status;
  const sourceFiles = otelData?.files || nodeData.sources;
  const references = nodeData.references;
  const description = nodeData.description;

  // Icon priority
  const icon =
    (nodeData.icon as string) ||
    (state && nodeData.states?.[state]?.icon) ||
    (state && typeDefinition.states?.[state]?.icon) ||
    typeDefinition.icon;

  // State definitions for label lookup
  const stateDefinitions = nodeData.states || typeDefinition.states;

  // Workflow chips
  const workflowChips = nodeData?.workflowChips;
  const onWorkflowChipClick = nodeData?.onWorkflowChipClick;
  const selectedWorkflowId = nodeData?.selectedWorkflowId;

  // Animation class
  const getAnimationClass = () => {
    switch (animationType) {
      case 'pulse':
        return 'node-pulse';
      case 'flash':
        return 'node-flash';
      case 'shake':
        return 'node-shake';
      case 'entry':
        return 'node-entry';
      default:
        return '';
    }
  };

  // Hexagon styles
  const hexagonClipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
  const hexagonBorderWidth = 2;

  const hexagonBorderStyle: React.CSSProperties = {
    position: 'relative',
    clipPath: hexagonClipPath,
    backgroundColor: hasViolations ? '#D0021B' : strokeColor,
    width: '100%',
    height: '100%',
    minWidth: 20,
    minHeight: 20,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    opacity: nodeOpacity,
    transition: 'opacity 0.3s ease',
    boxSizing: 'border-box',
  };

  const hexagonInnerStyle: React.CSSProperties = {
    position: 'absolute',
    top: hexagonBorderWidth,
    left: hexagonBorderWidth,
    right: hexagonBorderWidth,
    bottom: hexagonBorderWidth,
    clipPath: hexagonClipPath,
    backgroundColor: fillColor,
    color: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: theme.fontSizes[0],
    fontWeight: theme.fontWeights.medium,
    fontFamily: theme.fonts.body,
    gap: '4px',
    padding: '8px 20px',
  };

  // Handle styles
  const handleStyle = editable
    ? {
        background: fillColor,
        width: 12,
        height: 12,
        border: '2px solid white',
        boxShadow: '0 0 0 1px ' + fillColor,
        zIndex: 10,
      }
    : {
        background: fillColor,
        width: 8,
        height: 8,
        opacity: 0,
        pointerEvents: 'none' as const,
        zIndex: 10,
      };

  return (
    <>
      {/* Node Resizer */}
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

      {/* Input handles */}
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" style={handleStyle} />

      {/* Hexagon node */}
      <div
        ref={nodeRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          boxShadow: isHighlighted
            ? '0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)'
            : selected
              ? `0 0 0 2px ${strokeColor}`
              : 'none',
          transition: 'box-shadow 0.2s ease',
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Badges */}
        <NodeBadges
          shape="hexagon"
          status={status}
          sourceFiles={sourceFiles}
          references={references}
          opacity={nodeOpacity}
        />

        {/* Hexagon shape */}
        <div style={hexagonBorderStyle} className={getAnimationClass()}>
          <div style={hexagonInnerStyle}>
            <NodeContent
              displayName={displayName}
              identifier={identifier}
              icon={icon}
              state={state}
              stateDefinitions={stateDefinitions}
              hasViolations={hasViolations}
              workflowChips={workflowChips}
              onWorkflowChipClick={onWorkflowChipClick}
              selectedWorkflowId={selectedWorkflowId}
            />
          </div>
        </div>

        {/* Tooltip */}
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

      {/* Output handles */}
      <Handle type="source" position={Position.Top} id="top-out" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom-out" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left-out" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right-out" style={handleStyle} />
    </>
  );
};
