/**
 * Configuration loader for managing multiple graph configurations
 *
 * Supports loading configurations from the .principal-views/ folder using the adapter pattern
 * for environment-agnostic file operations.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { PathBasedGraphConfiguration } from './types/path-based-config';
import { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';

/**
 * Represents a single configuration file
 */
export interface ConfigurationFile {
  /** Configuration name (filename without extension) */
  name: string;
  /** Full path to the configuration file */
  path: string;
  /** Parsed configuration data */
  config: PathBasedGraphConfiguration;
}

/**
 * Result of loading all configurations
 */
export interface ConfigurationLoadResult {
  /** Successfully loaded configurations */
  configs: ConfigurationFile[];
  /** Errors encountered during loading */
  errors: Array<{ file: string; error: string }>;
}

/**
 * Loader for managing multiple graph configurations from .principal-views/ folder
 */
export class ConfigurationLoader {
  private static readonly CONFIG_DIR = '.principal-views';

  constructor(private fsAdapter: FileSystemAdapter) {}

  /**
   * Check if the .principal-views/ configuration directory exists
   *
   * @param baseDir - Base directory to search from
   * @returns True if .principal-views/ directory exists
   */
  async hasConfigDirectory(baseDir: string): Promise<boolean> {
    const configPath = this.fsAdapter.join(baseDir, ConfigurationLoader.CONFIG_DIR);
    const exists = await this.fsAdapter.exists(configPath);
    if (!exists) return false;
    return await this.fsAdapter.isDirectory(configPath);
  }

  /**
   * List all available configuration names in .principal-views/ folder
   *
   * @param baseDir - Base directory containing .principal-views/ folder
   * @returns Array of configuration names (without extensions)
   */
  async listConfigurations(baseDir: string): Promise<string[]> {
    if (!(await this.hasConfigDirectory(baseDir))) {
      return [];
    }

    const configPath = this.fsAdapter.join(baseDir, ConfigurationLoader.CONFIG_DIR);
    const files = await this.fsAdapter.readDir(configPath);

    return files.filter(isYamlFile).map(getConfigNameFromFilename).sort();
  }

  /**
   * Load a specific configuration by name
   *
   * @param name - Configuration name (without extension)
   * @param baseDir - Base directory containing .principal-views/ folder
   * @returns Configuration file or null if not found/invalid
   */
  async loadByName(name: string, baseDir: string): Promise<ConfigurationFile | null> {
    if (!(await this.hasConfigDirectory(baseDir))) {
      return null;
    }

    const configPath = this.fsAdapter.join(baseDir, ConfigurationLoader.CONFIG_DIR);

    // Try both .yaml and .yml extensions
    for (const ext of ['yaml', 'yml']) {
      const filename = `${name}.${ext}`;
      const fullPath = this.fsAdapter.join(configPath, filename);

      if (await this.fsAdapter.exists(fullPath)) {
        try {
          const content = await this.fsAdapter.readFile(fullPath);
          const parseResult = parseYaml(content, filename);

          if (parseResult.success && parseResult.data) {
            return {
              name,
              path: fullPath,
              config: parseResult.data,
            };
          }
        } catch (error) {
          // File exists but couldn't be read or parsed
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Load all configurations from .principal-views/ folder
   *
   * @param baseDir - Base directory containing .principal-views/ folder
   * @returns Result containing all loaded configs and any errors
   */
  async loadAll(baseDir: string): Promise<ConfigurationLoadResult> {
    const result: ConfigurationLoadResult = {
      configs: [],
      errors: [],
    };

    if (!(await this.hasConfigDirectory(baseDir))) {
      result.errors.push({
        file: '.principal-views',
        error: 'Configuration directory .principal-views/ not found',
      });
      return result;
    }

    const configPath = this.fsAdapter.join(baseDir, ConfigurationLoader.CONFIG_DIR);
    const files = await this.fsAdapter.readDir(configPath);

    for (const filename of files) {
      if (!isYamlFile(filename)) {
        continue; // Skip non-YAML files
      }

      const fullPath = this.fsAdapter.join(configPath, filename);
      const name = getConfigNameFromFilename(filename);

      try {
        const content = await this.fsAdapter.readFile(fullPath);
        const parseResult = parseYaml(content, filename);

        if (parseResult.success && parseResult.data) {
          result.configs.push({
            name,
            path: fullPath,
            config: parseResult.data,
          });
        } else if (parseResult.error) {
          result.errors.push({
            file: filename,
            error: parseResult.error,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          file: filename,
          error: `Failed to read file: ${errorMessage}`,
        });
      }
    }

    // Sort configs by name for consistent ordering
    result.configs.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  /**
   * Get the configuration directory path
   *
   * @param baseDir - Base directory
   * @returns Full path to .principal-views/ directory
   */
  getConfigDirectoryPath(baseDir: string): string {
    return this.fsAdapter.join(baseDir, ConfigurationLoader.CONFIG_DIR);
  }
}
