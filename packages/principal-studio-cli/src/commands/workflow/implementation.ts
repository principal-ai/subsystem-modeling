import { Command } from 'commander';
import chalk from 'chalk';

export function createImplementationCommand(): Command {
  const command = new Command('implementation');

  command
    .description('Guide for implementing telemetry from workflow definitions')
    .action(() => {
      console.log(chalk.bold('\nWorkflow Implementation Guide'));
      console.log(chalk.bold('=============================\n'));

      console.log('A workflow.json defines how to instrument a single operation (span) in your code.\n');

      console.log(chalk.cyan.bold('SPAN (Workflow Level)'));
      console.log('  The workflow itself represents one span - the traced operation.');
      console.log('  - workflow.name      → span name');
      console.log('  - workflow.canvas    → the architectural context\n');

      console.log(chalk.cyan.bold('EVENTS (Scenario Level)'));
      console.log('  Each scenario represents an event that can occur during the span.');
      console.log('  - scenario.name              → event name');
      console.log('  - scenario.template.events   → attributes to capture\n');

      console.log(chalk.dim('Example mapping:'));
      console.log(chalk.dim('  workflow: "user-checkout"     →  span: "user-checkout"'));
      console.log(chalk.dim('  scenario: "payment-processed" →  event on that span'));
      console.log(chalk.dim('  scenario: "payment-failed"    →  event on that span\n'));

      console.log(chalk.yellow.bold('In your code:'));
      console.log('  1. Start the span when the operation begins');
      console.log('  2. Add events as scenarios occur');
      console.log('  3. End the span when the operation completes\n');

      console.log(chalk.green.bold('Example (OpenTelemetry JS):'));
      console.log(chalk.dim(`
  const span = tracer.startSpan('user-checkout');

  // When payment succeeds:
  span.addEvent('payment-processed', {
    'payment.amount': amount,
    'payment.method': method,
  });

  // When payment fails:
  span.addEvent('payment-failed', {
    'error.message': error.message,
  });

  span.end();
`));

      console.log(chalk.bold('Key Concepts:'));
      console.log('  - One workflow = one span (the operation being traced)');
      console.log('  - Multiple scenarios = multiple possible events on that span');
      console.log('  - Event attributes come from scenario.template.events');
      console.log('  - Node pv.status tracks implementation progress (draft → approved → implemented)\n');
    });

  return command;
}
