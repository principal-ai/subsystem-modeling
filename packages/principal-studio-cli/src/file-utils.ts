/**
 * Shared file utilities for CLI commands
 */

import { basename } from 'node:path';

/**
 * File types recognized by the CLI
 */
export type FileType = 'canvas' | 'workflow' | 'testTrace' | 'library' | 'dashboard' | 'unknown';

/**
 * Determine file type based on naming convention
 *
 * This function is shared between validate and lint commands to ensure
 * consistent file type detection across the CLI.
 */
export function determineFileType(filePath: string): FileType {
  const name = basename(filePath).toLowerCase();

  if (name.startsWith('library.')) {
    return 'library';
  }
  if (name.endsWith('.workflow.json')) {
    return 'workflow';
  }
  if (name.endsWith('.dashboard.json')) {
    return 'dashboard';
  }
  if (name.endsWith('.otel.json')) {
    return 'testTrace';
  }
  if (name.endsWith('.canvas') || name.endsWith('.otel.canvas')) {
    return 'canvas';
  }
  return 'unknown';
}
