import React, { useState, useRef, useCallback } from 'react';
import { Handle, Position, NodeResizer, useNodeId } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { NodeTypeDefinition } from '@principal-ai/subsystems-core';
import { useTheme } from '@principal-ade/industry-theme';
import { resolveIcon } from '../utils/iconResolver';
import { NodeTooltip } from '../components/NodeTooltip';
import type { OtelInfo } from '../components/NodeTooltip';
import { useGraphEdit } from '../contexts/GraphEditContext';

// OTEL node components
import {
  OtelSpanConventionNode,
  OtelEventNode,
  OtelScopeNode,
  OtelResourceNode,
  OtelBoundaryNode,
} from './otel';

export interface CustomNodeData extends Record<string, unknown> {
  name: string;
  typeDefinition: NodeTypeDefinition;
  state?: string;
  hasViolations?: boolean;
  data: Record<string, unknown>;
  // Animation control
  animationType?: 'pulse' | 'flash' | 'shake' | 'entry' | null;
  animationDuration?: number;
  // Edit mode - shows larger connection handles
  editable?: boolean;
  // Pending text change (from inline editing, not yet saved)
  pendingText?: string;
  // Whether tooltips are enabled (defaults to true)
  tooltipsEnabled?: boolean;
  // Whether shift key is currently pressed (for tooltip control)
  shiftKeyPressed?: boolean;
  // Whether this node is highlighted (e.g., during execution playback)
  isHighlighted?: boolean;
  // Whether this node is active (involved in current execution scenario)
  // If false, node will be dimmed to de-emphasize it
  isActive?: boolean;
  // Whether this node is hidden by user (shift-click)
  // If true, node will be dimmed less than inactive nodes
  isHidden?: boolean;
}

/**
 * Custom node component for xyflow that renders based on NodeTypeDefinition
 *
 * This component now delegates to specialized OTEL node components when the
 * node type matches an OTEL concept. This allows each OTEL node type to have
 * its own specialized rendering and features (e.g., workflow chips on span nodes).
 */
export const CustomNode: React.FC<NodeProps<Node<CustomNodeData>>> = (props) => {
  const { data, selected, dragging } = props;

  // Determine the OTEL node type from nodeData.nodeType (pv.nodeType in canvas)
  // The typeDefinition.shape can also hint at OTEL types but nodeType is authoritative
  const nodeType = data.data?.nodeType as string | undefined;

  // Delegate to specialized OTEL node components
  switch (nodeType) {
    case 'otel-span-convention':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <OtelSpanConventionNode {...(props as any)} />;
    case 'otel-event':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <OtelEventNode {...(props as any)} />;
    case 'otel-scope':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <OtelScopeNode {...(props as any)} />;
    case 'otel-resource':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <OtelResourceNode {...(props as any)} />;
    case 'otel-boundary':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <OtelBoundaryNode {...(props as any)} />;
  }

  // Fall through to legacy rendering for non-OTEL nodes
  const { theme } = useTheme();
  const { onNodeResizeEnd, onNodeTextChange, onToggleNodeHidden, onHideUnconnectedNodes } = useGraphEdit();
  const nodeId = useNodeId();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState('');
  const nodeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeProps = data;
  const {
    typeDefinition,
    state,
    hasViolations,
    data: nodeData,
    animationType,
    animationDuration = 1000,
    editable = false,
    tooltipsEnabled = true,
    shiftKeyPressed = false,
    isHighlighted = false,
    isActive = true, // Default to active if not specified
    isHidden = false, // Default to not hidden
  } = nodeProps;

  // Calculate opacity based on node state
  // Hidden nodes (shift-clicked) are dimmed to 0.4
  // Inactive nodes (scenario filtering) are dimmed to 0.1
  const nodeOpacity = isHidden ? 0.4 : isActive ? 1 : 0.1;

  // Handle resize end - notify parent to track the dimension change
  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      if (nodeId && onNodeResizeEnd && params.width && params.height) {
        onNodeResizeEnd(nodeId, {
          width: Math.round(params.width),
          height: Math.round(params.height),
        });
      }
    },
    [nodeId, onNodeResizeEnd]
  );

  // Handle Cmd/Ctrl+mousedown to toggle hidden state
  // We use mousedown instead of click because in edit mode with draggable nodes,
  // ReactFlow's drag system intercepts Cmd+click before it becomes a click event
  // - Cmd/Ctrl+Shift+click: hide all nodes not directly connected to this node
  // - Cmd/Ctrl+click: toggle this single node's hidden state
  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if ((event.metaKey || event.ctrlKey) && nodeId) {
        event.preventDefault();
        event.stopPropagation();

        if (event.shiftKey && onHideUnconnectedNodes) {
          // Cmd/Ctrl+Shift+click: hide unconnected nodes
          onHideUnconnectedNodes(nodeId);
        } else if (onToggleNodeHidden) {
          // Cmd/Ctrl+click: toggle single node
          onToggleNodeHidden(nodeId);
        }
      }
    },
    [nodeId, onToggleNodeHidden, onHideUnconnectedNodes]
  );

  // Show tooltip when:
  // 1. Hovering + not dragging + shift key pressed (always works), OR
  // 2. Node is selected AND not in edit mode (read-only selection shows tooltip)
  const showTooltip =
    (isHovered && !dragging && shiftKeyPressed) || (!editable && !!selected);

  // Extract OTEL info, description, sources/files, and references for tooltip
  const otelInfo = nodeData?.otel as (OtelInfo & { files?: string[] }) | undefined;
  const description = nodeData?.description as string | undefined;
  const sources = nodeData?.sources as string[] | undefined; // deprecated
  const references = nodeData?.references as string[] | undefined;
  // Files from otel.files - these are source code files where the event is instrumented
  const files = otelInfo?.files;

  // Get badge shape styles based on node shape
  const getBadgeShapeStyles = (): React.CSSProperties => {
    const shape = typeDefinition.shape;
    const baseSize = 18;

    switch (shape) {
      case 'circle':
        return {
          width: baseSize,
          height: baseSize,
          borderRadius: '50%',
        };
      case 'diamond':
        return {
          width: baseSize - 4,
          height: baseSize - 4,
          borderRadius: 0,
          transform: 'rotate(45deg)',
        };
      case 'hexagon':
        return {
          width: baseSize,
          height: baseSize,
          borderRadius: 0,
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
        };
      case 'rectangle':
      default:
        return {
          width: baseSize,
          height: baseSize,
          borderRadius: 0,
        };
    }
  };

  // Get badge position based on shape - diamonds need badges at their points, not bounding box corners
  const getBadgePosition = (position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'top' | 'bottom'): React.CSSProperties => {
    const isDiamondShape = typeDefinition.shape === 'diamond';

    if (isDiamondShape) {
      // Diamond points are at the middle of each edge of the bounding box
      switch (position) {
        case 'top-left':
        case 'left':
          // Position at the LEFT point of the diamond (center-left)
          return { top: '50%', left: 0, transform: 'translate(-50%, -50%)' };
        case 'top-right':
        case 'right':
          // Position at the RIGHT point of the diamond (center-right)
          return { top: '50%', right: 0, transform: 'translate(50%, -50%)' };
        case 'top':
          // Position at the TOP point of the diamond
          return { top: 0, left: '50%', transform: 'translate(-50%, -50%)' };
        case 'bottom':
        case 'bottom-left':
        case 'bottom-right':
          // Position at the BOTTOM point of the diamond
          return { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' };
      }
    }

    // Default positioning for rectangles, circles, hexagons (bounding box corners)
    switch (position) {
      case 'top-left':
        return { top: -6, left: -6 };
      case 'top-right':
        return { top: -6, right: -6 };
      case 'bottom-left':
        return { bottom: -6, left: -6 };
      case 'bottom-right':
        return { bottom: -6, right: -6 };
      case 'left':
        return { top: -6, left: -6 };
      case 'right':
        return { top: -6, right: -6 };
      case 'top':
        return { top: -6, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom':
        return { bottom: -6, left: '50%', transform: 'translateX(-50%)' };
    }
  };

  // Render Sources badge (top-right) - shows "S" for files where event is instrumented
  const renderSourcesBadge = () => {
    // Use otel.files (source code files where event is instrumented)
    // Fall back to deprecated sources field for backwards compatibility
    const sourceFiles = files || sources;
    if (!sourceFiles || sourceFiles.length === 0) return null;

    const shapeStyles = getBadgeShapeStyles();
    const positionStyles = getBadgePosition('top-right');

    return (
      <div
        style={{
          position: 'absolute',
          ...positionStyles,
          ...shapeStyles,
          // Override transform if shape has rotation but we already have a position transform
          ...(typeDefinition.shape === 'diamond' ? { transform: `${positionStyles.transform} rotate(45deg)` } : {}),
          backgroundColor: '#10b981', // Green for sources
          color: 'white',
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.bold,
          fontFamily: theme.fonts.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 10,
          opacity: nodeOpacity,
        }}
        title={`Source files: ${sourceFiles.join(', ')}`}
      >
        <span style={{ transform: shapeStyles.transform ? 'rotate(-45deg)' : undefined }}>S</span>
      </div>
    );
  };

  // Render References badge (bottom-left for rectangles, bottom for diamonds) - shows "R" for external references
  const renderReferencesBadge = () => {
    if (!references || references.length === 0) return null;

    const shapeStyles = getBadgeShapeStyles();
    const positionStyles = getBadgePosition('bottom-left');

    return (
      <div
        style={{
          position: 'absolute',
          ...positionStyles,
          ...shapeStyles,
          // Override transform if shape has rotation but we already have a position transform
          ...(typeDefinition.shape === 'diamond' ? { transform: `${positionStyles.transform} rotate(45deg)` } : {}),
          backgroundColor: '#8b5cf6', // Purple for references
          color: 'white',
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.bold,
          fontFamily: theme.fonts.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 10,
          opacity: nodeOpacity,
        }}
        title={`References: ${references.join(', ')}`}
      >
        <span style={{ transform: shapeStyles.transform ? 'rotate(-45deg)' : undefined }}>R</span>
      </div>
    );
  };

  // Render Boundary badge (right/left points) - shown instead of sources badge for boundary nodes
  const renderBoundaryBadge = () => {
    const boundary = nodeData?.boundary as { direction?: 'outbound' | 'inbound'; node?: Record<string, string> } | undefined;
    if (!boundary) return null;

    const direction = boundary.direction || 'outbound';
    const isOutbound = direction === 'outbound';

    // Direction indicators
    const directionIcon = isOutbound ? '↗' : '↙';
    const directionTitle = isOutbound ? 'Outbound boundary (calls external system)' : 'Inbound boundary (called by external system)';

    const positionStyles = getBadgePosition(isOutbound ? 'right' : 'left');

    return (
      <div
        style={{
          position: 'absolute',
          ...positionStyles,
          width: 18,
          height: 18,
          borderRadius: '50%', // Always circular for boundary badge
          backgroundColor: '#06b6d4', // Cyan for boundaries
          color: 'white',
          fontSize: 12,
          fontWeight: theme.fontWeights.bold,
          fontFamily: theme.fonts.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 10,
          opacity: nodeOpacity,
        }}
        title={directionTitle}
      >
        {directionIcon}
      </div>
    );
  };

  // Check if this is a boundary node
  const isBoundaryNode = nodeData?.nodeType === 'boundary';

  // Render Status badge (top-left, or top point for diamonds)
  const renderStatusBadge = () => {
    const status = nodeData?.status as 'draft' | 'approved' | 'implemented' | undefined;
    if (!status) return null;

    // Color mapping for status
    const statusColors = {
      draft: '#6b7280', // Gray
      approved: '#3b82f6', // Blue
      implemented: '#10b981', // Green
    };

    const statusLabels = {
      draft: 'D',
      approved: 'A',
      implemented: 'I',
    };

    const statusTitles = {
      draft: 'Draft - Design phase',
      approved: 'Approved - Ready for implementation',
      implemented: 'Implemented - Code exists',
    };

    const shapeStyles = getBadgeShapeStyles();
    const positionStyles = getBadgePosition('top-left');

    return (
      <div
        style={{
          position: 'absolute',
          ...positionStyles,
          ...shapeStyles,
          // Override transform if shape has rotation but we already have a position transform
          ...(typeDefinition.shape === 'diamond' ? { transform: `${positionStyles.transform} rotate(45deg)` } : {}),
          backgroundColor: statusColors[status],
          color: 'white',
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.bold,
          fontFamily: theme.fonts.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 10,
          opacity: nodeOpacity,
        }}
        title={statusTitles[status]}
      >
        <span style={{ transform: shapeStyles.transform ? 'rotate(-45deg)' : undefined }}>
          {statusLabels[status]}
        </span>
      </div>
    );
  };

  // Guard against missing typeDefinition
  if (!typeDefinition) {
    return (
      <div style={{ padding: '10px', border: '2px solid red', borderRadius: '4px' }}>
        <div style={{ fontSize: '12px', color: 'red' }}>Error: Missing node type definition</div>
      </div>
    );
  }

  // Color Contract:
  // - scopeColor: Used as FILL/background color (from library.yaml scopes)
  // - spanColor: Used as BORDER color in workflow context (from .spans.canvas)
  // - For non-event canvases, falls back to legacy behavior (node color or type color)

  // Get colors from node data (injected by GraphRenderer)
  const nodeDataColor = nodeData.color as string | undefined;
  const scopeColor = nodeData.scopeColor as string | undefined;
  const spanColor = nodeData.spanColor as string | undefined;

  // Check node's own states first (from pv.states), then fall back to type definition states
  const nodeDataStates = nodeData.states as
    | Record<string, { color?: string; label?: string; icon?: string }>
    | undefined;
  const stateColor =
    state && (nodeDataStates?.[state]?.color || typeDefinition.states?.[state]?.color);

  // Fill color priority: state color > node data color > scope color > type definition color > default
  // scopeColor provides background color from the scope definition in library.yaml
  const baseFillColor = nodeDataColor || scopeColor || typeDefinition.color || '#888';
  const fillColor = stateColor || baseFillColor;

  // Stroke/border color priority: explicit stroke > span color (workflow context) > fill color
  // spanColor provides border color in workflow context (from .spans.canvas)
  const nodeDataStroke = nodeData.stroke as string | undefined;
  const baseStrokeColor = nodeDataStroke || spanColor || fillColor;

  // Apply status-based border styling
  const status = nodeData?.status as 'draft' | 'approved' | 'implemented' | undefined;
  const strokeColor = baseStrokeColor;

  // Use fillColor as the primary "color" for backwards compatibility
  const color = fillColor;

  // Get display name - use pending text if available, otherwise use name from props
  const displayName = nodeProps.pendingText ?? nodeProps.name;

  // Extract identifier based on node type (for display below the label)
  // Supports: event.name, otel.spanPattern, otel.scope, otel.resourceMatch, boundary.direction
  const eventData = nodeData?.event as { name?: string; description?: string; attributes?: Record<string, unknown> } | undefined;
  const otelData = nodeData?.otel as { spanPattern?: string; scope?: string; resourceMatch?: Record<string, string | string[]> } | undefined;
  const boundaryData = nodeData?.boundary as { direction?: string } | undefined;

  // Get identifier from multiple sources
  const getNodeIdentifier = (): string | undefined => {
    // Event name (for otel-event nodes)
    if (eventData?.name) return eventData.name;
    // Event ref (for nodes using library events)
    if (nodeData?.eventRef) return nodeData.eventRef as string;
    // Span pattern (for otel-span-convention nodes)
    if (otelData?.spanPattern) return otelData.spanPattern;
    // Scope name (for otel-scope nodes)
    if (otelData?.scope) return otelData.scope;
    // Resource match (for otel-resource nodes) - show first key:value
    if (otelData?.resourceMatch) {
      const entries = Object.entries(otelData.resourceMatch);
      if (entries.length > 0) {
        const [key, value] = entries[0];
        return `${key}: ${Array.isArray(value) ? value[0] : value}`;
      }
    }
    // Boundary direction (for otel-boundary nodes)
    if (boundaryData?.direction) return boundaryData.direction;
    return undefined;
  };

  const identifier = getNodeIdentifier();

  // Show identifier if it differs from display name
  const showIdentifier = identifier && identifier !== displayName;

  // Helper to render text with word break opportunities after dots
  const renderWithDotBreaks = (text: string) => {
    const parts = text.split('.');
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 && (
          <>
            .<wbr />
          </>
        )}
      </span>
    ));
  };

  // Helper component for rendering name with optional identifier
  // Identifiers can come from: event.name, eventRef, otel.spanPattern, otel.scope, otel.resourceMatch, boundary.direction
  const renderNameWithIdentifier = (centered: boolean = true) => (
    <div style={{ textAlign: centered ? 'center' : 'left', wordBreak: 'break-word' }}>
      <div>{displayName}</div>
      {showIdentifier && (
        <div
          style={{
            fontSize: theme.fontSizes[0] * 0.75, // 75% of the main font size
            color: 'rgba(0, 0, 0, 0.5)', // 50% opacity for subtle appearance
            marginTop: '2px',
            fontFamily: theme.fonts.monospace,
          }}
        >
          {renderWithDotBreaks(identifier)}
        </div>
      )}
    </div>
  );

  // Icon priority: node data override > state icon (node data states first) > type definition icon
  const icon =
    (nodeData.icon as string) ||
    (state && (nodeDataStates?.[state]?.icon || typeDefinition.states?.[state]?.icon)) ||
    typeDefinition.icon;

  // Get animation class based on type
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

  const animationClass = getAnimationClass();

  // Check if this is a group node or text node (canvas types that support inline editing)
  const isGroup = nodeData.canvasType === 'group';
  const isTextNode = nodeData.canvasType === 'text';
  const isInlineEditable = (isGroup || isTextNode) && editable;

  // Double-click handler for inline text editing
  const lastClickTimeRef = useRef<number>(0);
  const handleNodeDoubleClick = useCallback((event: React.MouseEvent) => {
    if (!isInlineEditable || !nodeId || !onNodeTextChange) return;

    event.stopPropagation();
    event.preventDefault();

    setEditingText(displayName || '');
    setIsEditing(true);

    // Focus the textarea after state update
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 0);
  }, [isInlineEditable, nodeId, onNodeTextChange, displayName]);

  // Single click tracking for double-click detection
  const handleNodeClick = useCallback((event: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    if (timeSinceLastClick < 300) {
      // Double-click detected
      handleNodeDoubleClick(event);
    }

    lastClickTimeRef.current = now;
  }, [handleNodeDoubleClick]);

  // Save text changes
  const handleSaveText = useCallback(() => {
    if (!nodeId || !onNodeTextChange) return;

    if (editingText !== displayName) {
      onNodeTextChange(nodeId, editingText);
    }

    setIsEditing(false);
  }, [nodeId, onNodeTextChange, editingText, displayName]);

  // Cancel text editing
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingText('');
  }, []);

  // Shape-specific styles
  const getShapeStyles = () => {
    const borderStyle = status === 'draft' ? 'dotted' : status === 'approved' ? 'dashed' : 'solid';
    const baseStyles = {
      padding: '12px 16px',
      backgroundColor: isGroup ? 'rgba(255, 255, 255, 0.7)' : fillColor,
      color: '#000',
      border: `2px ${borderStyle} ${hasViolations ? '#D0021B' : strokeColor}`,
      fontSize: theme.fontSizes[0],
      fontWeight: theme.fontWeights.medium,
      fontFamily: theme.fonts.body,
      // Use 100% width/height to fill the node container (for resizing support)
      width: '100%',
      height: '100%',
      // Use small absolute minimums - typeDefinition.size is the default, not the minimum
      minWidth: 20,
      minHeight: 20,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: isGroup ? 'flex-start' : 'center',
      gap: '4px',
      boxShadow: isHighlighted
        ? `0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)`
        : selected
        ? `0 0 0 2px ${strokeColor}`
        : '0 2px 4px rgba(0,0,0,0.1)',
      opacity: nodeOpacity,
      transition: 'box-shadow 0.2s ease, opacity 0.3s ease',
      animationDuration: animationType ? `${animationDuration}ms` : undefined,
      boxSizing: 'border-box' as const,
    };

    switch (typeDefinition.shape) {
      case 'circle':
        return {
          ...baseStyles,
          borderRadius: '50%',
          padding: '8px',
        };
      case 'hexagon':
        // Hexagon uses wrapper approach for proper border - styles returned here are for inner fill
        // The outer border wrapper is rendered separately in the JSX
        return {
          ...baseStyles,
          border: 'none', // Border handled by wrapper
          clipPath: 'polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)',
          width: '100%',
          height: '100%',
          minWidth: 'unset',
          minHeight: 'unset',
          padding: '8px 20px',
          boxShadow: 'none', // Shadow handled by wrapper
        };
      case 'diamond':
        // Diamond uses wrapper approach for proper border - styles returned here are for inner fill
        // The outer border wrapper is rendered separately in the JSX
        return {
          ...baseStyles,
          border: 'none', // Border handled by wrapper
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          width: '100%',
          height: '100%',
          minWidth: 'unset',
          minHeight: 'unset',
          padding: '8px 16px',
          boxShadow: 'none', // Shadow handled by wrapper
        };
      case 'rectangle':
      default:
        return {
          ...baseStyles,
          // Boundary nodes get rounded corners, regular rectangles get sharp corners
          borderRadius: isBoundaryNode ? '8px' : '0',
        };
    }
  };

  const isDiamond = typeDefinition.shape === 'diamond';
  const isHexagon = typeDefinition.shape === 'hexagon';
  const isCircle = typeDefinition.shape === 'circle';

  // Determine if aspect ratio should be locked (circles should maintain square aspect)
  const keepAspectRatio = isCircle;

  // Minimum dimensions for resizing - use small absolute values, not typeDefinition.size
  const minWidth = 40;
  const minHeight = isCircle ? 40 : 30;

  // Hexagon border wrapper styles (outer shape that acts as border)
  // Hexagon with gentle diagonals
  const hexagonClipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
  // Note: Dotted/dashed borders not supported for hexagon shape (CSS limitation with clip-path)
  // All statuses use 2px solid border for hexagons
  const hexagonBorderWidth = 2;
  const hexagonBorderStyle: React.CSSProperties = isHexagon
    ? {
        position: 'relative',
        clipPath: hexagonClipPath,
        backgroundColor: hasViolations ? '#D0021B' : strokeColor,
        // Use 100% to fill container for resizing support
        width: '100%',
        height: '100%',
        // Use small absolute minimums - typeDefinition.size is the default, not the minimum
        minWidth: 20,
        minHeight: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        opacity: nodeOpacity,
        transition: 'opacity 0.3s ease',
        boxSizing: 'border-box',
      }
    : {};

  // Hexagon inner fill styles (light color background inset from border)
  const hexagonInnerStyle: React.CSSProperties = isHexagon
    ? {
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
      }
    : {};

  // Diamond clip-path
  const diamondClipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  // Note: Dotted/dashed borders not supported for diamond shape (CSS limitation with clip-path)
  // All statuses use 2px solid border for diamonds
  const diamondBorderWidth = 2;

  // Diamond border wrapper styles (outer shape that acts as border)
  const diamondBorderStyle: React.CSSProperties = isDiamond
    ? {
        position: 'relative',
        clipPath: diamondClipPath,
        backgroundColor: hasViolations ? '#D0021B' : strokeColor,
        width: '100%',
        height: '100%',
        // Use small absolute minimums - typeDefinition.size is the default, not the minimum
        minWidth: 20,
        minHeight: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        opacity: nodeOpacity,
        transition: 'opacity 0.3s ease',
        boxSizing: 'border-box',
      }
    : {};

  // Diamond inner fill styles (light color background inset from border)
  const diamondInnerStyle: React.CSSProperties = isDiamond
    ? {
        position: 'absolute',
        top: diamondBorderWidth,
        left: diamondBorderWidth,
        right: diamondBorderWidth,
        bottom: diamondBorderWidth,
        clipPath: diamondClipPath,
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
      }
    : {};

  // Handle styles - larger and more visible in edit mode, hidden otherwise
  const baseHandleStyle = editable
    ? {
        background: color,
        width: 12,
        height: 12,
        border: '2px solid white',
        boxShadow: '0 0 0 1px ' + color,
      }
    : {
        background: color,
        width: 8,
        height: 8,
        opacity: 0,
        pointerEvents: 'none' as const,
      };

  const getHandleStyle = (_position: 'top' | 'bottom' | 'left' | 'right') => {
    if (!isDiamond && !isHexagon) return baseHandleStyle;

    const offsetStyle: React.CSSProperties = { ...baseHandleStyle };

    // Bring handles above the clip-path layers for hexagon and diamond
    if (isHexagon || isDiamond) {
      offsetStyle.zIndex = 10;
    }

    return offsetStyle;
  };

  return (
    <>
      {/* Node Resizer - only shown in edit mode */}
      {editable && (
        <NodeResizer
          color={strokeColor}
          isVisible={selected}
          minWidth={minWidth}
          minHeight={minHeight}
          keepAspectRatio={keepAspectRatio}
          onResizeEnd={handleResizeEnd}
          handleStyle={{
            width: 8,
            height: 8,
            borderRadius: 2,
            zIndex: 20,
          }}
          lineStyle={{
            borderWidth: 1,
            zIndex: 20,
          }}
        />
      )}

      {/* Input handles - all 4 sides for incoming connections */}
      <Handle type="target" position={Position.Top} id="top" style={getHandleStyle('top')} />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        style={getHandleStyle('bottom')}
      />
      <Handle type="target" position={Position.Left} id="left" style={getHandleStyle('left')} />
      <Handle type="target" position={Position.Right} id="right" style={getHandleStyle('right')} />

      {/* Hexagon and Diamond need a wrapper for proper border rendering */}
      {isHexagon ? (
        <div
          ref={nodeRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            boxShadow: isHighlighted
              ? `0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)`
              : selected
              ? `0 0 0 2px ${strokeColor}`
              : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {renderStatusBadge()}
          {isBoundaryNode ? renderBoundaryBadge() : (
            <>
              {renderSourcesBadge()}
              {renderReferencesBadge()}
            </>
          )}
          <div style={hexagonBorderStyle} className={animationClass}>
            <div style={hexagonInnerStyle}>
              {icon && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {resolveIcon(icon, 20)}
                </div>
              )}
              {renderNameWithIdentifier()}
              {state && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    backgroundColor: color,
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  {nodeDataStates?.[state]?.label || typeDefinition.states?.[state]?.label || state}
                </div>
              )}
              {hasViolations && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    color: '#D0021B',
                    fontWeight: theme.fontWeights.bold,
                  }}
                >
                  ⚠️
                </div>
              )}
            </div>
          </div>
          {tooltipsEnabled && (
            <NodeTooltip
              description={description}
              otel={otelInfo}
              sources={sources}
              references={references}
              visible={showTooltip}
              nodeRef={nodeRef}
            />
          )}
        </div>
      ) : isDiamond ? (
        <div
          ref={nodeRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            boxShadow: isHighlighted
              ? `0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)`
              : selected
              ? `0 0 0 2px ${strokeColor}`
              : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {renderStatusBadge()}
          {isBoundaryNode ? renderBoundaryBadge() : (
            <>
              {renderSourcesBadge()}
              {renderReferencesBadge()}
            </>
          )}
          <div style={diamondBorderStyle} className={animationClass}>
            <div style={diamondInnerStyle}>
              {icon && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {resolveIcon(icon, 20)}
                </div>
              )}
              {renderNameWithIdentifier()}
              {state && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    backgroundColor: color,
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  {nodeDataStates?.[state]?.label || typeDefinition.states?.[state]?.label || state}
                </div>
              )}
              {hasViolations && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    color: '#D0021B',
                    fontWeight: theme.fontWeights.bold,
                  }}
                >
                  ⚠️
                </div>
              )}
            </div>
          </div>
          {tooltipsEnabled && (
            <NodeTooltip
              description={description}
              otel={otelInfo}
              sources={sources}
              references={references}
              visible={showTooltip}
              nodeRef={nodeRef}
            />
          )}
        </div>
      ) : (
        <div
          ref={nodeRef}
          style={{ position: 'relative', width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown}
          onClick={handleNodeClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {renderStatusBadge()}
          {isBoundaryNode ? renderBoundaryBadge() : (
            <>
              {renderSourcesBadge()}
              {renderReferencesBadge()}
            </>
          )}
          <div style={getShapeStyles()} className={animationClass}>
            {/* Inner content */}
            <div
              style={{
                ...(isGroup ? { width: '100%' } : {}),
              }}
            >
              {/* Groups: icon and text inline, centered */}
              {isGroup ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                  }}
                >
                  {icon && resolveIcon(icon, 18)}
                  {renderNameWithIdentifier(false)}
                </div>
              ) : (
                <>
                  {icon && (
                    <div
                      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    >
                      {resolveIcon(icon, 20)}
                    </div>
                  )}
                  {renderNameWithIdentifier()}
                </>
              )}
              {state && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    backgroundColor: color,
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  {nodeDataStates?.[state]?.label || typeDefinition.states?.[state]?.label || state}
                </div>
              )}
              {hasViolations && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    color: '#D0021B',
                    fontWeight: theme.fontWeights.bold,
                  }}
                >
                  ⚠️
                </div>
              )}
            </div>
          </div>
          {/* Inline text editor overlay */}
          {isEditing && isInlineEditable && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                padding: theme.space[1],
                boxSizing: 'border-box',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="Enter text..."
                style={{
                  flex: 1,
                  width: '100%',
                  padding: theme.space[2],
                  fontSize: theme.fontSizes[1],
                  fontFamily: theme.fonts.body,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.background,
                  border: `3px solid ${theme.colors.primary}`,
                  borderRadius: theme.radii[1],
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveText();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelEdit();
                  }
                }}
                onBlur={handleSaveText}
              />
            </div>
          )}

          {tooltipsEnabled && (
            <NodeTooltip
              description={description}
              otel={otelInfo}
              sources={sources}
              references={references}
              visible={showTooltip}
              nodeRef={nodeRef}
            />
          )}
        </div>
      )}

      {/* Output handles - all 4 sides for outgoing connections */}
      <Handle type="source" position={Position.Top} id="top-out" style={getHandleStyle('top')} />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-out"
        style={getHandleStyle('bottom')}
      />
      <Handle type="source" position={Position.Left} id="left-out" style={getHandleStyle('left')} />
      <Handle
        type="source"
        position={Position.Right}
        id="right-out"
        style={getHandleStyle('right')}
      />

      {/* CSS animations for node animation types */}
      <style>{`
        /* Processing pulse - continuous breathing effect */
        .node-pulse {
          animation: node-pulse ease-in-out infinite;
        }

        @keyframes node-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2), 0 0 0 4px rgba(59, 130, 246, 0.3);
          }
        }

        /* Success flash - brief green glow */
        .node-flash {
          animation: node-flash ease-out forwards;
        }

        @keyframes node-flash {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.8);
            background-color: rgba(34, 197, 94, 0.1);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
            background-color: rgba(34, 197, 94, 0.2);
          }
          100% {
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            background-color: white;
          }
        }

        /* Error shake - vibrate effect */
        .node-shake {
          animation: node-shake ease-in-out;
        }

        @keyframes node-shake {
          0%, 100% {
            transform: translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: translateX(-4px);
          }
          20%, 40%, 60%, 80% {
            transform: translateX(4px);
          }
        }

        /* Entry animation - scale up and fade in */
        .node-entry {
          animation: node-entry ease-out forwards;
        }

        @keyframes node-entry {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

      `}</style>
    </>
  );
};
