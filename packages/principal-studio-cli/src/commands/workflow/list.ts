import { Command } from 'commander';
import chalk from 'chalk';
import { access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { globby } from 'globby';
import { loadWorkflow } from './utils.js';

interface ListOptions {
  json?: boolean;
  showCanvas?: boolean;
}

export function createListCommand(): Command {
  const command = new Command('list');

  command
    .description('List all workflow files in project')
    .argument('[dir]', 'Directory to search (default: .principal-views/)')
    .option('--json', 'Output as JSON')
    .option('--show-canvas', 'Show linked canvas files')
    .action(async (dir: string | undefined, options: ListOptions) => {
      try {
        const searchDir = dir || '.principal-views';
        const searchPath = resolve(process.cwd(), searchDir);

        // Find all .workflow.json files
        const files = await globby('**/*.workflow.json', {
          cwd: searchPath,
          ignore: ['node_modules/**', '.git/**', '__executions__/**'],
        });

        // Load each workflow and check canvas existence
        const workflows = await Promise.all(
          files.map(async (file) => {
            const fullPath = join(searchPath, file);
            const workflow = await loadWorkflow(fullPath);

            let canvasExists: boolean | undefined;
            if (options.showCanvas && workflow.canvas) {
              const workflowDir = dirname(fullPath);
              const canvasPath = resolve(workflowDir, workflow.canvas);
              try {
                await access(canvasPath);
                canvasExists = true;
              } catch {
                canvasExists = false;
              }
            }

            return {
              file: join(searchDir, file),
              canvas: workflow.canvas,
              canvasExists,
              scenarioCount: workflow.scenarios.length,
              name: workflow.name,
            };
          })
        );

        if (options.json) {
          const output = {
            searchDir,
            count: workflows.length,
            workflows: workflows.map((n) => ({
              file: n.file,
              name: n.name,
              canvas: n.canvas,
              canvasExists: n.canvasExists,
              scenarios: n.scenarioCount,
            })),
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(chalk.bold('\nWorkflow Templates:'));
          console.log('━'.repeat(60));

          if (workflows.length === 0) {
            console.log(chalk.yellow(`\nNo workflow templates found in ${searchDir}`));
            console.log();
            return;
          }

          for (const workflow of workflows) {
            console.log(chalk.bold(`\n${workflow.file}`));
            if (workflow.name) {
              console.log(chalk.gray(`  Name: ${workflow.name}`));
            }
            if (options.showCanvas && workflow.canvas) {
              const status = workflow.canvasExists
                ? chalk.green('✓')
                : chalk.red('✗');
              console.log(chalk.gray(`  Canvas: ${workflow.canvas} ${status}`));
            } else if (workflow.canvas) {
              console.log(chalk.gray(`  Canvas: ${workflow.canvas}`));
            }
            console.log(
              chalk.gray(
                `  Scenarios: ${workflow.scenarioCount}`
              )
            );
          }

          console.log(
            chalk.bold(`\nFound ${workflows.length} workflow template(s)`)
          );
          console.log();
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
