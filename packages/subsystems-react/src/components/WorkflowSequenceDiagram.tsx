/**
 * Workflow Sequence Diagram
 *
 * A wrapper around SequenceDiagramRenderer that handles conversion from
 * workflow scenarios to sequence diagram format, following the graph-to-sequence
 * model where participants are scopes and events are move/transform operations.
 */

import { useMemo, useCallback } from 'react';
import type { WorkflowScenario, Canvas, ExtendedCanvas } from '@principal-ai/subsystems-core';
import { SequenceDiagramRenderer } from './SequenceDiagramRenderer';
import type { SequenceEvent, SequenceEdge } from '../hooks/useSequenceLayout';
import type { UseSequenceLayoutOptions } from '../hooks/useSequenceLayout';

/**
 * Props for WorkflowSequenceDiagram
 */
export interface WorkflowSequenceDiagramProps {
  /** Workflow scenario to visualize */
  scenario: WorkflowScenario;

  /** Optional canvas for extracting scope metadata from OTEL nodes */
  canvas?: Canvas | ExtendedCanvas | null;

  /** Optional height for the diagram */
  height?: number | string;

  /** Optional width for the diagram */
  width?: number | string;

  /** Layout options for the sequence diagram */
  layoutOptions?: UseSequenceLayoutOptions;

  /** Whether to show controls */
  showControls?: boolean;

  /** Whether to show background grid */
  showBackground?: boolean;

  /** Optional class name */
  className?: string;

  /** Callback when an event node is clicked - receives the event index (0-based) */
  onEventIndexChange?: (eventIndex: number) => void;

  /** Currently selected event index (0-based) for visual highlighting */
  selectedEventIndex?: number;

  /** Whether to show event labels on nodes (default: false, labels already shown on edges) */
  showEventLabels?: boolean;

  /**
   * When true, render the diagram chrome (canvas background, swimlane fills,
   * header backgrounds) as transparent so the diagram can be composited over
   * an arbitrary backdrop. Defaults to `false`.
   */
  transparent?: boolean;
}

/**
 * Type guard to check if a node is an OTEL event node
 */
function isOtelEventNode(node: any): node is {
  type: 'otel-event';
  event: { name: string };
  otel?: { scope?: string };
  label?: string;
} {
  return node?.type === 'otel-event' && node?.event?.name;
}

/**
 * Type guard to check if a node is an OTEL participant node
 */
function isOtelParticipantNode(node: any): node is {
  type: 'otel-participant';
  participant: { name: string; scope?: string };
  transformEvents?: Array<{ name: string }>;
} {
  return node?.type === 'otel-participant' && node?.participant?.name;
}

/**
 * Convert workflow scenario to sequence diagram format
 */
function convertWorkflowToSequence(
  scenario: WorkflowScenario,
  canvas?: Canvas | ExtendedCanvas | null
): {
  events: SequenceEvent[];
  edges: SequenceEdge[];
} {
  // Extract event names from scenario template
  const templateEvents = scenario.template.events || {};
  const eventNames = Object.keys(templateEvents);

  if (eventNames.length === 0) {
    return { events: [], edges: [] };
  }

  // Build maps from canvas metadata
  const eventToScopeMap = new Map<string, string>();
  const eventToLabelMap = new Map<string, string>();
  const eventToMoveEventMap = new Map<string, boolean>();

  if (canvas?.nodes) {
    for (const node of canvas.nodes) {
      // Type guard narrowing - we know the structure but Canvas type doesn't include OTEL specifics
      const nodeData = node as Record<string, any>;

      // Handle OTEL event nodes
      if (isOtelEventNode(nodeData)) {
        const eventName = nodeData.event.name;

        if (nodeData.otel?.scope) {
          eventToScopeMap.set(eventName, nodeData.otel.scope);
        }

        if (nodeData.label) {
          eventToLabelMap.set(eventName, nodeData.label);
        }
      }

      // Handle OTEL participant nodes (participant-based model)
      if (isOtelParticipantNode(nodeData)) {
        const scope = nodeData.participant.scope || nodeData.participant.name;

        // Mark transform events (internal to participant)
        if (nodeData.transformEvents) {
          for (const transformEvent of nodeData.transformEvents) {
            eventToScopeMap.set(transformEvent.name, scope);
            eventToMoveEventMap.set(transformEvent.name, false);
          }
        }
      }
    }
  }

  // Convert to SequenceEvent format
  const events: SequenceEvent[] = eventNames.map((eventName, index) => {
    const canvasScope = eventToScopeMap.get(eventName);
    const label = eventToLabelMap.get(eventName) || eventName.split('.').pop() || eventName;

    // Determine if this is a move event
    // Default to true unless explicitly marked as transform event in participant node
    const isMoveEvent = eventToMoveEventMap.get(eventName) ?? true;

    // When the canvas provides a scope, prefix it so the event lands in that
    // participant's lane (the layout uses the first dotted segment as the
    // default lane). Otherwise, use the event name as-is.
    const name = canvasScope ? `${canvasScope}.${eventName}` : eventName;
    const participant = canvasScope ?? eventName.split('.')[0] ?? eventName;

    return {
      id: `event-${index}`,
      name,
      label,
      moveEvent: isMoveEvent,
      participant,
    };
  });

  // Create sequential edges
  const edges: SequenceEdge[] = [];
  for (let i = 0; i < events.length - 1; i++) {
    edges.push({
      id: `edge-${i}`,
      fromEvent: events[i].id,
      toEvent: events[i + 1].id,
    });
  }

  return { events, edges };
}

/**
 * WorkflowSequenceDiagram Component
 *
 * Renders a workflow scenario as a sequence diagram, automatically extracting
 * participant scopes from the canvas and distinguishing between move events
 * (cross-participant communication) and transform events (internal processing).
 *
 * @example
 * ```tsx
 * <WorkflowSequenceDiagram
 *   scenario={workflowScenario}
 *   canvas={otelCanvas}
 *   height={600}
 *   layoutOptions={{ eventSpacing: 80 }}
 * />
 * ```
 */
export function WorkflowSequenceDiagram({
  scenario,
  canvas,
  height = 600,
  width = '100%',
  layoutOptions,
  showControls = true,
  showBackground = false,
  className,
  onEventIndexChange,
  selectedEventIndex,
  showEventLabels = false, // Default to false - labels already on edges
  transparent = false,
}: WorkflowSequenceDiagramProps) {
  // Convert workflow to sequence format
  const { events, edges } = useMemo(
    () => convertWorkflowToSequence(scenario, canvas),
    [scenario, canvas]
  );

  // Handle node clicks - map sequence node ID back to event index
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (!onEventIndexChange) return;

      // Node IDs are in format "event-{index}"
      const match = nodeId.match(/^event-(\d+)$/);
      if (match) {
        const eventIndex = parseInt(match[1], 10);
        onEventIndexChange(eventIndex);
      }
    },
    [onEventIndexChange]
  );

  // Convert selected event index to node ID
  const selectedNodeId = useMemo(() => {
    if (selectedEventIndex === undefined || selectedEventIndex === null) return undefined;
    return `event-${selectedEventIndex}`;
  }, [selectedEventIndex]);

  // If no events, show empty state
  if (events.length === 0) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
        }}
      >
        No events in workflow
      </div>
    );
  }

  // Render sequence diagram
  return (
    <SequenceDiagramRenderer
      events={events}
      edges={edges}
      height={height}
      width={width}
      layoutOptions={layoutOptions}
      showControls={showControls}
      showBackground={showBackground}
      className={className}
      onNodeClick={onEventIndexChange ? handleNodeClick : undefined}
      selectedNodeId={selectedNodeId}
      showEventLabels={showEventLabels}
      transparent={transparent}
    />
  );
}
