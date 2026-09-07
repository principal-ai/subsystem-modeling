/**
 * Hook for processing path-based events and mapping them to animations
 *
 * Handles ComponentActivityEvent and ComponentActionEvent from
 * PathBasedEventProcessor (Milestone 1 & 2)
 */

import { useEffect, useCallback } from 'react';
import type {
  ComponentActivityEvent,
  ComponentActionEvent,
  EdgeAnimationEvent,
  PathBasedEvent,
} from '@principal-ai/subsystems-core';
import {
  logLevelToNodeAnimation,
  actionToNodeAnimation,
  actionToEdgeAnimation,
  type NodeAnimation,
  type EdgeAnimation,
} from '../utils/animationMapping';

/**
 * Animation update callbacks
 */
export interface AnimationCallbacks {
  onNodeAnimation: (nodeId: string, animation: NodeAnimation & { timestamp: number }) => void;
  onEdgeAnimation: (edgeId: string, animation: EdgeAnimation & { timestamp: number }) => void;
}

/**
 * Hook options
 */
export interface UsePathBasedEventsOptions {
  /** Path-based events to process */
  events: PathBasedEvent[];

  /** Callbacks for triggering animations */
  callbacks: AnimationCallbacks;

  /** Optional callback when event is processed */
  onEventProcessed?: (event: PathBasedEvent) => void;

  /** Minimum log level to trigger animations (default: 'info') */
  minLogLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Process path-based events and trigger appropriate animations
 */
export function usePathBasedEvents({
  events,
  callbacks,
  onEventProcessed,
  minLogLevel = 'info',
}: UsePathBasedEventsOptions): void {
  const { onNodeAnimation, onEdgeAnimation } = callbacks;

  // Process component activity events (Milestone 1)
  const processActivityEvent = useCallback(
    (event: ComponentActivityEvent) => {
      // Map log level to animation
      const animation = logLevelToNodeAnimation(event.level);

      // Trigger node animation
      onNodeAnimation(event.componentId, {
        ...animation,
        timestamp: event.timestamp,
      });

      onEventProcessed?.(event);
    },
    [onNodeAnimation, onEventProcessed]
  );

  // Process component action events (Milestone 2)
  const processActionEvent = useCallback(
    (event: ComponentActionEvent) => {
      // Map action/state to animation
      const animation = actionToNodeAnimation(event.action, event.state);

      // Trigger node animation
      onNodeAnimation(event.componentId, {
        ...animation,
        timestamp: event.timestamp,
      });

      onEventProcessed?.(event);
    },
    [onNodeAnimation, onEventProcessed]
  );

  // Process edge animation events (Milestone 2)
  const processEdgeAnimationEvent = useCallback(
    (event: EdgeAnimationEvent) => {
      const animation = actionToEdgeAnimation(event.triggeredBy?.action || 'unknown', {
        type: event.animation,
        duration: event.duration,
        direction: event.direction,
      });

      onEdgeAnimation(event.edgeId, {
        ...animation,
        timestamp: event.timestamp,
      });

      onEventProcessed?.(event);
    },
    [onEdgeAnimation, onEventProcessed]
  );

  // Process events when they change
  useEffect(() => {
    if (events.length === 0) return;

    // Process the latest event
    const latestEvent = events[events.length - 1];

    switch (latestEvent.type) {
      case 'component-activity': {
        // Milestone 1: Component activity from log
        // Check if log level is high enough to trigger animation
        const levels = ['debug', 'info', 'warn', 'error'];
        if (levels.indexOf(latestEvent.level) >= levels.indexOf(minLogLevel)) {
          processActivityEvent(latestEvent);
        }
        break;
      }

      case 'component-action':
        // Milestone 2: Specific action from pattern match
        processActionEvent(latestEvent);
        break;

      case 'edge-animation':
        // Milestone 2: Edge activation from action trigger
        processEdgeAnimationEvent(latestEvent);
        break;
    }
  }, [events, processActivityEvent, processActionEvent, processEdgeAnimationEvent, minLogLevel]);
}

/**
 * Process a batch of path-based events
 * Useful for processing historical logs or bulk updates
 */
export function processBatchEvents(
  events: PathBasedEvent[],
  callbacks: AnimationCallbacks,
  minLogLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
): void {
  const levels = ['debug', 'info', 'warn', 'error'];
  const minLevelIndex = levels.indexOf(minLogLevel);

  for (const event of events) {
    switch (event.type) {
      case 'component-activity':
        if (levels.indexOf(event.level) >= minLevelIndex) {
          const animation = logLevelToNodeAnimation(event.level);
          callbacks.onNodeAnimation(event.componentId, {
            ...animation,
            timestamp: event.timestamp,
          });
        }
        break;

      case 'component-action':
        {
          const animation = actionToNodeAnimation(event.action, event.state);
          callbacks.onNodeAnimation(event.componentId, {
            ...animation,
            timestamp: event.timestamp,
          });
        }
        break;

      case 'edge-animation':
        {
          const animation = actionToEdgeAnimation(event.triggeredBy?.action || 'unknown', {
            type: event.animation,
            duration: event.duration,
            direction: event.direction,
          });
          callbacks.onEdgeAnimation(event.edgeId, {
            ...animation,
            timestamp: event.timestamp,
          });
        }
        break;
    }
  }
}
