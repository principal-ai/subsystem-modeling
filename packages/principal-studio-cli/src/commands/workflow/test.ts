import { Command } from 'commander';
import chalk from 'chalk';
import { selectScenario, computeAggregates } from '@principal-ai/subsystems-core';
import {
  loadWorkflow,
  loadExecution,
  executionToEvents,
  resolvePath,
  formatValue,
} from './utils.js';

interface TestOptions {
  showAll?: boolean;
  showAggregates?: boolean;
  json?: boolean;
}

export function createTestCommand(): Command {
  const command = new Command('test');

  command
    .description('Test scenario matching and show why scenarios match or don\'t match')
    .argument('<workflow>', 'Path to .workflow.json file')
    .argument('<execution>', 'Path to .otel.json execution file')
    .option('--show-all', 'Show all scenarios (not just matches)')
    .option('--show-aggregates', 'Display computed aggregates')
    .option('--json', 'Output as JSON')
    .action(async (workflowPath: string, executionPath: string, options: TestOptions) => {
      try {
        const workflow = await loadWorkflow(resolvePath(workflowPath));
        const executionData = await loadExecution(resolvePath(executionPath));
        const events = executionToEvents(executionData);

        // Compute aggregates
        const aggregates = computeAggregates(events);

        // Select the winning scenario using enhanced matching
        const matchResult = selectScenario(workflow, events);

        if (options.json) {
          const output = {
            workflow: workflowPath,
            execution: executionPath,
            fullMatches: matchResult.fullMatches.map((m) => ({
              id: m.scenario.id,
              priority: m.scenario.priority,
              matchPercentage: m.matchPercentage,
              matchedEventCount: m.matchedEventCount,
              totalRequiredEvents: m.totalRequiredEvents,
              matchedEventNames: m.matchedEventNames,
              missingEventNames: m.missingEventNames,
            })),
            partialMatches: matchResult.partialMatches.map((m) => ({
              id: m.scenario.id,
              priority: m.scenario.priority,
              matchPercentage: m.matchPercentage,
              matchedEventCount: m.matchedEventCount,
              totalRequiredEvents: m.totalRequiredEvents,
              matchedEventNames: m.matchedEventNames,
              missingEventNames: m.missingEventNames,
            })),
            recommendedScenario: matchResult.recommendedScenario
              ? {
                  id: matchResult.recommendedScenario.scenario.id,
                  priority: matchResult.recommendedScenario.scenario.priority,
                  matchPercentage: matchResult.recommendedScenario.matchPercentage,
                  isFullMatch: matchResult.recommendedScenario.isFullMatch,
                }
              : null,
            totalTraceEvents: matchResult.totalTraceEvents,
            totalScenariosEvaluated: matchResult.totalScenariosEvaluated,
            aggregates: options.showAggregates ? aggregates : undefined,
          };

          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          console.log(chalk.bold(`\nTesting: ${workflowPath}`));
          console.log(chalk.gray(`Execution: ${executionPath}`));
          console.log(
            chalk.gray(
              `Total Events: ${matchResult.totalTraceEvents}, Scenarios Evaluated: ${matchResult.totalScenariosEvaluated}\n`
            )
          );

          console.log(chalk.bold('Scenario Matching Results:'));
          console.log('━'.repeat(60));

          // Show full matches
          if (matchResult.fullMatches.length > 0) {
            console.log(chalk.green.bold('\n✓ FULL MATCHES (100% coverage):'));
            for (const match of matchResult.fullMatches) {
              console.log(
                `\n  ${chalk.bold(match.scenario.id)} ${chalk.gray(`(priority: ${match.scenario.priority})`)}`
              );
              console.log(
                `  • Matched: ${match.matchedEventCount}/${match.totalRequiredEvents} events`
              );

              for (const eventName of match.matchedEventNames) {
                console.log(`    ${chalk.green('✓')} ${eventName}`);
              }
            }
          } else if (matchResult.partialMatches.length > 0) {
            console.log(chalk.yellow.bold('\n⚠ PARTIAL MATCHES:'));
            // Show top 5 partial matches
            const displayCount = options.showAll
              ? matchResult.partialMatches.length
              : Math.min(5, matchResult.partialMatches.length);

            for (const match of matchResult.partialMatches.slice(0, displayCount)) {
              const percentColor =
                match.matchPercentage >= 75
                  ? chalk.yellow
                  : match.matchPercentage >= 50
                    ? chalk.yellowBright
                    : chalk.gray;

              console.log(
                `\n  ${chalk.bold(match.scenario.id)} ${percentColor(`(${match.matchPercentage.toFixed(1)}%)`)} ${chalk.gray(`priority: ${match.scenario.priority}`)}`
              );
              console.log(
                `  • Matched: ${match.matchedEventCount}/${match.totalRequiredEvents}`
              );

              if (match.matchedEventNames.length > 0) {
                console.log(chalk.gray('    Matched:'));
                for (const eventName of match.matchedEventNames) {
                  console.log(`      ${chalk.green('✓')} ${eventName}`);
                }
              }

              if (match.missingEventNames.length > 0) {
                console.log(chalk.gray('    Missing:'));
                for (const eventName of match.missingEventNames) {
                  console.log(`      ${chalk.red('✗')} ${eventName}`);
                }
              }
            }

            if (
              !options.showAll &&
              matchResult.partialMatches.length > displayCount
            ) {
              console.log(
                chalk.gray(
                  `\n  ... and ${matchResult.partialMatches.length - displayCount} more partial matches (use --show-all to see all)`
                )
              );
            }
          } else {
            console.log(chalk.red('\n✗ No scenarios matched'));
          }

          console.log('\n' + '━'.repeat(60));

          if (matchResult.recommendedScenario) {
            const isFullMatch = matchResult.recommendedScenario.isFullMatch;
            const matchType = isFullMatch ? 'Full Match' : 'Partial Match';
            const percentage = matchResult.recommendedScenario.matchPercentage.toFixed(1);

            console.log(
              chalk.bold('\nRecommended Scenario:'),
              chalk.cyan(
                `${matchResult.recommendedScenario.scenario.id} (${matchType}, ${percentage}%)`
              )
            );
          } else {
            console.log(chalk.yellow('\nNo scenario selected'));
          }

          if (options.showAggregates) {
            console.log(chalk.bold('\nComputed Aggregates:'));
            for (const [key, value] of Object.entries(aggregates)) {
              console.log(chalk.gray('  •'), `${key}: ${formatValue(value)}`);
            }
          }

          console.log();
        }

        // Exit with error if no scenario matched
        if (!matchResult.recommendedScenario) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
