/**
 * Animation mapping utilities
 *
 * Maps log levels and component events to appropriate animations
 * for Milestone 1 default visualization behavior
 */

import type { LogLevel } from '@principal-ai/subsystems-core';

/**
 * Node animation configuration
 */
export interface NodeAnimation {
  type: 'pulse' | 'flash' | 'shake' | 'entry';
  duration: number;
  intensity?: number; // 0-1 scale
  color?: string;
}

/**
 * Edge animation configuration
 */
export interface EdgeAnimation {
  type: 'flow' | 'particle' | 'pulse' | 'glow';
  duration: number;
  direction?: 'forward' | 'backward' | 'bidirectional';
  color?: string;
}

/**
 * Map log level to node animation
 *
 * Default behavior for Milestone 1:
 * - debug: subtle pulse (low intensity)
 * - info: standard pulse (medium intensity)
 * - warn: amber pulse (high intensity)
 * - error: red flash + shake
 */
export function logLevelToNodeAnimation(level: LogLevel): NodeAnimation {
  switch (level) {
    case 'debug':
      return {
        type: 'pulse',
        duration: 800,
        intensity: 0.3,
        color: '#94a3b8', // slate-400
      };

    case 'info':
      return {
        type: 'pulse',
        duration: 1000,
        intensity: 0.5,
        color: '#3b82f6', // blue-500
      };

    case 'warn':
      return {
        type: 'pulse',
        duration: 1200,
        intensity: 1.0,
        color: '#f59e0b', // amber-500
      };

    case 'error':
      return {
        type: 'flash', // More dramatic animation for errors
        duration: 1500,
        intensity: 1.0,
        color: '#ef4444', // red-500
      };
  }
}

/**
 * Map component action to node animation (Milestone 2)
 */
export function actionToNodeAnimation(_action: string, state?: string): NodeAnimation {
  // Default mapping - can be overridden by configuration
  switch (state) {
    case 'acquired':
    case 'active':
    case 'processing':
      return {
        type: 'pulse',
        duration: 1000,
        intensity: 0.8,
        color: '#22c55e', // green-500
      };

    case 'waiting':
    case 'pending':
      return {
        type: 'pulse',
        duration: 1500,
        intensity: 0.5,
        color: '#eab308', // yellow-500
      };

    case 'error':
    case 'failed':
      return {
        type: 'shake',
        duration: 600,
        intensity: 1.0,
        color: '#ef4444', // red-500
      };

    case 'completed':
    case 'success':
      return {
        type: 'flash',
        duration: 800,
        intensity: 0.7,
        color: '#22c55e', // green-500
      };

    default:
      // Generic action animation
      return {
        type: 'pulse',
        duration: 1000,
        intensity: 0.6,
        color: '#3b82f6', // blue-500
      };
  }
}

/**
 * Get animation config for edge based on action (Milestone 2)
 */
export function actionToEdgeAnimation(_action: string, edgeConfig?: EdgeAnimation): EdgeAnimation {
  // Use edge config if provided, otherwise default
  return (
    edgeConfig || {
      type: 'flow',
      duration: 2000,
      direction: 'forward',
    }
  );
}

/**
 * Check if log level should trigger animation
 */
export function shouldAnimate(level: LogLevel, minLevel: LogLevel = 'info'): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const minIndex = levels.indexOf(minLevel);
  const currentIndex = levels.indexOf(level);

  return currentIndex >= minIndex;
}

/**
 * Calculate animation intensity based on frequency
 * Used to adjust animation intensity when multiple logs occur rapidly
 */
export function calculateIntensity(
  baseIntensity: number,
  eventCount: number,
  _timeWindow: number = 1000
): number {
  // Reduce intensity if too many events in time window
  const scaleFactor = Math.min(1.0, 5.0 / eventCount);
  return Math.max(0.2, baseIntensity * scaleFactor);
}
