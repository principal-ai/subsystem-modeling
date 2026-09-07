/**
 * useStateView Hook
 *
 * Manages state accumulation from events and provides replay controls.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  StateEvent,
  EventSource,
  StateReducer,
  StateDiff,
  ReplayControls,
  ActiveAnimation,
  TransitionDefinition,
} from './types';

export interface UseStateViewOptions<TState, TEvent extends StateEvent> {
  /** Initial state */
  initialState: TState;
  /** Reducer to apply events */
  reducer: StateReducer<TState, TEvent>;
  /** Event source (live or replay) */
  eventSource: EventSource<TEvent>;
  /** Transition definitions for animations */
  transitions?: TransitionDefinition[];
  /** Callback when state changes */
  onStateChange?: (diff: StateDiff<TState>) => void;
}

export interface UseStateViewResult<TState> {
  /** Current state */
  state: TState;
  /** Active animations */
  animations: ActiveAnimation[];
  /** Whether we're in replay mode */
  isReplay: boolean;
  /** Replay controls (if in replay mode) */
  replayControls?: ReplayControls;
  /** Reset state to initial */
  reset: () => void;
}

/**
 * Get changed paths between two objects (shallow comparison)
 */
function getChangedPaths(prev: unknown, next: unknown, prefix = ''): string[] {
  const paths: string[] = [];

  if (prev === next) return paths;

  if (
    typeof prev !== 'object' ||
    typeof next !== 'object' ||
    prev === null ||
    next === null
  ) {
    return prefix ? [prefix] : [];
  }

  const prevObj = prev as Record<string, unknown>;
  const nextObj = next as Record<string, unknown>;

  const allKeys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (prevObj[key] !== nextObj[key]) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Check if a transition should fire based on state change
 */
function shouldTriggerTransition(
  transition: TransitionDefinition,
  prev: unknown,
  next: unknown,
  changedPaths: string[]
): boolean {
  // Check if the watched path changed
  if (!changedPaths.some((p) => p.startsWith(transition.watch))) {
    return false;
  }

  const prevValue = getValueAtPath(prev, transition.watch);
  const nextValue = getValueAtPath(next, transition.watch);

  switch (transition.condition) {
    case 'changed':
      return prevValue !== nextValue;
    case 'increased':
      return typeof nextValue === 'number' && typeof prevValue === 'number' && nextValue > prevValue;
    case 'decreased':
      return typeof nextValue === 'number' && typeof prevValue === 'number' && nextValue < prevValue;
    case 'added':
      return prevValue === undefined && nextValue !== undefined;
    case 'removed':
      return prevValue !== undefined && nextValue === undefined;
    default:
      return false;
  }
}

function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function useStateView<TState, TEvent extends StateEvent>({
  initialState,
  reducer,
  eventSource,
  transitions = [],
  onStateChange,
}: UseStateViewOptions<TState, TEvent>): UseStateViewResult<TState> {
  const [state, setState] = useState<TState>(initialState);
  const [animations, setAnimations] = useState<ActiveAnimation[]>([]);
  const prevStateRef = useRef<TState>(initialState);
  const animationIdRef = useRef(0);

  const triggerAnimation = useCallback(
    (transition: TransitionDefinition, _event: StateEvent) => {
      const id = `anim-${++animationIdRef.current}`;
      const duration = transition.duration ?? 500;

      const animation: ActiveAnimation = {
        id,
        type: transition.animate,
        target: transition.target ?? transition.watch,
        startTime: Date.now(),
        duration,
        params: transition.params,
      };

      setAnimations((prev) => [...prev, animation]);

      // Auto-remove after duration
      setTimeout(() => {
        setAnimations((prev) => prev.filter((a) => a.id !== id));
      }, duration);
    },
    []
  );

  const handleEvent = useCallback(
    (event: TEvent) => {
      setState((prevState) => {
        const nextState = reducer(prevState, event);
        const changedPaths = getChangedPaths(prevState, nextState);

        // Trigger animations based on transitions
        for (const transition of transitions) {
          if (shouldTriggerTransition(transition, prevState, nextState, changedPaths)) {
            triggerAnimation(transition, event);
          }
        }

        // Notify listener
        if (onStateChange && changedPaths.length > 0) {
          onStateChange({
            prev: prevState,
            next: nextState,
            changedPaths,
            event,
          });
        }

        prevStateRef.current = nextState;
        return nextState;
      });
    },
    [reducer, transitions, onStateChange, triggerAnimation]
  );

  // Subscribe to event source
  useEffect(() => {
    const unsubscribe = eventSource.subscribe(handleEvent);
    return unsubscribe;
  }, [eventSource, handleEvent]);

  const reset = useCallback(() => {
    setState(initialState);
    setAnimations([]);
    prevStateRef.current = initialState;
  }, [initialState]);

  const isReplay = eventSource.mode === 'replay';

  return {
    state,
    animations,
    isReplay,
    reset,
  };
}
