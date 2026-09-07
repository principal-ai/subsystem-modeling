/**
 * Migration command - Display the migration guide for moving from legacy flat structure to storyboards
 */

import { Command } from 'commander';
import chalk from 'chalk';

const MIGRATION_GUIDE = `
${chalk.bold.cyan('Migration Guide: Legacy Flat Structure → Storyboards')}

${chalk.bold('Overview')}

This guide will help you migrate from the legacy flat structure to the new
hierarchical storyboard structure for organizing Principal Views.

${chalk.yellow('Status:')} The legacy flat structure is ${chalk.bold('fully deprecated')} as of version 1.0.0
and will produce validation errors. Both structures are currently supported for
backward compatibility, but the flat structure is no longer recommended and will
be removed in v2.0.0.

${chalk.bold('Why Migrate?')}

${chalk.bold('Problems with Legacy Flat Structure:')}

The legacy flat structure stores all files directly in .principal-views/:

  .principal-views/
    ├── checkout-flow.otel.canvas
    ├── checkout-flow.workflow.json
    └── __executions__/
        ├── success-test.otel.json
        └── error-test.otel.json

${chalk.yellow('Limitations:')}
  • Hard to associate multiple workflows with one canvas
  • Hard to associate executions with specific workflows
  • No clear relationship between workflow and its test executions
  • Doesn't scale well with multiple workflows per feature area

${chalk.bold('Benefits of Storyboard Structure:')}

The new storyboard structure provides clear hierarchy:

  .principal-views/
    └── checkout-flow/                      # Storyboard folder
        ├── checkout-flow.otel.canvas       # Canvas definition
        ├── happy-path/                      # Workflow folder
        │   ├── happy-path.workflow.json    # Workflow definition
        │   ├── success-1.otel.json         # Execution files
        │   └── success-2.otel.json
        └── payment-failures/                # Another workflow
            ├── payment-failures.workflow.json
            ├── declined-1.otel.json
            └── timeout-1.otel.json

${chalk.green('Advantages:')}
  • ${chalk.bold('Clear Hierarchy:')} Storyboard → Workflows → Executions
  • ${chalk.bold('Multiple Workflows:')} Easy to have many workflow variations for one canvas
  • ${chalk.bold('Organized Executions:')} Each workflow has its own execution files
  • ${chalk.bold('Better Discoverability:')} Related files are co-located

${chalk.bold('Migration Steps')}

${chalk.bold('Step 1: Understand Your Current Structure')}

First, identify what you have in your current .principal-views/ directory:

  ${chalk.dim('$ ls -R .principal-views/')}

Look for:
  • Canvas files (.canvas or .otel.canvas)
  • Workflow files (.workflow.json)
  • Execution files (.otel.json) in __executions__/

${chalk.bold('Step 2: Plan Your Storyboard Organization')}

For each canvas file, decide:
  1. What is the storyboard name? (Usually the canvas basename)
  2. What workflows belong to this canvas?
  3. Which execution files belong to each workflow?

${chalk.bold('Step 3: Create Storyboard Folder Structure')}

For each canvas:

${chalk.bold('3.1. Create Storyboard Directory')}

  ${chalk.dim('# Example: migrating checkout-flow.otel.canvas')}
  ${chalk.cyan('$ mkdir -p .principal-views/checkout-flow')}

${chalk.bold('3.2. Move Canvas File')}

  ${chalk.cyan('$ mv .principal-views/checkout-flow.otel.canvas \\\\')}
  ${chalk.cyan('     .principal-views/checkout-flow/checkout-flow.otel.canvas')}

${chalk.bold('3.3. Create Workflow Folders')}

  ${chalk.dim('# Example: creating a happy-path workflow')}
  ${chalk.cyan('$ mkdir -p .principal-views/checkout-flow/happy-path')}

${chalk.bold('3.4. Create or Move Workflow File')}

If you have an existing workflow file:

  ${chalk.cyan('$ mv .principal-views/checkout-flow.workflow.json \\\\')}
  ${chalk.cyan('     .principal-views/checkout-flow/happy-path/happy-path.workflow.json')}

If you need to create a new workflow file:

  ${chalk.dim('{')}
  ${chalk.dim('  "version": "1.0.0",')}
  ${chalk.dim('  "canvas": "../checkout-flow.otel.canvas",')}
  ${chalk.dim('  "name": "Happy Path",')}
  ${chalk.dim('  "description": "Successful checkout flow",')}
  ${chalk.dim('  "mode": "test",')}
  ${chalk.dim('  "scenarios": [...]')}
  ${chalk.dim('}')}

${chalk.yellow('Important:')} The ${chalk.bold('canvas')} field must be a relative path pointing to
the parent canvas file.

${chalk.bold('3.5. Move Execution Files')}

Move execution files from __executions__/ into the appropriate workflow folder:

  ${chalk.cyan('$ mv .principal-views/__executions__/success-1.otel.json \\\\')}
  ${chalk.cyan('     .principal-views/checkout-flow/happy-path/success-1.otel.json')}

${chalk.bold('Step 4: Update Canvas References in Workflow Files')}

Ensure all workflow files have the correct relative canvas path:

  ${chalk.dim('{')}
  ${chalk.dim('  "canvas": "../checkout-flow.otel.canvas"')}
  ${chalk.dim('}')}

The path should use ${chalk.bold('..')} to reference the parent storyboard canvas.

${chalk.bold('Step 5: Cleanup Legacy Directories')}

Once all files are migrated, remove the old __executions__/ directory if empty:

  ${chalk.cyan('$ rmdir .principal-views/__executions__/')}

${chalk.bold('Step 6: Verify Migration')}

Check your new structure:

  ${chalk.cyan('$ tree .principal-views/')}

${chalk.bold('Complete Migration Example')}

${chalk.bold('Before (Legacy Flat Structure):')}

  .principal-views/
  ├── checkout.otel.canvas
  ├── checkout.workflow.json
  ├── refund.workflow.json
  └── __executions__/
      ├── checkout-success.otel.json
      ├── checkout-declined.otel.json
      └── refund-full.otel.json

${chalk.bold('After (Storyboard Structure):')}

  .principal-views/
  └── checkout/
      ├── checkout.otel.canvas
      ├── checkout-flow/
      │   ├── checkout-flow.workflow.json
      │   ├── checkout-success.otel.json
      │   └── checkout-declined.otel.json
      └── refund-flow/
          ├── refund-flow.workflow.json
          └── refund-full.otel.json

${chalk.bold('Common Issues and Solutions')}

${chalk.bold('Issue 1: Deprecation Errors')}

${chalk.red('Problem:')} You see errors like:
  "DEPRECATED: Legacy flat canvas structure is no longer supported"

${chalk.green('Solution:')} Follow this migration guide to move to the storyboard
structure immediately.

${chalk.bold('Issue 2: Canvas Reference Not Found')}

${chalk.red('Problem:')} Workflow files cannot find the canvas file.

${chalk.green('Solution:')} Update the "canvas" field in workflow.json to use the
correct relative path:
  ${chalk.dim('"canvas": "../storyboard-name.otel.canvas"')}

${chalk.bold('Issue 3: Executions Not Associated with Workflow')}

${chalk.red('Problem:')} Execution files in the old __executions__/ directory are
not linked to workflows.

${chalk.green('Solution:')} Move execution files into the appropriate workflow folder.

${chalk.bold('Best Practices')}

${chalk.bold('Naming Conventions:')}

  ${chalk.green('✓')} Storyboard Names: Use the feature or component name
     Examples: checkout-flow, user-authentication

  ${chalk.green('✓')} Workflow Names: Describe the scenario or test case
     Examples: happy-path, payment-failures, edge-cases

  ${chalk.green('✓')} Execution Files: Include scenario prefix or variant number
     Examples: success-1.otel.json, declined-card-1.otel.json

${chalk.bold('Timeline')}

  • v0.15.0: Legacy structure shows deprecation warnings
  • v1.0.0 (Current): Legacy structure produces validation errors
  • v2.0.0 (Future): Legacy structure will be completely removed

${chalk.bold('Getting Help')}

If you encounter issues during migration:

  1. Check this guide for common issues
  2. Run ${chalk.cyan('principal-ai doctor')} to check for configuration issues
  3. Run ${chalk.cyan('principal-ai validate')} to verify your structure
  4. Open an issue in the repository with your current file structure

${chalk.bold('Related Commands')}

  ${chalk.cyan('principal-ai doctor')}     - Check for configuration staleness and issues
  ${chalk.cyan('principal-ai validate')}   - Validate your Principal View files
  ${chalk.cyan('principal-ai init')}       - Initialize a new .principal-views directory
  ${chalk.cyan('principal-ai create')}     - Create new canvas or workflow files

${chalk.dim('For the full detailed guide with more examples, visit:')}
${chalk.dim('https://github.com/principal-ai/principal-view-core-library/blob/main/docs/MIGRATION_GUIDE.md')}
`;

export function createMigrationCommand(): Command {
  const command = new Command('migration');

  command
    .description('Display the migration guide for moving to storyboard structure')
    .alias('migrate')
    .action(() => {
      console.log(MIGRATION_GUIDE);
    });

  return command;
}
