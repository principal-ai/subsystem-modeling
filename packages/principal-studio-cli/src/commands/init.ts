/**
 * Init command - Initialize a .principal-views folder with template files and linting setup
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import type { ExtendedCanvas } from '@principal-ai/subsystems-core';

const TEMPLATE_CANVAS: ExtendedCanvas = {
  nodes: [],
  edges: [],
};

const HUSKY_PRE_COMMIT = `# Run principal view linting on staged .principal-views files
npx @principal-ai/principal-studio-cli lint --quiet
`;

/**
 * Check if we're in a git repository
 */
function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the git root directory
 */
function getGitRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if husky is already installed
 */
function isHuskyInstalled(gitRoot: string): boolean {
  return existsSync(join(gitRoot, '.husky'));
}

/**
 * Detect package manager
 */
function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (existsSync('bun.lockb')) return 'bun';
  if (existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (existsSync('yarn.lock')) return 'yarn';
  return 'npm';
}

export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('Initialize a .principal-views folder with template files and linting setup')
    .option('-f, --force', 'Overwrite existing files')
    .option('-n, --name <name>', 'Name for the canvas file', 'architecture')
    .option('--no-husky', 'Skip Husky pre-commit hook setup')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const principalViewsDir = join(cwd, '.principal-views');
        const canvasFile = join(principalViewsDir, `${options.name}.canvas`);
        const libraryFile = join(principalViewsDir, 'library.yaml');

        // Check if .principal-views directory exists
        if (!existsSync(principalViewsDir)) {
          mkdirSync(principalViewsDir, { recursive: true });
          console.log(chalk.green(`Created directory: .principal-views/`));
        }

        // Create canvas file
        if (existsSync(canvasFile) && !options.force) {
          console.log(
            chalk.yellow(`Canvas file already exists: .principal-views/${options.name}.canvas`)
          );
        } else {
          writeFileSync(canvasFile, JSON.stringify(TEMPLATE_CANVAS, null, 2));
          console.log(chalk.green(`Created canvas file: .principal-views/${options.name}.canvas`));
        }

        // Create library file
        if (existsSync(libraryFile) && !options.force) {
          console.log(chalk.yellow(`Library file already exists: .principal-views/library.yaml`));
        } else {
          const libraryYaml = `# Principal View Component Library
version: "1.0.0"
name: "Component Library"
description: "Component library for Principal View visualizations"

# Service resource registry
# Define all services in this repository with their OTEL resource attributes
# Each service configures its own resources at runtime, but declaring them here provides:
# - Service documentation/registry
# - Expected resource schema for validation
# - Dev workspace trace routing
#
# Example:
# resources:
#   my-service:
#     service.name: "my-service"
#     service.version: "1.0.0"
#     deployment.environment: "development"
#
resources: {}

nodeComponents: {}

edgeComponents: {}
`;
          writeFileSync(libraryFile, libraryYaml);
          console.log(chalk.green(`Created library file: .principal-views/library.yaml`));
        }

        // Set up Husky pre-commit hook
        let huskySetup = false;
        if (options.husky !== false) {
          if (!isGitRepo()) {
            console.log(chalk.yellow(`Skipping Husky setup: not a git repository`));
          } else {
            const gitRoot = getGitRoot();
            if (!gitRoot) {
              console.log(chalk.yellow(`Skipping Husky setup: could not find git root`));
            } else {
              const huskyDir = join(gitRoot, '.husky');
              const preCommitFile = join(huskyDir, 'pre-commit');

              if (isHuskyInstalled(gitRoot)) {
                // Husky is already installed, just add/update pre-commit hook
                if (existsSync(preCommitFile)) {
                  // Check if our hook is already in the file
                  const existingContent = readFileSync(preCommitFile, 'utf8');
                  if (
                    existingContent.includes('principal-view-cli lint')
                  ) {
                    console.log(
                      chalk.yellow(`Husky pre-commit hook already includes principal view linting`)
                    );
                  } else {
                    // Append our lint command to existing pre-commit
                    const updatedContent =
                      existingContent.trimEnd() +
                      '\n\n# Run principal view linting\nnpx @principal-ai/principal-studio-cli lint --quiet\n';
                    writeFileSync(preCommitFile, updatedContent);
                    console.log(
                      chalk.green(`Updated Husky pre-commit hook with principal view linting`)
                    );
                    huskySetup = true;
                  }
                } else {
                  // Create new pre-commit hook
                  writeFileSync(preCommitFile, HUSKY_PRE_COMMIT);
                  chmodSync(preCommitFile, '755');
                  console.log(chalk.green(`Created Husky pre-commit hook`));
                  huskySetup = true;
                }
              } else {
                // Husky is not installed, try to install it
                const pm = detectPackageManager();
                const packageJsonPath = join(gitRoot, 'package.json');

                if (!existsSync(packageJsonPath)) {
                  console.log(chalk.yellow(`Skipping Husky setup: no package.json found`));
                } else {
                  console.log(chalk.dim(`Installing Husky...`));

                  try {
                    // Install husky as dev dependency
                    const installCmd = {
                      npm: 'npm install --save-dev husky',
                      yarn: 'yarn add --dev husky',
                      pnpm: 'pnpm add --save-dev husky',
                      bun: 'bun add --dev husky',
                    }[pm];

                    execSync(installCmd, { stdio: 'inherit', cwd: gitRoot });

                    // Initialize husky
                    execSync('npx husky init', { stdio: 'inherit', cwd: gitRoot });

                    // Write our pre-commit hook
                    writeFileSync(preCommitFile, HUSKY_PRE_COMMIT);
                    chmodSync(preCommitFile, '755');
                    console.log(chalk.green(`Installed Husky and created pre-commit hook`));
                    huskySetup = true;
                  } catch (installError) {
                    console.log(
                      chalk.yellow(
                        `Could not install Husky automatically: ${(installError as Error).message}`
                      )
                    );
                    console.log(
                      chalk.dim(
                        `  You can install it manually: ${pm} add --dev husky && npx husky init`
                      )
                    );
                  }
                }
              }
            }
          }
        }

        console.log('');
        console.log(chalk.bold('Setup complete!'));
        console.log('');
        console.log(chalk.bold('Files created:'));
        console.log(
          `  • ${chalk.cyan('.principal-views/library.yaml')} - Component library definitions`
        );
        console.log(
          `  • ${chalk.cyan(`.principal-views/${options.name}.canvas`)} - Graph canvas file`
        );
        if (huskySetup) {
          console.log(`  • ${chalk.cyan('.husky/pre-commit')} - Pre-commit hook`);
        }

        console.log('');
        console.log(chalk.bold('Next steps:'));
        console.log(`  1. Define components in ${chalk.cyan('.principal-views/library.yaml')}`);
        console.log(
          `  2. Build your graph in ${chalk.cyan(`.principal-views/${options.name}.canvas`)}`
        );
        console.log(`  3. Run ${chalk.cyan('npx @principal-ai/principal-studio-cli lint')} to validate your configuration`);
        if (huskySetup) {
          console.log(`  4. Commits will now automatically lint .principal-views files`);
        }

        console.log('');
        console.log(chalk.bold('Commands:'));
        console.log(`  • ${chalk.cyan('npx @principal-ai/principal-studio-cli lint')} - Lint configuration files`);
        console.log(`  • ${chalk.cyan('npx @principal-ai/principal-studio-cli lint --json')} - Output lint results as JSON`);
        console.log(`  • ${chalk.cyan('npx @principal-ai/principal-studio-cli validate')} - Validate canvas files`);
        console.log(`  • ${chalk.cyan('npx @principal-ai/principal-studio-cli doctor')} - Check project setup`);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
