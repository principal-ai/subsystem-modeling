/**
 * Hook for managing undo/redo history in the graph editor
 *
 * Tracks position changes, dimension changes, edge operations, and node deletions
 * Supports batch operations (e.g., moving multiple selected nodes = single undo)
 */

import { useRef, useState, useCallback } from 'react';
import type { NodeState, EdgeState } from '@principal-ai/subsystems-core';

const MAX_HISTORY_SIZE = 50;

/**
 * Individual history entry types
 */
export type HistoryEntry =
  | {
      type: 'position';
      nodeId: string;
      before: { x: number; y: number };
      after: { x: number; y: number };
    }
  | {
      type: 'dimension';
      nodeId: string;
      before: { width: number; height: number };
      after: { width: number; height: number };
    }
  | {
      type: 'text';
      nodeId: string;
      before: string;
      after: string;
    }
  | {
      type: 'nodeDelete';
      nodeId: string;
      nodeData: NodeState;
    }
  | {
      type: 'edgeCreate';
      edge: EdgeState & { sourceHandle?: string; targetHandle?: string };
    }
  | {
      type: 'edgeDelete';
      edge: EdgeState & { sourceHandle?: string; targetHandle?: string };
    };

/**
 * A batch of history entries that should be undone/redone together
 */
export type HistoryBatch = HistoryEntry[];

export interface UseUndoRedoReturn {
  /** Whether there are entries to undo */
  canUndo: boolean;
  /** Whether there are entries to redo */
  canRedo: boolean;
  /** Undo the last batch of changes, returns the entries to reverse */
  undo: () => HistoryBatch | null;
  /** Redo the last undone batch, returns the entries to re-apply */
  redo: () => HistoryBatch | null;
  /** Push a new batch of entries to the undo stack (clears redo stack) */
  pushHistory: (entries: HistoryBatch) => void;
  /** Clear all history (both undo and redo stacks) */
  clearHistory: () => void;
}

/**
 * Hook for managing undo/redo history
 *
 * Uses refs for stacks to avoid re-renders on every push,
 * with state for canUndo/canRedo to trigger UI updates
 */
export function useUndoRedo(): UseUndoRedoReturn {
  // Use refs for stacks to avoid re-renders on every push
  const undoStackRef = useRef<HistoryBatch[]>([]);
  const redoStackRef = useRef<HistoryBatch[]>([]);

  // State for UI updates (canUndo/canRedo)
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateCanStates = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushHistory = useCallback(
    (entries: HistoryBatch) => {
      if (entries.length === 0) return;

      undoStackRef.current.push(entries);

      // Limit stack size
      if (undoStackRef.current.length > MAX_HISTORY_SIZE) {
        undoStackRef.current.shift();
      }

      // Clear redo stack when new changes are made
      redoStackRef.current = [];

      updateCanStates();
    },
    [updateCanStates]
  );

  const undo = useCallback((): HistoryBatch | null => {
    const batch = undoStackRef.current.pop();
    if (!batch) return null;

    // Push to redo stack
    redoStackRef.current.push(batch);

    updateCanStates();
    return batch;
  }, [updateCanStates]);

  const redo = useCallback((): HistoryBatch | null => {
    const batch = redoStackRef.current.pop();
    if (!batch) return null;

    // Push back to undo stack
    undoStackRef.current.push(batch);

    updateCanStates();
    return batch;
  }, [updateCanStates]);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    updateCanStates();
  }, [updateCanStates]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
    clearHistory,
  };
}
