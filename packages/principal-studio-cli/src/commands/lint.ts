/**
 * Lint command - DEPRECATED
 *
 * This command has been deprecated and now calls the `validate` command internally.
 * Please use `validate` directly for all validation needs.
 *
 * @deprecated Use `validate` command instead
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';

export function createLintCommand(): Command {
  const command = new Command('lint');

  command
    .description('DEPRECATED: Use `validate` instead. Validates Principal View files.')
    .argument(
      '[files...]',
      'Files or glob patterns to validate (defaults to .principal-views/**/*)'
    )
    .option('--library <path>', 'DEPRECATED: Path to component library file (ignored)')
    .option('-q, --quiet', 'Only output errors')
    .option('--json', 'Output results as JSON')
    .option('--rule <rules...>', 'DEPRECATED: Only run specific rules (ignored)')
    .option('--ignore-rule <rules...>', 'DEPRECATED: Skip specific rules (ignored)')
    .action(async (files: string[], options) => {
      // Show deprecation warning (unless JSON output or quiet mode)
      if (!options.json && !options.quiet) {
        console.log(
          chalk.yellow('⚠️  The `lint` command is deprecated and will be removed in a future version.')
        );
        console.log(chalk.yellow('   Please use `validate` instead.\n'));
      }

      // Warn about ignored options
      if (!options.json && !options.quiet) {
        const ignoredOptions: string[] = [];
        if (options.library) ignoredOptions.push('--library');
        if (options.rule) ignoredOptions.push('--rule');
        if (options.ignoreRule) ignoredOptions.push('--ignore-rule');

        if (ignoredOptions.length > 0) {
          console.log(
            chalk.dim(`   Note: ${ignoredOptions.join(', ')} option(s) are no longer supported and will be ignored.\n`)
          );
        }
      }

      // Build validate command arguments
      const validateArgs = ['validate'];
      if (files.length > 0) {
        validateArgs.push(...files);
      }
      if (options.quiet) {
        validateArgs.push('--quiet');
      }
      if (options.json) {
        validateArgs.push('--json');
      }

      // Spawn the validate command using the same CLI
      const child = spawn(process.execPath, [process.argv[1], ...validateArgs], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      child.on('close', (code) => {
        process.exit(code ?? 0);
      });

      child.on('error', (error) => {
        if (!options.json) {
          console.error(chalk.red('Error:'), error.message);
        } else {
          console.log(JSON.stringify({ error: error.message }));
        }
        process.exit(1);
      });
    });

  return command;
}
