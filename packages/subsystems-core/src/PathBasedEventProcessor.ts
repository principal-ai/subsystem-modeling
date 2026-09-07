/**
 * Path-Based Event Processor
 *
 * Converts log entries to graph events by associating logs with components
 * based on source file paths.
 *
 * Milestone 1: Basic component activity events
 * Milestone 2: Action pattern matching and edge activation
 */

import { PathMatcher } from './utils/PathMatcher';
import type {
  PathBasedGraphConfiguration,
  ComponentActivityEvent,
  PathBasedEvent,
  // ActionPattern removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
  LogLevel,
} from './types/path-based-config';
import type { JsonValue } from './types';

/**
 * Log entry from logger (simplified interface to avoid circular dependency)
 */
export interface LogEntry {
  message: string;
  metadata: {
    timestamp: number;
    level: LogLevel;
    source?: {
      file: string;
      line?: number;
      column?: number;
    };
    /**
     * Instance identifier for multi-instance components.
     * Used to differentiate between multiple nodes of the same type
     * (e.g., "client-1", "client-2" for components of type "client").
     */
    instanceId?: string;
  };
  args?: JsonValue[];
}

/**
 * Component source mapping (componentId → source patterns)
 */
interface ComponentSourceMap {
  componentId: string;
  sources: string[];
}

/**
 * Path-based event processor
 */
export class PathBasedEventProcessor {
  private componentSourceMap: ComponentSourceMap[] = [];
  private config: PathBasedGraphConfiguration;

  constructor(config: PathBasedGraphConfiguration) {
    this.config = config;
    this.buildComponentSourceMap();
  }

  /**
   * Build the component-to-source-path mapping from configuration
   */
  private buildComponentSourceMap(): void {
    this.componentSourceMap = [];

    for (const [componentId, nodeType] of Object.entries(this.config.nodeTypes)) {
      if (nodeType.sources && nodeType.sources.length > 0) {
        this.componentSourceMap.push({
          componentId,
          sources: nodeType.sources,
          // actions removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
        });
      }
    }
  }

  /**
   * Process a log entry and convert to graph event(s)
   *
   * @param log Log entry from enhanced logger
   * @returns Array of graph events (can be multiple if action triggers edges)
   */
  public processLog(log: LogEntry): PathBasedEvent[] {
    const events: PathBasedEvent[] = [];

    // Skip logs without source information
    if (!log.metadata.source?.file) {
      return events;
    }

    // Find component by matching source path
    const component = this.findComponentByPath(log.metadata.source.file);

    if (!component) {
      // Log doesn't match any configured component
      return events;
    }

    // Create generic component activity event
    const activityEvent: ComponentActivityEvent = {
      type: 'component-activity',
      componentId: component.componentId,
      instanceId: log.metadata.instanceId,
      timestamp: log.metadata.timestamp,
      level: log.metadata.level,
      message: log.message,
      source: {
        file: log.metadata.source.file,
        line: log.metadata.source.line,
        column: log.metadata.source.column,
      },
      args: log.args,
    };

    events.push(activityEvent);
    return events;
  }

  /**
   * Find component by matching source path against configured patterns
   */
  private findComponentByPath(logPath: string): ComponentSourceMap | null {
    for (const component of this.componentSourceMap) {
      // Check if any of the component's source patterns match the log path
      for (const sourcePattern of component.sources) {
        if (PathMatcher.matches(logPath, sourcePattern)) {
          return component;
        }
      }
    }

    return null;
  }

  /**
   * Batch process multiple log entries
   */
  public processLogs(logs: LogEntry[]): PathBasedEvent[] {
    const events: PathBasedEvent[] = [];

    for (const log of logs) {
      events.push(...this.processLog(log));
    }

    return events;
  }

  /**
   * Get statistics about component source mappings
   */
  public getStats(): {
    totalComponents: number;
    componentsWithSources: number;
    totalSourcePatterns: number;
  } {
    return {
      totalComponents: Object.keys(this.config.nodeTypes).length,
      componentsWithSources: this.componentSourceMap.length,
      totalSourcePatterns: this.componentSourceMap.reduce((sum, c) => sum + c.sources.length, 0),
    };
  }

  /**
   * Validate configuration and return warnings/errors
   */
  public validate(): Array<{ type: 'error' | 'warning'; message: string; componentId?: string }> {
    const issues: Array<{ type: 'error' | 'warning'; message: string; componentId?: string }> = [];

    // Check for overlapping source patterns
    for (let i = 0; i < this.componentSourceMap.length; i++) {
      for (let j = i + 1; j < this.componentSourceMap.length; j++) {
        const comp1 = this.componentSourceMap[i];
        const comp2 = this.componentSourceMap[j];

        // Check if any patterns overlap
        for (const pattern1 of comp1.sources) {
          for (const pattern2 of comp2.sources) {
            if (pattern1 === pattern2) {
              issues.push({
                type: 'warning',
                message: `Components "${comp1.componentId}" and "${comp2.componentId}" both use pattern "${pattern1}". Logs will be associated with the first match.`,
                componentId: comp1.componentId,
              });
            }
          }
        }
      }
    }

    return issues;
  }
}
