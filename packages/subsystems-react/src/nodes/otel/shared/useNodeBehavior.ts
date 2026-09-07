/**
 * Hook for shared node behavior (resize, hide, hover, tooltip)
 */

import { useState, useRef, useCallback } from 'react';
import { useNodeId } from '@xyflow/react';
import { useGraphEdit } from '../../../contexts/GraphEditContext';

export interface UseNodeBehaviorOptions {
  /** Whether the node is in edit mode */
  editable?: boolean;
  /** Whether tooltips are enabled */
  tooltipsEnabled?: boolean;
  /** Whether shift key is pressed */
  shiftKeyPressed?: boolean;
  /** Whether the node is selected */
  selected?: boolean;
  /** Whether the node is being dragged */
  dragging?: boolean;
}

export interface UseNodeBehaviorReturn {
  /** Ref for the node element */
  nodeRef: React.RefObject<HTMLDivElement>;
  /** Node ID from xyflow */
  nodeId: string | null;
  /** Whether the node is currently hovered */
  isHovered: boolean;
  /** Whether to show the tooltip */
  showTooltip: boolean;
  /** Mouse down handler for Cmd/Ctrl+click behavior */
  handleMouseDown: (event: React.MouseEvent) => void;
  /** Mouse enter handler */
  handleMouseEnter: () => void;
  /** Mouse leave handler */
  handleMouseLeave: () => void;
  /** Resize end handler */
  handleResizeEnd: (event: unknown, params: { width: number; height: number }) => void;
}

/**
 * Hook that provides common node behavior for resize, hide, hover, and tooltip interactions
 */
export function useNodeBehavior(options: UseNodeBehaviorOptions): UseNodeBehaviorReturn {
  const {
    editable = false,
    tooltipsEnabled = true,
    shiftKeyPressed = false,
    selected = false,
    dragging = false,
  } = options;

  const nodeRef = useRef<HTMLDivElement>(null);
  const nodeId = useNodeId();
  const [isHovered, setIsHovered] = useState(false);

  const { onNodeResizeEnd, onToggleNodeHidden, onHideUnconnectedNodes } = useGraphEdit();

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

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  // Show tooltip when:
  // 1. Hovering + not dragging + shift key pressed (always works), OR
  // 2. Node is selected AND not in edit mode (read-only selection shows tooltip)
  const showTooltip =
    tooltipsEnabled && ((isHovered && !dragging && shiftKeyPressed) || (!editable && !!selected));

  return {
    nodeRef,
    nodeId,
    isHovered,
    showTooltip,
    handleMouseDown,
    handleMouseEnter,
    handleMouseLeave,
    handleResizeEnd,
  };
}
