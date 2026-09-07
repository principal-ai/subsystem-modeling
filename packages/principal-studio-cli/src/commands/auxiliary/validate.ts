import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  AuxiliaryManifestValidator,
  validateAreaScopeDisjoint,
  CanvasDiscovery,
} from '@principal-ai/subsystems-core/node';
import type {
  AuxiliaryManifest,
  AuxiliaryManifestViolation,
} from '@principal-ai/subsystems-core/node';
import type {
  ExtendedCanvas,
  DiscoveredCanvasWithContent,
} from '@principal-ai/subsystems-core';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
import { NodeFileSystemAdapter as RepoNodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';

interface ValidateOptions {
  json?: boolean;
  dir?: string;
}

const MANIFEST_RELATIVE_PATH = '.principal-views/auxiliary.manifest.json';

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate auxiliary.manifest.json against the filesystem and scope paths')
    .option('--json', 'Output as JSON')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();
        const manifestPath = MANIFEST_RELATIVE_PATH;
        const manifestFullPath = resolve(baseDir, manifestPath);

        if (!existsSync(manifestFullPath)) {
          if (options.json) {
            console.log(JSON.stringify({ valid: true, manifestPresent: false, violations: [] }, null, 2));
          } else {
            console.log(chalk.gray(`No ${manifestPath} found — auxiliary manifest is optional, nothing to validate.`));
          }
          return;
        }

        let manifest: AuxiliaryManifest;
        try {
          manifest = JSON.parse(readFileSync(manifestFullPath, 'utf-8')) as AuxiliaryManifest;
        } catch (err) {
          console.error(chalk.red('Error:'), `Failed to parse ${manifestPath}: ${(err as Error).message}`);
          process.exit(1);
        }

        const ownFileResult = await new AuxiliaryManifestValidator(new RepoNodeFileSystemAdapter()).validate({
          manifest,
          manifestPath,
          basePath: baseDir,
        });

        // Cross-check: areas must not overlap any scope path. Discover the
        // scopes canvas the same way `pv scopes validate` does.
        const service = new FilesystemService(new NodeFileSystemAdapter());
        const fileTree = await service.buildFileSystemTreeFromPath(baseDir);
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader: async (p: string) => readFileSync(resolve(baseDir, p), 'utf-8'),
          includeContent: true,
        });

        const scopesDiscovered = discoveryResult.canvases.find((c) => c.type === 'scopes');
        let scopesCanvas: ExtendedCanvas | undefined;
        let scopesCanvasPath: string | undefined;
        if (scopesDiscovered) {
          scopesCanvasPath = scopesDiscovered.path;
          const withContent = scopesDiscovered as DiscoveredCanvasWithContent;
          scopesCanvas = withContent.content;
          if (!scopesCanvas) {
            try {
              scopesCanvas = JSON.parse(readFileSync(resolve(baseDir, scopesDiscovered.path), 'utf-8')) as ExtendedCanvas;
            } catch {
              // leave undefined; cross-check will be skipped
            }
          }
        }

        const crossViolations = scopesCanvas
          ? validateAreaScopeDisjoint({ manifest, manifestPath, scopesCanvas, scopesCanvasPath })
          : [];

        const violations: AuxiliaryManifestViolation[] = [...ownFileResult.violations, ...crossViolations];
        const errors = violations.filter((v) => v.severity === 'error');
        const warnings = violations.filter((v) => v.severity === 'warn');
        const valid = errors.length === 0;

        if (options.json) {
          console.log(JSON.stringify({
            valid,
            manifestPresent: true,
            areaCount: (manifest.areas || []).length,
            violations,
          }, null, 2));
        } else {
          console.log(chalk.bold('\nAuxiliary Manifest Validation\n'));
          console.log('━'.repeat(60));

          console.log(chalk.bold('\nManifest:'));
          console.log(chalk.gray('  • File:'), manifestPath);
          console.log(chalk.gray('  • Areas:'), (manifest.areas || []).length);

          if (violations.length > 0) {
            console.log(chalk.bold('\nIssues:'));
            console.log('━'.repeat(60));
            for (const v of violations) {
              const label = v.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
              console.log(`\n${label}: ${v.message}`);
              if (v.path) console.log(chalk.gray(`  Location: ${v.path}`));
              if (v.impact) console.log(chalk.gray(`  Impact: ${v.impact}`));
              if (v.suggestion) console.log(chalk.cyan(`  Suggestion: ${v.suggestion}`));
            }
          }

          console.log(chalk.bold('\nSummary:'));
          if (valid) {
            console.log(chalk.green('  ✓ Auxiliary manifest is valid'));
          } else {
            console.log(chalk.red(`  ✗ ${errors.length} error(s)`));
          }
          if (warnings.length > 0) {
            console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s)`));
          }
          console.log();
        }

        if (!valid) process.exit(1);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
