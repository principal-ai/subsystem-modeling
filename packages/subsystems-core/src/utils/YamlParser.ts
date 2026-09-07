/**
 * YAML parsing utility for loading configuration files
 *
 * Provides error handling and validation for YAML configuration files.
 * Supports both .yaml and .yml file extensions.
 */

import * as yaml from 'js-yaml';
import { PathBasedGraphConfiguration } from '../types/path-based-config';

export interface YamlParseResult {
  success: boolean;
  data?: PathBasedGraphConfiguration;
  error?: string;
}

/**
 * Parse YAML content into a configuration object
 *
 * @param content - Raw YAML string content
 * @param filename - Optional filename for error messages
 * @returns Parse result with configuration or error
 */
export function parseYaml(content: string, filename?: string): YamlParseResult {
  try {
    const data = yaml.load(content) as PathBasedGraphConfiguration;

    if (!data) {
      return {
        success: false,
        error: `Empty YAML file${filename ? `: ${filename}` : ''}`,
      };
    }

    // Basic validation - ensure it has the required structure
    if (!data.metadata || !data.nodeTypes || !data.edgeTypes) {
      return {
        success: false,
        error: `Invalid configuration structure${
          filename ? ` in ${filename}` : ''
        }: missing required fields (metadata, nodeTypes, or edgeTypes)`,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `YAML parse error${filename ? ` in ${filename}` : ''}: ${errorMessage}`,
    };
  }
}

/**
 * Check if a filename has a valid YAML extension
 *
 * @param filename - Filename to check
 * @returns True if filename ends with .yaml or .yml
 */
export function isYamlFile(filename: string): boolean {
  return filename.endsWith('.yaml') || filename.endsWith('.yml');
}

/**
 * Extract configuration name from filename
 * Removes the .yaml or .yml extension
 *
 * @param filename - Filename to process
 * @returns Configuration name without extension
 */
export function getConfigNameFromFilename(filename: string): string {
  return filename.replace(/\.(yaml|yml)$/, '');
}
