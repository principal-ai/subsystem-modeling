/**
 * Events Canvas Validator
 *
 * Validates that a .events.canvas file properly documents event namespaces
 * and their events, with correct namespace extraction and node structure.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';
import { pathsOverlap } from './path-helpers';

/**
 * Event namespace node structure
 */
export interface EventNamespaceNode {
  id: string;
  type: 'event-namespace';
  namespace: {
    name: string;
    description: string;
    /**
     * Optional source paths that define this component's code location.
     * Each entry may be a folder (covers all descendants) or a specific file.
     * When present, events in this namespace may only be emitted from files
     * covered by one of these paths. Namespaces without `paths` remain
     * unenforced — enforcement is opt-in per namespace.
     *
     * Multiple entries are valid for cases like generated code, platform-split
     * implementations, or migration periods. The validator warns when
     * `paths.length > 1` to prompt authors to confirm the multi-location
     * is intentional.
     */
    paths?: string[];
    events: Array<{
      name: string;
      severity?: 'INFO' | 'WARN' | 'ERROR';
      description?: string;
      attributes?: Record<string, {
        type: string;
        required?: boolean;
        description?: string;
      }>;
    }>;
  };
  // Standard canvas node fields
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

/**
 * Events canvas validation context
 */
export interface EventsCanvasValidationContext {
  /** The events canvas (if found) */
  eventsCanvas?: ExtendedCanvas;

  /** Path to the events canvas file */
  eventsCanvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;

  /** Optional: Workflow files to validate against */
  workflowFiles?: Array<{
    path: string;
    events: string[];
  }>;
}

/**
 * Events canvas validation violation
 */
export interface EventsCanvasViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path where violation occurred */
  file: string;

  /** JSON path within file (optional) */
  path?: string;

  /** Human-readable description of what's wrong */
  message: string;

  /** Why this matters */
  impact: string;

  /** How to fix it */
  suggestion: string;
}

/**
 * Events canvas validation result
 */
export interface EventsCanvasValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** List of violations found */
  violations: EventsCanvasViolation[];

  /** Coverage metrics */
  metrics: {
    /** Total unique namespaces found */
    totalNamespaces: number;
    /** Namespaces with nodes */
    documentedNamespaces: string[];
    /** Namespaces missing nodes */
    missingNamespaces: string[];
    /** Total events across all namespaces */
    totalEvents: number;
    /** Events properly registered in namespace nodes */
    registeredEvents: string[];
    /** Events not in any namespace node */
    unregisteredEvents: string[];
  };
}

/**
 * Validates events canvas files
 */
export class EventsCanvasValidator {
  constructor(private fsAdapter: FileSystemAdapter) {}

  /**
   * Extract namespace from event name (all segments except last)
   *
   * @example
   * extractNamespace('validation.started') // 'validation'
   * extractNamespace('file.read.complete') // 'file.read'
   * extractNamespace('error') // null (invalid, needs at least 2 segments)
   */
  private extractNamespace(eventName: string): string | null {
    const segments = eventName.split('.');
    if (segments.length < 2) {
      return null; // Invalid event name
    }
    return segments.slice(0, -1).join('.');
  }

  /**
   * Check if a node is an event-namespace node
   */
  private isEventNamespaceNode(node: any): node is EventNamespaceNode {
    return node?.type === 'event-namespace' &&
           node?.namespace?.name !== undefined;
  }

  /**
   * Extract all events from namespace nodes
   */
  private extractEventsFromCanvas(
    canvas: ExtendedCanvas
  ): Map<string, Set<string>> {
    const namespaceEvents = new Map<string, Set<string>>();

    for (const node of canvas.nodes || []) {
      if (this.isEventNamespaceNode(node)) {
        const namespaceNode = node as EventNamespaceNode;
        const namespace = namespaceNode.namespace.name;
        const events = new Set<string>();

        for (const event of namespaceNode.namespace.events || []) {
          events.add(event.name);
        }

        namespaceEvents.set(namespace, events);
      }
    }

    return namespaceEvents;
  }

  /**
   * Build a map of event name → expected namespace
   */
  private buildEventNamespaceMap(
    namespaceEvents: Map<string, Set<string>>
  ): Map<string, string> {
    const eventNamespaceMap = new Map<string, string>();

    for (const [namespace, events] of namespaceEvents) {
      for (const eventName of events) {
        const extractedNamespace = this.extractNamespace(eventName);
        eventNamespaceMap.set(eventName, extractedNamespace || '');
      }
    }

    return eventNamespaceMap;
  }

  /**
   * Validate an events canvas
   */
  async validate(
    context: EventsCanvasValidationContext
  ): Promise<EventsCanvasValidationResult> {
    const violations: EventsCanvasViolation[] = [];
    const { eventsCanvas, eventsCanvasPath, basePath } = context;

    // Initialize metrics
    const metrics = {
      totalNamespaces: 0,
      documentedNamespaces: [] as string[],
      missingNamespaces: [] as string[],
      totalEvents: 0,
      registeredEvents: [] as string[],
      unregisteredEvents: [] as string[],
    };

    // Check if canvas exists
    if (!eventsCanvas) {
      violations.push({
        ruleId: 'events-canvas-required',
        severity: 'error',
        file: eventsCanvasPath || '.principal-views/cli.events.canvas',
        message: 'Events canvas is required for documenting event namespaces',
        impact: 'Cannot validate event structure or namespace organization',
        suggestion: 'Create an events canvas with event-namespace nodes for each namespace',
      });

      return {
        valid: false,
        violations,
        metrics,
      };
    }

    // Extract namespace nodes and events
    const namespaceEvents = this.extractEventsFromCanvas(eventsCanvas);
    const namespaceNodes = new Set(namespaceEvents.keys());
    metrics.documentedNamespaces = Array.from(namespaceNodes);
    metrics.totalNamespaces = namespaceNodes.size;

    // Collect all event names and their extracted namespaces
    const allEvents = new Set<string>();
    const eventToExtractedNamespace = new Map<string, string>();
    const extractedNamespaces = new Set<string>();

    for (const [namespace, events] of namespaceEvents) {
      for (const eventName of events) {
        allEvents.add(eventName);
        metrics.totalEvents++;

        // Extract namespace from event name
        const extractedNamespace = this.extractNamespace(eventName);

        if (!extractedNamespace) {
          violations.push({
            ruleId: 'events-invalid-event-name',
            severity: 'error',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[].namespace.events[name="${eventName}"]`,
            message: `Event name "${eventName}" is invalid (must have at least 2 segments)`,
            impact: 'Event name does not follow {namespace}.{action} convention',
            suggestion: `Rename to follow pattern like "${namespace}.${eventName}"`,
          });
          continue;
        }

        eventToExtractedNamespace.set(eventName, extractedNamespace);
        extractedNamespaces.add(extractedNamespace);

        // Check namespace consistency: extracted namespace should match the node it's in
        if (extractedNamespace !== namespace) {
          violations.push({
            ruleId: 'events-namespace-mismatch',
            severity: 'error',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[namespace.name="${namespace}"].namespace.events[name="${eventName}"]`,
            message: `Event "${eventName}" is in wrong namespace node (expected: "${extractedNamespace}", actual: "${namespace}")`,
            impact: 'Event is incorrectly organized, making namespace structure confusing',
            suggestion: `Move event "${eventName}" to namespace node "${extractedNamespace}"`,
          });
        } else {
          metrics.registeredEvents.push(eventName);
        }
      }
    }

    // Check for missing namespace nodes
    for (const namespace of extractedNamespaces) {
      if (!namespaceNodes.has(namespace)) {
        metrics.missingNamespaces.push(namespace);
        violations.push({
          ruleId: 'events-namespace-node-missing',
          severity: 'error',
          file: eventsCanvasPath || '.principal-views/cli.events.canvas',
          message: `Namespace "${namespace}" is missing a node in the canvas`,
          impact: 'Cannot visualize or document this namespace group',
          suggestion: `Add a node with type: "event-namespace" and namespace.name: "${namespace}"`,
        });
      }
    }

    // Validate namespace nodes have descriptions
    for (const node of eventsCanvas.nodes || []) {
      if (this.isEventNamespaceNode(node)) {
        const namespaceNode = node as EventNamespaceNode;
        if (!namespaceNode.namespace.description) {
          violations.push({
            ruleId: 'events-namespace-missing-description',
            severity: 'warn',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[id="${namespaceNode.id}"].namespace`,
            message: `Namespace "${namespaceNode.namespace.name}" is missing a description`,
            impact: 'Namespace purpose is undocumented',
            suggestion: 'Add a description field explaining what events this namespace contains',
          });
        }

        // Validate each event has description and severity
        for (const event of namespaceNode.namespace.events || []) {
          if (!event.description) {
            violations.push({
              ruleId: 'events-event-missing-description',
              severity: 'warn',
              file: eventsCanvasPath || '.principal-views/cli.events.canvas',
              path: `nodes[id="${namespaceNode.id}"].namespace.events[name="${event.name}"]`,
              message: `Event "${event.name}" is missing a description`,
              impact: 'Event purpose is undocumented',
              suggestion: 'Add a description field explaining when/why this event is emitted',
            });
          }

          if (!event.severity) {
            violations.push({
              ruleId: 'events-event-missing-severity',
              severity: 'warn',
              file: eventsCanvasPath || '.principal-views/cli.events.canvas',
              path: `nodes[id="${namespaceNode.id}"].namespace.events[name="${event.name}"]`,
              message: `Event "${event.name}" is missing a severity level`,
              impact: 'Cannot determine event criticality',
              suggestion: 'Add severity field with value: "INFO", "WARN", or "ERROR"',
            });
          }
        }
      }
    }

    // Validate namespace paths (optional field — enforcement is opt-in per namespace).
    // Collects declared paths across namespaces to check for cross-namespace overlap.
    const declaredPaths: Array<{ namespace: string; nodeId: string; path: string }> = [];
    for (const node of eventsCanvas.nodes || []) {
      if (!this.isEventNamespaceNode(node)) continue;
      const namespaceNode = node as EventNamespaceNode;
      const paths = namespaceNode.namespace.paths;
      if (!paths || paths.length === 0) continue;

      // Warn when a namespace declares more than one path — prompt author to
      // confirm the multi-location is intentional (generated code, platform
      // splits, migration) rather than an accidental sprawl.
      if (paths.length > 1) {
        violations.push({
          ruleId: 'events-namespace-multiple-paths',
          severity: 'warn',
          file: eventsCanvasPath || '.principal-views/cli.events.canvas',
          path: `nodes[id="${namespaceNode.id}"].namespace.paths`,
          message: `Namespace "${namespaceNode.namespace.name}" declares ${paths.length} paths`,
          impact: 'Multiple paths can indicate legitimate cases (generated code, platform splits, migration) but often signal that the namespace should be split',
          suggestion: 'Confirm the multi-location is intentional. Otherwise consider splitting the namespace or grouping the code under a single parent folder.',
        });
      }

      for (const p of paths) {
        declaredPaths.push({
          namespace: namespaceNode.namespace.name,
          nodeId: namespaceNode.id,
          path: p,
        });

        // Warn when a declared path does not exist relative to the repo root.
        const resolved = this.fsAdapter.join(basePath, p);
        if (!(await this.fsAdapter.exists(resolved))) {
          violations.push({
            ruleId: 'events-namespace-paths-missing',
            severity: 'warn',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[id="${namespaceNode.id}"].namespace.paths`,
            message: `Path "${p}" declared by namespace "${namespaceNode.namespace.name}" does not exist`,
            impact: 'Events emitted under this namespace cannot be validated against a real code location',
            suggestion: 'Verify the path exists relative to the repository root, or remove it from the namespace declaration.',
          });
        }
      }
    }

    // Cross-namespace overlap check. Parent-child nesting is a valid partition
    // (longest-prefix wins at runtime); any other overlap makes namespace
    // ownership of a file ambiguous.
    for (let i = 0; i < declaredPaths.length; i++) {
      for (let j = i + 1; j < declaredPaths.length; j++) {
        const a = declaredPaths[i];
        const b = declaredPaths[j];
        if (a.namespace === b.namespace) continue;

        const relationship = pathsOverlap(a.path, b.path);
        if (relationship === 'conflict') {
          violations.push({
            ruleId: 'events-namespace-paths-overlap',
            severity: 'error',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            message: `Paths overlap between namespaces "${a.namespace}" ("${a.path}") and "${b.namespace}" ("${b.path}")`,
            impact: 'A file covered by two namespaces makes namespace ownership ambiguous',
            suggestion: 'Separate the paths so they are disjoint, or restructure as parent/child namespaces (e.g., "workflow" covering "src/workflow" and "workflow.scenarios" covering "src/workflow/scenarios").',
          });
        }
      }
    }

    metrics.totalNamespaces = extractedNamespaces.size;

    const errors = violations.filter(v => v.severity === 'error');

    return {
      valid: errors.length === 0,
      violations,
      metrics,
    };
  }
}
