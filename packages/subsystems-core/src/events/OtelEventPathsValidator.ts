/**
 * OTEL Event Paths Validator (Phase 2)
 *
 * Cross-canvas static check. For every `otel-event` node in an OTEL canvas,
 * cross-reference each entry in `otel.files` against the `paths` declared on
 * the event's namespace in the corresponding events canvas.
 *
 * Enforcement is opt-in per namespace: a namespace without `paths` (or a
 * namespace not declared at all) produces no violations for its events.
 *
 * Pure/browser-safe — no filesystem access.
 */

import type { ExtendedCanvas, OtelEventNode } from '../types/canvas';
import { isOtelEventNode } from '../types/canvas';
import { NamespacePathIndex, type NamespacePathEntry } from './NamespacePathIndex';

/**
 * One events canvas, pre-paired with the scope it owns. Scope pairing is
 * typically derived via the existing scope → filename convention
 * (e.g., scope `principal-view.cli` owns `principal-view-cli.events.canvas`).
 */
export interface EventsCanvasInput {
  canvas: ExtendedCanvas;
  canvasPath: string;
  scope: string;
}

/**
 * One OTEL canvas whose `otel-event` nodes we want to cross-check.
 */
export interface OtelCanvasInput {
  canvas: ExtendedCanvas;
  canvasPath: string;
}

export interface OtelEventPathsValidationContext {
  eventsCanvases: EventsCanvasInput[];
  otelCanvases: OtelCanvasInput[];
}

export type OtelEventPathsRuleId =
  | 'events-otel-files-wrong-namespace'
  | 'events-otel-files-orphan';

export interface OtelEventPathsViolation {
  ruleId: OtelEventPathsRuleId;
  severity: 'error' | 'warn';
  file: string;
  path?: string;
  message: string;
  impact: string;
  suggestion: string;
}

export interface OtelEventPathsValidationResult {
  valid: boolean;
  violations: OtelEventPathsViolation[];
  metrics: {
    /** Events whose files were cross-checked against namespace paths. */
    eventsChecked: number;
    /** Total files examined across all checked events. */
    filesChecked: number;
    /**
     * Events skipped because the event's namespace has no `paths` declared
     * (or is not declared at all) — enforcement is opt-in per namespace.
     */
    eventsSkippedNoPaths: number;
    /**
     * Events skipped because the `otel-event` node declares no `otel.files`.
     * These events have no claimed implementation location to cross-check.
     */
    eventsSkippedNoFiles: number;
  };
}

export class OtelEventPathsValidator {
  /**
   * Build a path index from the events canvases, keyed by scope.
   * Only namespaces that declare `paths` contribute entries.
   */
  private buildIndex(eventsCanvases: EventsCanvasInput[]): NamespacePathIndex {
    const index = new NamespacePathIndex();
    for (const ec of eventsCanvases) {
      for (const node of ec.canvas.nodes || []) {
        if ((node as any)?.type !== 'event-namespace') continue;
        const ns = (node as any).namespace;
        if (!ns || typeof ns.name !== 'string') continue;
        if (!Array.isArray(ns.paths) || ns.paths.length === 0) continue;

        const entry: NamespacePathEntry = {
          scope: ec.scope,
          namespace: ns.name,
          paths: ns.paths,
          sourceCanvasPath: ec.canvasPath,
        };
        index.add(entry);
      }
    }
    return index;
  }

  /** Extract the namespace from an event name (all segments except the last). */
  private extractNamespace(eventName: string): string | null {
    const segments = eventName.split('.');
    if (segments.length < 2) return null;
    return segments.slice(0, -1).join('.');
  }

  validate(context: OtelEventPathsValidationContext): OtelEventPathsValidationResult {
    const violations: OtelEventPathsViolation[] = [];
    const metrics = {
      eventsChecked: 0,
      filesChecked: 0,
      eventsSkippedNoPaths: 0,
      eventsSkippedNoFiles: 0,
    };

    const index = this.buildIndex(context.eventsCanvases);

    for (const oc of context.otelCanvases) {
      for (const node of oc.canvas.nodes || []) {
        if (!isOtelEventNode(node as any)) continue;
        const eventNode = node as OtelEventNode;
        const eventName = eventNode.event?.name;
        const scope = eventNode.otel?.scope;
        const files = eventNode.otel?.files;

        if (!eventName || !scope) continue; // malformed — other validators catch this

        const namespace = this.extractNamespace(eventName);
        if (!namespace) continue; // invalid event name — caught by other validators

        if (!files || files.length === 0) {
          metrics.eventsSkippedNoFiles++;
          continue;
        }

        // Enforcement is opt-in: if the event's namespace has no declared
        // paths (or isn't declared at all), we don't check its files.
        const eventEntry = index.getEntry(scope, namespace);
        if (!eventEntry) {
          metrics.eventsSkippedNoPaths++;
          continue;
        }

        metrics.eventsChecked++;

        for (const file of files) {
          metrics.filesChecked++;

          const match = index.resolve(scope, file);
          if (match === null) {
            violations.push({
              ruleId: 'events-otel-files-orphan',
              severity: 'warn',
              file: oc.canvasPath,
              path: `nodes[id="${eventNode.id}"].otel.files["${file}"]`,
              message: `Event "${eventName}" declares file "${file}" which is not covered by any namespace's paths in scope "${scope}"`,
              impact: 'The file emits an event but has no declared component home, so its location cannot be validated against namespace conventions.',
              suggestion: `Either add "${file}" (or an ancestor folder) to the "paths" of the "${namespace}" namespace in the events canvas, or move the implementation into one of the namespace's declared paths: ${eventEntry.paths.map((p) => `"${p}"`).join(', ')}.`,
            });
            continue;
          }

          if (match.entry.namespace === namespace) {
            // File belongs to the event's namespace (longest-prefix match).
            continue;
          }

          violations.push({
            ruleId: 'events-otel-files-wrong-namespace',
            severity: 'error',
            file: oc.canvasPath,
            path: `nodes[id="${eventNode.id}"].otel.files["${file}"]`,
            message: `Event "${eventName}" declares file "${file}", but namespace "${match.entry.namespace}" (path "${match.matchedPath}") owns that location — not "${namespace}"`,
            impact: 'Event identity disagrees with code location. Consumers discovering the event by name will land in a folder that belongs to a different namespace.',
            suggestion: `Either rename the event to start with "${match.entry.namespace}." (if the code placement is correct), or move the implementation into one of the "${namespace}" namespace's declared paths (${eventEntry.paths.map((p) => `"${p}"`).join(', ')}).`,
          });
        }
      }
    }

    const errors = violations.filter((v) => v.severity === 'error');
    return {
      valid: errors.length === 0,
      violations,
      metrics,
    };
  }
}
