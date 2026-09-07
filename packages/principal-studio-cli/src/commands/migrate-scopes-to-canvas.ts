import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, relative } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import type {
  ExtendedCanvas,
  ComponentLibrary,
  ScopeDefinition,
  OtelScopeNode,
} from '@principal-ai/subsystems-core';

interface MigrateScopesOptions {
  dir?: string;
  force?: boolean;
  dryRun?: boolean;
  output?: string;
}

/**
 * Library type with deprecated scopes field - only used for migration
 */
interface LibraryWithDeprecatedScopes extends ComponentLibrary {
  scopes?: Record<string, ScopeDefinition>;
}

export function createMigrateScopesCommand(): Command {
  const command = new Command('scopes-to-canvas');

  command
    .description('Migrate scopes from library.yaml to .scopes.canvas')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--force', 'Overwrite existing scope nodes in canvas')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .option('-o, --output <path>', 'Output path for scopes canvas')
    .action(async (options: MigrateScopesOptions) => {
      const baseDir = resolve(options.dir || process.cwd());

      // 1. Load library.yaml
      const libraryPath = resolve(baseDir, '.principal-views/library.yaml');
      if (!existsSync(libraryPath)) {
        console.error(chalk.red('✗ Error: library.yaml not found at .principal-views/library.yaml'));
        process.exit(1);
      }

      const library = yaml.load(readFileSync(libraryPath, 'utf-8')) as LibraryWithDeprecatedScopes;

      if (!library.scopes || Object.keys(library.scopes).length === 0) {
        console.log(chalk.green('✓ No scopes section found - nothing to migrate'));
        return;
      }

      // 2. Find or create scopes canvas
      const scopesCanvasPath =
        options.output || findScopesCanvasPath(baseDir) || resolve(baseDir, '.principal-views/architecture.scopes.canvas');

      let scopesCanvas: ExtendedCanvas;
      const existingScopes: Set<string> = new Set();

      if (existsSync(scopesCanvasPath)) {
        scopesCanvas = JSON.parse(readFileSync(scopesCanvasPath, 'utf-8')) as ExtendedCanvas;

        // Track existing scopes
        for (const node of scopesCanvas.nodes || []) {
          if (node.type === 'otel-scope' && (node as OtelScopeNode).otel?.scope) {
            existingScopes.add((node as OtelScopeNode).otel!.scope);
          }
        }
      } else {
        scopesCanvas = {
          name: 'Instrumentation Scopes',
          description: 'Defines instrumentation scopes for the application',
          nodes: [],
          edges: [],
        };
      }

      // 3. Convert scopes to nodes
      const scopeEntries = Object.entries(library.scopes);
      const added: string[] = [];
      const skipped: string[] = [];
      const overwritten: string[] = [];

      // Calculate starting X position (append to right of existing nodes)
      let maxX = 0;
      for (const node of scopesCanvas.nodes || []) {
        const nodeMaxX = node.x + (node.width || 200);
        maxX = Math.max(maxX, nodeMaxX);
      }
      let x = maxX > 0 ? maxX + 50 : 0;

      for (const [scopeName, scopeDef] of scopeEntries) {
        const existsInCanvas = existingScopes.has(scopeName);

        if (existsInCanvas && !options.force) {
          skipped.push(scopeName);
          continue;
        }

        if (existsInCanvas && options.force) {
          // Remove existing node
          scopesCanvas.nodes =
            scopesCanvas.nodes?.filter(n => !(n.type === 'otel-scope' && (n as OtelScopeNode).otel?.scope === scopeName)) || [];
          overwritten.push(scopeName);
        } else {
          added.push(scopeName);
        }

        // Create new node
        const newNode: OtelScopeNode = {
          id: `${scopeName}-scope`,
          type: 'otel-scope',
          label: scopeDef.description || scopeName,
          color: scopeDef.color,
          description: scopeDef.description,
          x,
          y: 0,
          width: 200,
          height: 80,
          otel: {
            scope: scopeName,
          },
        };

        // Add icon if present
        if (scopeDef.icon) {
          newNode.icon = scopeDef.icon;
        }

        scopesCanvas.nodes = scopesCanvas.nodes || [];
        scopesCanvas.nodes.push(newNode);
        x += 250; // Space nodes horizontally
      }

      // 4. Report results
      console.log(chalk.bold('\nScope Migration Summary\n'));
      console.log('━'.repeat(60));

      if (added.length > 0) {
        console.log(chalk.green(`✓ Added ${added.length} scope(s):`));
        added.forEach(s => console.log(chalk.gray(`  • ${s}`)));
      }

      if (skipped.length > 0) {
        console.log(chalk.yellow(`\n⊘ Skipped ${skipped.length} scope(s) (already in canvas):`));
        skipped.forEach(s => console.log(chalk.gray(`  • ${s}`)));
        console.log(chalk.gray(`  Run with --force to overwrite existing nodes`));
      }

      if (overwritten.length > 0) {
        console.log(chalk.cyan(`\n↻ Overwritten ${overwritten.length} scope(s):`));
        overwritten.forEach(s => console.log(chalk.gray(`  • ${s}`)));
      }

      // 5. Write canvas (unless dry run)
      const relativePath = relative(baseDir, scopesCanvasPath);
      if (!options.dryRun) {
        writeFileSync(scopesCanvasPath, JSON.stringify(scopesCanvas, null, 2) + '\n');
        console.log(chalk.green(`\n✓ Wrote ${relativePath}`));
      } else {
        console.log(chalk.cyan(`\n[DRY RUN] Would write to: ${relativePath}`));
      }

      // 6. Next steps
      console.log(chalk.bold('\nNext Steps:'));
      console.log(chalk.gray('  1. Review the generated .scopes.canvas file'));
      console.log(chalk.gray('  2. Remove the "scopes:" section from library.yaml'));
      console.log(chalk.gray('  3. Run "pv validate" to verify the migration'));
      console.log();
    });

  return command;
}

/**
 * Find existing .scopes.canvas file in project
 */
function findScopesCanvasPath(baseDir: string): string | null {
  const candidates = ['.principal-views/architecture.scopes.canvas', '.principal-views/scopes.canvas'];

  for (const candidate of candidates) {
    const path = resolve(baseDir, candidate);
    if (existsSync(path)) return path;
  }

  return null;
}
