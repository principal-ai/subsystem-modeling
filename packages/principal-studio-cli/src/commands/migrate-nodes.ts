/**
 * Migrate Canvas Node Types
 *
 * Transforms canvas files from the legacy format (type: "text" + pv.nodeType)
 * to the new semantic format (type: "otel-event", "otel-scope", etc.)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, relative, dirname, basename } from 'node:path';
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import type { ExtendedCanvas, ExtendedCanvasNode, PVNodeExtension } from '@principal-ai/subsystems-core';

interface MigrateOptions {
  dryRun?: boolean;
  backup?: boolean;
  dir?: string;
  verbose?: boolean;
}

interface MigrationResult {
  path: string;
  nodesTransformed: number;
  nodesSkipped: number;
  errors: string[];
  backup?: string;
}

/**
 * Strip markdown formatting from a string
 * Removes: **bold**, *italic*, __underline__, # headers, `code`, [links](url)
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')           // Remove bold **
    .replace(/\*/g, '')             // Remove italic *
    .replace(/__/g, '')             // Remove underline __
    .replace(/_/g, ' ')             // Replace _ with space
    .replace(/^#+\s*/gm, '')        // Remove headers
    .replace(/`/g, '')              // Remove code backticks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Replace [text](url) with text
    .trim();
}

// Node type mapping from pv.nodeType to new type
const NODE_TYPE_MAP: Record<string, string> = {
  'event': 'otel-event',
  'span': 'otel-span-convention',
  'span-convention': 'otel-span-convention',
  'scope': 'otel-scope',
  'resource': 'otel-resource',
  'boundary': 'otel-boundary',
};

/**
 * Transform a legacy node to the new format
 */
function transformNode(node: ExtendedCanvasNode): { transformed: ExtendedCanvasNode; changed: boolean } {
  // Only transform text nodes with pv.nodeType
  if (node.type !== 'text' || !node.pv?.nodeType) {
    return { transformed: node, changed: false };
  }

  const nodeType = node.pv.nodeType;
  const newType = NODE_TYPE_MAP[nodeType];

  if (!newType) {
    // Unknown nodeType, skip
    return { transformed: node, changed: false };
  }

  const pv = node.pv as PVNodeExtension;

  // Build the new node
  const newNode: Record<string, unknown> = {
    id: node.id,
    type: newType,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    color: node.color,
  };

  // Add label from pv.name (required for all otel-* nodes)
  // Strip markdown formatting from label
  const rawLabel = pv.name || (node as { text?: string }).text?.split('\n')[0]?.replace(/^#+ /, '').substring(0, 50) || 'Unnamed';
  const label = stripMarkdown(rawLabel);
  newNode.label = label;

  // Transfer visual properties
  if (pv.icon) newNode.icon = pv.icon;
  if (pv.fill) newNode.fill = pv.fill;
  if (pv.stroke) newNode.stroke = pv.stroke;
  if (pv.shape) newNode.shape = pv.shape;

  // Handle type-specific fields
  switch (newType) {
    case 'otel-event': {
      // Transfer event schema
      if (pv.event) {
        newNode.event = pv.event;
      }
      if (pv.eventRef) {
        newNode.eventRef = pv.eventRef;
      }
      if (pv.dataSchema) {
        newNode.dataSchema = pv.dataSchema;
      }

      // Build otel metadata
      const otel: Record<string, unknown> = {};
      if (pv.status) otel.status = pv.status;
      if (pv.otel?.scope) otel.scope = pv.otel.scope;
      if (pv.otel?.files) otel.files = pv.otel.files;
      if (pv.otel?.origin) otel.origin = pv.otel.origin;
      if (pv.otel?.references) otel.references = pv.otel.references;

      if (Object.keys(otel).length > 0) {
        newNode.otel = otel;
      }
      break;
    }

    case 'otel-span-convention': {
      // Description for span nodes
      if (pv.description) {
        newNode.description = pv.description;
      }

      // Build otel metadata (spanPattern required)
      const otel: Record<string, unknown> = {};
      if (pv.status) otel.status = pv.status;
      if (pv.otel?.spanPattern) otel.spanPattern = pv.otel.spanPattern;
      if (pv.otel?.spanKind) otel.spanKind = pv.otel.spanKind;
      if (pv.otel?.spanMatch) otel.spanMatch = pv.otel.spanMatch;
      if (pv.otel?.scope) otel.scope = pv.otel.scope;
      if (pv.otel?.files) otel.files = pv.otel.files;
      if (pv.otel?.origin) otel.origin = pv.otel.origin;
      if (pv.otel?.references) otel.references = pv.otel.references;

      newNode.otel = otel;
      break;
    }

    case 'otel-scope': {
      // Description for scope nodes
      if (pv.description) {
        newNode.description = pv.description;
      }

      // Build otel metadata (scope required)
      const otel: Record<string, unknown> = {};
      if (pv.status) otel.status = pv.status;
      if (pv.otel?.scope) otel.scope = pv.otel.scope;
      if (pv.otel?.files) otel.files = pv.otel.files;
      if (pv.otel?.origin) otel.origin = pv.otel.origin;
      if (pv.otel?.references) otel.references = pv.otel.references;

      newNode.otel = otel;
      break;
    }

    case 'otel-resource': {
      // Description for resource nodes
      if (pv.description) {
        newNode.description = pv.description;
      }

      // Build otel metadata (resourceMatch required)
      const otel: Record<string, unknown> = {};
      if (pv.status) otel.status = pv.status;
      if (pv.otel?.resourceMatch) otel.resourceMatch = pv.otel.resourceMatch;
      if (pv.otel?.scope) otel.scope = pv.otel.scope;
      if (pv.otel?.files) otel.files = pv.otel.files;
      if (pv.otel?.origin) otel.origin = pv.otel.origin;
      if (pv.otel?.references) otel.references = pv.otel.references;

      newNode.otel = otel;
      break;
    }

    case 'otel-boundary': {
      // Description for boundary nodes
      if (pv.description) {
        newNode.description = pv.description;
      }

      // Build otel metadata
      const otel: Record<string, unknown> = {};
      if (pv.status) otel.status = pv.status;
      if (pv.otel?.scope) otel.scope = pv.otel.scope;
      if (pv.otel?.files) otel.files = pv.otel.files;
      if (pv.otel?.origin) otel.origin = pv.otel.origin;
      if (pv.otel?.references) otel.references = pv.otel.references;

      if (Object.keys(otel).length > 0) {
        newNode.otel = otel;
      }

      // Transfer boundary data
      if (pv.boundary) {
        newNode.boundary = pv.boundary;
      }
      break;
    }
  }

  return { transformed: newNode as unknown as ExtendedCanvasNode, changed: true };
}

/**
 * Migrate a single canvas file
 */
function migrateCanvas(filePath: string, options: MigrateOptions): MigrationResult {
  const result: MigrationResult = {
    path: filePath,
    nodesTransformed: 0,
    nodesSkipped: 0,
    errors: [],
  };

  try {
    // Read the canvas file
    const content = readFileSync(filePath, 'utf-8');
    const canvas: ExtendedCanvas = JSON.parse(content);

    if (!canvas.nodes || canvas.nodes.length === 0) {
      return result;
    }

    // Transform each node
    const newNodes: ExtendedCanvasNode[] = [];
    for (const node of canvas.nodes) {
      const { transformed, changed } = transformNode(node);
      newNodes.push(transformed);

      if (changed) {
        result.nodesTransformed++;
        if (options.verbose) {
          // If changed, we know it was a text node with pv.nodeType
          const oldType = (node.type === 'text' && 'pv' in node && node.pv?.nodeType)
            ? `text+${node.pv.nodeType}`
            : node.type;
          console.log(chalk.gray(`  • Transformed node "${node.id}" from ${oldType} to ${transformed.type}`));
        }
      } else {
        result.nodesSkipped++;
      }
    }

    // Only write if there were changes
    if (result.nodesTransformed > 0) {
      // Create backup if requested
      if (options.backup && !options.dryRun) {
        const backupPath = filePath + '.backup';
        copyFileSync(filePath, backupPath);
        result.backup = backupPath;
      }

      // Write the migrated canvas
      if (!options.dryRun) {
        const newCanvas = { ...canvas, nodes: newNodes };
        // Preserve the original formatting (2-space indent)
        writeFileSync(filePath, JSON.stringify(newCanvas, null, 2) + '\n');
      }
    }
  } catch (error) {
    result.errors.push((error as Error).message);
  }

  return result;
}

/**
 * Find all canvas files in a directory
 */
function findCanvasFiles(dir: string): string[] {
  const files: string[] = [];

  function walkDir(currentPath: string) {
    const entries = readdirSync(currentPath);
    for (const entry of entries) {
      // Skip node_modules and hidden directories
      if (entry === 'node_modules' || entry.startsWith('.')) {
        continue;
      }

      const fullPath = resolve(currentPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.endsWith('.canvas') || entry.endsWith('.otel.canvas')) {
        files.push(fullPath);
      }
    }
  }

  walkDir(dir);
  return files;
}

export function createMigrateNodesCommand(): Command {
  const command = new Command('migrate-nodes');

  command
    .description('Migrate canvas files from legacy node format to new semantic types')
    .argument('[path]', 'Path to canvas file or directory (default: .principal-views)')
    .option('--dry-run', 'Show what would be changed without modifying files')
    .option('--no-backup', 'Do not create backup files')
    .option('-d, --dir <path>', 'Base directory (default: cwd)')
    .option('-v, --verbose', 'Show detailed transformation info')
    .action(async (path: string | undefined, options: MigrateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();
        const targetPath = path ? resolve(baseDir, path) : resolve(baseDir, '.principal-views');

        if (!existsSync(targetPath)) {
          console.error(chalk.red('Error:'), `Path not found: ${targetPath}`);
          process.exit(1);
        }

        // Find canvas files
        let canvasFiles: string[];
        const stat = statSync(targetPath);

        if (stat.isDirectory()) {
          canvasFiles = findCanvasFiles(targetPath);
          console.log(chalk.bold(`\nMigrating canvas files in: ${relative(baseDir, targetPath)}\n`));
        } else {
          canvasFiles = [targetPath];
          console.log(chalk.bold(`\nMigrating canvas file: ${relative(baseDir, targetPath)}\n`));
        }

        if (canvasFiles.length === 0) {
          console.log(chalk.yellow('No canvas files found.'));
          return;
        }

        if (options.dryRun) {
          console.log(chalk.cyan('Dry run mode - no files will be modified\n'));
        }

        // Migrate each file
        let totalTransformed = 0;
        let totalSkipped = 0;
        let filesModified = 0;

        for (const filePath of canvasFiles) {
          const relativePath = relative(baseDir, filePath);
          const result = migrateCanvas(filePath, { ...options, backup: options.backup !== false });

          if (result.errors.length > 0) {
            console.log(chalk.red('✗'), relativePath);
            for (const error of result.errors) {
              console.log(chalk.red(`  Error: ${error}`));
            }
            continue;
          }

          if (result.nodesTransformed > 0) {
            filesModified++;
            console.log(chalk.green('✓'), relativePath);
            console.log(chalk.gray(`  ${result.nodesTransformed} node(s) transformed, ${result.nodesSkipped} skipped`));
            if (result.backup) {
              console.log(chalk.gray(`  Backup: ${relative(baseDir, result.backup)}`));
            }
          } else if (options.verbose) {
            console.log(chalk.gray('○'), relativePath, chalk.gray('(no changes needed)'));
          }

          totalTransformed += result.nodesTransformed;
          totalSkipped += result.nodesSkipped;
        }

        // Summary
        console.log(chalk.bold('\nSummary:'));
        console.log(chalk.gray(`  • Files processed: ${canvasFiles.length}`));
        console.log(chalk.gray(`  • Files modified: ${filesModified}`));
        console.log(chalk.gray(`  • Nodes transformed: ${totalTransformed}`));
        console.log(chalk.gray(`  • Nodes skipped: ${totalSkipped}`));

        if (options.dryRun && totalTransformed > 0) {
          console.log(chalk.cyan('\nRun without --dry-run to apply changes.'));
        }

        console.log();
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
